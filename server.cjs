#!/usr/bin/env node
// Grid Vector Racer v0.9.5 — zero-dependency HTTP + WebSocket server.
// Production TLS (wss://) is expected to terminate at the hosting platform/reverse proxy.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {Pool}=require('pg');
const ROOT=__dirname,PORT=Number(process.env.PORT||8080),rooms=new Map(),MAX_SPEED=8,MAX_MESSAGE=32768,RECONNECT_MS=90000;
const DATABASE_URL=String(process.env.DATABASE_URL||'').trim();
const db=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000}):null;
const DIRS=[{x:0,y:-1},{x:1,y:-1},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1}];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg'};
const TrackClassPromise=import('./src/track.js?v=095-server').then(m=>m.Track);
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
function originAllowed(req){if(!ALLOWED_ORIGINS.length)return true;const o=String(req.headers.origin||'');return ALLOWED_ORIGINS.some(x=>x===o)}
async function serve(req,res){
  const u=new URL(String(req.url||'/'),'http://localhost'),pathname=decodeURIComponent(u.pathname);
  if(pathname==='/health'){
    let dbOk=false;
    if(db){try{await db.query('select 1');dbOk=true}catch{dbOk=false}}
    return res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ok:true,rooms:rooms.size,version:'0.9.6-db',database:dbOk}));
  }
  if(pathname==='/api/leaderboard'&&req.method==='GET'){
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cache-Control','no-store');
    if(!db)return res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,error:'database-not-configured'}));
    const sort=String(u.searchParams.get('sort')||'rating');const limit=Math.max(1,Math.min(100,Number(u.searchParams.get('limit')||20)||20));
    const order=sort==='wins'?'wins DESC, rating DESC, id ASC':sort==='time'?'best_time_ms ASC NULLS LAST, rating DESC, id ASC':'rating DESC, wins DESC, id ASC';
    try{const q=await db.query(`SELECT id,display_name,rating,wins,losses,races,best_time_ms FROM players ORDER BY ${order} LIMIT $1`,[limit]);return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true,sort,entries:q.rows}))}
    catch(e){return res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,error:'database-query-failed'}))}
  }
  if(pathname==='/ws')return;
  let f=path.join(ROOT,pathname==='/'?'index.html':pathname.replace(/^\//,''));if(!f.startsWith(ROOT))return res.writeHead(403).end();
  fs.stat(f,(err,st)=>{if(err||!st.isFile())return res.writeHead(404).end('Not found');res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(f).pipe(res)})
}
const server=http.createServer(serve);
function frame(text){const payload=Buffer.from(text),n=payload.length;let head;if(n<126){head=Buffer.alloc(2);head[0]=0x81;head[1]=n}else if(n<65536){head=Buffer.alloc(4);head[0]=0x81;head[1]=126;head.writeUInt16BE(n,2)}else{head=Buffer.alloc(10);head[0]=0x81;head[1]=127;head.writeBigUInt64BE(BigInt(n),2)}return Buffer.concat([head,payload])}
function decode(buf){if(buf.length<2)return null;const opcode=buf[0]&15;if(opcode===8)return{close:true,used:buf.length};let len=buf[1]&127,off=2;if(len===126){if(buf.length<4)return null;len=buf.readUInt16BE(2);off=4}else if(len===127){if(buf.length<10)return null;len=Number(buf.readBigUInt64BE(2));off=10}if(len>MAX_MESSAGE)return{tooBig:true,used:buf.length};const masked=!!(buf[1]&128);let mask;if(masked){if(buf.length<off+4)return null;mask=buf.slice(off,off+4);off+=4}if(buf.length<off+len)return null;const p=Buffer.from(buf.slice(off,off+len));if(mask)for(let i=0;i<p.length;i++)p[i]^=mask[i%4];return{data:p.toString('utf8'),used:off+len}}
function send(ws,obj){if(!ws||ws.destroyed)return;try{ws.write(frame(JSON.stringify(obj)))}catch{}}
function broadcast(r,obj){for(const p of r.players)if(p.ws&&!p.ws.destroyed)send(p.ws,obj)}
function roomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<5;i++)s+=chars[Math.floor(Math.random()*chars.length)];return rooms.has(s)?roomCode():s}
function safeName(name){return String(name||'Player').replace(/[<>\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,18)||'Player'}
function token(){return crypto.randomBytes(18).toString('base64url')}
function player(id,name,ws){return{id,name:safeName(name),ws,resumeToken:token(),disconnectTimer:null,pos:{x:21,y:63},heading:0,speed:1,movesMade:0,forceOne:false,crashes:0}}
function roomState(r){return{seed:r.seed||0,started:!!r.started,turn:r.turn||0,startTurn:r.startTurn??0,turnNo:r.turnNo||1,hostId:r.hostId,players:r.players.map(p=>({id:p.id,name:p.name,pos:p.pos,heading:p.heading??0,speed:p.speed??1,movesMade:p.movesMade||0,forceOne:!!p.forceOne,crashes:p.crashes||0,connected:!!p.ws}))}}
function roomMessage(r){return{type:'room',room:r.id,hostId:r.hostId,state:roomState(r)}}
function turnDiff(a,b){let d=((b-a)%8+8)%8;if(d>4)d-=8;return d}
function detachSocket(ws){const rid=ws.room;if(!rid)return;const r=rooms.get(rid),p=r?.players.find(x=>x.id===ws.pid);if(!r||!p||p.ws!==ws)return;p.ws=null;ws.room=null;ws.pid=null;clearTimeout(p.disconnectTimer);p.disconnectTimer=setTimeout(()=>removePlayer(r,p.id),RECONNECT_MS);broadcast(r,roomMessage(r))}
function removePlayer(r,id){const idx=r.players.findIndex(p=>p.id===id);if(idx<0)return;const p=r.players[idx];clearTimeout(p.disconnectTimer);r.players.splice(idx,1);if(!r.players.length){rooms.delete(r.id);return}if(r.hostId===id)r.hostId=r.players.find(x=>x.ws)?.id||r.players[0].id;if(r.started){if(idx<r.turn)r.turn--;else if(idx===r.turn&&r.turn>=r.players.length)r.turn=0;r.startTurn=Math.min(r.startTurn??0,Math.max(0,r.players.length-1))}broadcast(r,roomMessage(r));if(r.started)broadcast(r,{type:'state',state:roomState(r)})}
function explicitLeave(ws){const r=rooms.get(ws.room);if(r)removePlayer(r,ws.pid);ws.room=null;ws.pid=null}
function attach(ws){ws._buf=Buffer.alloc(0);ws._rate={at:Date.now(),count:0};ws.on('data',chunk=>{ws._buf=Buffer.concat([ws._buf,chunk]);if(ws._buf.length>MAX_MESSAGE*2){ws.destroy();return}while(true){const d=decode(ws._buf);if(!d)break;if(d.tooBig){ws.destroy();break}if(d.close){ws.end();break}ws._buf=ws._buf.slice(d.used);const now=Date.now();if(now-ws._rate.at>10000)ws._rate={at:now,count:0};if(++ws._rate.count>120){send(ws,{type:'error',message:'Слишком много запросов'});ws.destroy();break}let m;try{m=JSON.parse(d.data)}catch{continue}if(!m||typeof m!=='object')continue;handle(ws,m).catch(()=>send(ws,{type:'error',message:'Ошибка сервера'}))}});ws.on('close',()=>detachSocket(ws));ws.on('error',()=>detachSocket(ws))}
async function handle(ws,m){
  if(m.type==='create'){
    explicitLeave(ws);const id=crypto.randomBytes(6).toString('hex'),rid=roomCode(),p=player(id,m.name,ws),r={id:rid,hostId:id,players:[p],started:false,turn:0,turnNo:1,startTurn:0};rooms.set(rid,r);ws.room=rid;ws.pid=id;send(ws,{type:'welcome',room:rid,playerId:id,host:true,hostId:id,resumeToken:p.resumeToken,state:roomState(r)});return
  }
  if(m.type==='join'){
    explicitLeave(ws);const rid=String(m.room||'').toUpperCase(),r=rooms.get(rid);if(!r)return send(ws,{type:'error',message:'Комната не найдена'});if(r.started)return send(ws,{type:'error',message:'Гонка уже началась'});if(r.players.length>=4)return send(ws,{type:'error',message:'В комнате уже 4 игрока'});const id=crypto.randomBytes(6).toString('hex'),p=player(id,m.name,ws);r.players.push(p);ws.room=rid;ws.pid=id;send(ws,{type:'welcome',room:rid,playerId:id,host:false,hostId:r.hostId,resumeToken:p.resumeToken,state:roomState(r)});broadcast(r,roomMessage(r));return
  }
  if(m.type==='resume'){
    const rid=String(m.room||'').toUpperCase(),r=rooms.get(rid),p=r?.players.find(x=>x.id===String(m.playerId||''));if(!r||!p||!p.resumeToken||p.resumeToken!==String(m.resumeToken||''))return send(ws,{type:'error',message:'Не удалось восстановить комнату'});if(p.ws&&p.ws!==ws){try{p.ws.destroy()}catch{}}clearTimeout(p.disconnectTimer);p.disconnectTimer=null;p.ws=ws;ws.room=rid;ws.pid=p.id;send(ws,{type:'resumed',room:rid,playerId:p.id,host:r.hostId===p.id,hostId:r.hostId,resumeToken:p.resumeToken,state:roomState(r)});broadcast(r,roomMessage(r));return
  }
  if(m.type==='leave'){explicitLeave(ws);return}
  const r=rooms.get(ws.room);if(!r)return send(ws,{type:'error',message:'Сначала создай или введи комнату'});
  if(m.type==='start'){
    if(ws.pid!==r.hostId)return send(ws,{type:'error',message:'Только создатель комнаты запускает гонку'});if(r.started)return;const connected=r.players.filter(p=>p.ws);if(!connected.length)return;
    // Room contains only live lobby players when starting.
    r.players=r.players.filter(p=>p.ws);r.seed=Number(m.seed)||Date.now();const Track=await TrackClassPromise;r.track=new Track(r.seed,4,false);r.started=true;r.startTurn=Math.floor(Math.random()*r.players.length);r.turn=r.startTurn;r.turnNo=1;const offsets=[0,-1,1,-2],normal=r.track.path[0]?.normal||{x:1,y:0},heading=r.track.path[0]?.heading??0;r.players.forEach((p,i)=>{p.pos={x:Math.round(r.track.start.x+normal.x*offsets[i]),y:Math.round(r.track.start.y+normal.y*offsets[i])};p.heading=heading;p.speed=1;p.movesMade=0;p.forceOne=false;p.crashes=0});broadcast(r,{type:'started',state:roomState(r)});return
  }
  if(m.type==='move'){
    if(!r.started)return;const p=r.players[r.turn];if(!p||p.id!==ws.pid)return send(ws,{type:'error',message:'Сейчас ход другого игрока'});
    const heading=Number(m.heading),speed=Number(m.speed);if(!Number.isInteger(heading)||heading<0||heading>7||!Number.isInteger(speed)||speed<1||speed>MAX_SPEED)return send(ws,{type:'error',message:'Недопустимый ход'});if(Math.abs(turnDiff(p.heading,heading))>1)return send(ws,{type:'error',message:'Поворот больше 45° запрещён'});
    const allowed=((p.movesMade||0)===0||p.forceOne)?[1]:[Math.max(1,p.speed-1),p.speed,Math.min(MAX_SPEED,p.speed+1)];if(!allowed.includes(speed))return send(ws,{type:'error',message:'Скорость можно менять только на одну клетку'});const d=DIRS[heading],target={x:p.pos.x+d.x*speed,y:p.pos.y+d.y*speed};if(Number(m.target?.x)!==target.x||Number(m.target?.y)!==target.y)return send(ws,{type:'error',message:'Недопустимый узел сетки'});
    const from={...p.pos},seg=r.track.segmentCheckMove(from,target),finishT=r.track.finishCrossingFraction(from,target),den=Math.max(1e-9,(target.x-from.x)**2+(target.y-from.y)**2),segT=seg.ok?Infinity:Math.max(0,Math.min(1,((seg.impact.x-from.x)*(target.x-from.x)+(seg.impact.y-from.y)*(target.y-from.y))/den)),finishFirst=finishT!==null&&finishT<=segT+1e-6;p.heading=heading;p.movesMade++;if(finishFirst){p.pos={x:from.x+(target.x-from.x)*finishT,y:from.y+(target.y-from.y)*finishT};p.speed=speed;p.forceOne=false}else if(seg.ok){p.pos=target;p.speed=speed;p.forceOne=false}else{p.pos={...seg.lastGrid};p.speed=1;p.forceOne=true;p.crashes++}
    r.turn=(r.turn+1)%r.players.length;if(r.turn===r.startTurn)r.turnNo++;broadcast(r,{type:'state',state:roomState(r)});return
  }
}
server.on('upgrade',(req,socket)=>{if(String(req.url||'').split('?')[0]!=='/ws'||!originAllowed(req)){socket.destroy();return}const key=req.headers['sec-websocket-key'];if(!key){socket.destroy();return}const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');attach(socket)});
server.listen(PORT,'0.0.0.0',()=>console.log(`Grid Vector Racer v0.9.6 DB server: http://localhost:${PORT} (WebSocket /ws)`));
