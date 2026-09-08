#!/usr/bin/env node
// Grid Vector Racer v0.9.7 — online rooms + Neon global leaderboard.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {Pool}=require('pg');

const ROOT=__dirname;
const PORT=Number(process.env.PORT||8080);
const rooms=new Map();
const MAX_SPEED=8,MAX_MESSAGE=32768,RECONNECT_MS=90000;
const DATABASE_URL=String(process.env.DATABASE_URL||'').trim();
const db=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000}):null;
const DIRS=[{x:0,y:-1},{x:1,y:-1},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1}];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg'};
const TrackClassPromise=import('./src/track.js?v=097-server').then(m=>m.Track);
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);

function originAllowed(req){if(!ALLOWED_ORIGINS.length)return true;const o=String(req.headers.origin||'');return ALLOWED_ORIGINS.some(x=>x===o)}
function apiCors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Cache-Control','no-store')}
function json(res,status,obj){apiCors(res);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(obj))}
function readJson(req,limit=16384){return new Promise((resolve,reject)=>{let size=0,raw='';req.setEncoding('utf8');req.on('data',c=>{size+=c.length;if(size>limit){reject(new Error('body-too-large'));req.destroy();return}raw+=c});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(new Error('bad-json'))}});req.on('error',reject)})}
function safeName(name){return String(name||'Player').replace(/[<>\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,18)||'Player'}
function safePlatform(v){v=String(v||'web').toLowerCase();return ['yandex','android','web'].includes(v)?v:'web'}
function safePlatformId(v){return String(v||'').replace(/[<>\u0000-\u001f\s]/g,'').slice(0,160)}
function safeAvatar(v){v=String(v||'').trim();return /^https:\/\//i.test(v)?v.slice(0,600):null}
function orderFor(sort){return sort==='wins'?'wins DESC, rating DESC, races ASC, id ASC':sort==='time'?'best_time_ms ASC NULLS LAST, rating DESC, id ASC':'rating DESC, wins DESC, races ASC, id ASC'}

async function upsertPlayer(identity={},fallbackName='Player'){
  if(!db)return null;
  const platform=safePlatform(identity.platform),platformUserId=safePlatformId(identity.platformUserId||identity.id);
  if(!platformUserId)return null;
  const displayName=safeName(identity.displayName||fallbackName),avatarUrl=safeAvatar(identity.avatarUrl);
  const q=await db.query(`
    INSERT INTO players(platform,platform_user_id,display_name,avatar_url,last_seen_at)
    VALUES($1,$2,$3,$4,now())
    ON CONFLICT(platform,platform_user_id) DO UPDATE SET
      display_name=EXCLUDED.display_name,
      avatar_url=COALESCE(EXCLUDED.avatar_url,players.avatar_url),
      last_seen_at=now()
    RETURNING id,platform,platform_user_id,display_name,avatar_url,rating,wins,losses,races,best_time_ms,premium,pro_until
  `,[platform,platformUserId,displayName,avatarUrl]);
  return q.rows[0]||null;
}
async function playerRank(playerId,sort='rating'){
  if(!db||!playerId)return null;const order=orderFor(sort);
  const q=await db.query(`WITH ranked AS (SELECT id,ROW_NUMBER() OVER (ORDER BY ${order})::int AS rank FROM players WHERE races>0) SELECT rank FROM ranked WHERE id=$1`,[playerId]);
  return q.rows[0]?.rank??null;
}
async function leaderboard(sort='rating',limit=20,mePlatform='',meId=''){
  const order=orderFor(sort);
  const top=await db.query(`SELECT ROW_NUMBER() OVER (ORDER BY ${order})::int AS rank,id,display_name,rating,wins,losses,races,best_time_ms FROM players WHERE races>0 ORDER BY ${order} LIMIT $1`,[limit]);
  let me=null;
  const pid=safePlatformId(meId);
  if(pid){const platform=safePlatform(mePlatform);const q=await db.query(`WITH ranked AS (SELECT id,platform,platform_user_id,display_name,rating,wins,losses,races,best_time_ms,ROW_NUMBER() OVER (ORDER BY ${order})::int AS rank FROM players WHERE races>0) SELECT id,display_name,rating,wins,losses,races,best_time_ms,rank FROM ranked WHERE platform=$1 AND platform_user_id=$2 LIMIT 1`,[platform,pid]);me=q.rows[0]||null}
  return{entries:top.rows,me};
}

async function serve(req,res){
  const u=new URL(String(req.url||'/'),'http://localhost'),pathname=decodeURIComponent(u.pathname);
  if(pathname.startsWith('/api/')&&req.method==='OPTIONS'){apiCors(res);res.writeHead(204).end();return}
  if(pathname==='/health'){
    let dbOk=false;if(db){try{await db.query('select 1');dbOk=true}catch{dbOk=false}}
    return json(res,200,{ok:true,rooms:rooms.size,version:'0.9.7-leaderboard',database:dbOk});
  }
  if(pathname==='/api/leaderboard'&&req.method==='GET'){
    if(!db)return json(res,503,{ok:false,error:'database-not-configured'});
    const sort=['rating','wins','time'].includes(String(u.searchParams.get('sort')||''))?String(u.searchParams.get('sort')):'rating';
    const limit=Math.max(1,Math.min(100,Number(u.searchParams.get('limit')||20)||20));
    try{const data=await leaderboard(sort,limit,u.searchParams.get('mePlatform')||'',u.searchParams.get('meId')||'');return json(res,200,{ok:true,sort,...data})}
    catch(e){console.error('leaderboard',e);return json(res,500,{ok:false,error:'database-query-failed'})}
  }
  if(pathname==='/api/player'&&req.method==='POST'){
    if(!db)return json(res,503,{ok:false,error:'database-not-configured'});
    try{const body=await readJson(req);const row=await upsertPlayer(body?.identity||body,body?.displayName||'Player');if(!row)return json(res,400,{ok:false,error:'invalid-player-identity'});const rank=await playerRank(row.id,'rating');return json(res,200,{ok:true,player:{...row,rank}})}
    catch(e){console.error('player upsert',e);return json(res,400,{ok:false,error:'player-upsert-failed'})}
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
function token(){return crypto.randomBytes(18).toString('base64url')}
function player(id,name,ws){return{id,name:safeName(name),ws,resumeToken:token(),disconnectTimer:null,pos:{x:21,y:63},heading:0,speed:1,movesMade:0,forceOne:false,crashes:0,dbPlayerId:null,platform:'web',platformUserId:'',rating:1000}}
async function bindDbPlayer(p,identity){try{const row=await upsertPlayer(identity,p.name);if(row){p.dbPlayerId=Number(row.id);p.platform=row.platform;p.platformUserId=row.platform_user_id;p.rating=Number(row.rating)||1000;p.name=safeName(identity?.displayName||p.name)}}catch(e){console.error('bind player',e)}}
function roomState(r){return{seed:r.seed||0,started:!!r.started,finished:!!r.finished,turn:r.turn||0,startTurn:r.startTurn??0,turnNo:r.turnNo||1,hostId:r.hostId,players:r.players.map(p=>({id:p.id,name:p.name,pos:p.pos,heading:p.heading??0,speed:p.speed??1,movesMade:p.movesMade||0,forceOne:!!p.forceOne,crashes:p.crashes||0,connected:!!p.ws,rating:p.rating||1000}))}}
function roomMessage(r){return{type:'room',room:r.id,hostId:r.hostId,state:roomState(r)}}
function turnDiff(a,b){let d=((b-a)%8+8)%8;if(d>4)d-=8;return d}
function detachSocket(ws){const rid=ws.room;if(!rid)return;const r=rooms.get(rid),p=r?.players.find(x=>x.id===ws.pid);if(!r||!p||p.ws!==ws)return;p.ws=null;ws.room=null;ws.pid=null;clearTimeout(p.disconnectTimer);p.disconnectTimer=setTimeout(()=>removePlayer(r,p.id),RECONNECT_MS);broadcast(r,roomMessage(r))}
function removePlayer(r,id){const idx=r.players.findIndex(p=>p.id===id);if(idx<0)return;const p=r.players[idx];clearTimeout(p.disconnectTimer);r.players.splice(idx,1);if(!r.players.length){rooms.delete(r.id);return}if(r.hostId===id)r.hostId=r.players.find(x=>x.ws)?.id||r.players[0].id;if(r.started){if(idx<r.turn)r.turn--;else if(idx===r.turn&&r.turn>=r.players.length)r.turn=0;r.startTurn=Math.min(r.startTurn??0,Math.max(0,r.players.length-1))}broadcast(r,roomMessage(r));if(r.started)broadcast(r,{type:'state',state:roomState(r)})}
function explicitLeave(ws){const r=rooms.get(ws.room);if(r)removePlayer(r,ws.pid);ws.room=null;ws.pid=null}
function attach(ws){ws._buf=Buffer.alloc(0);ws._rate={at:Date.now(),count:0};ws.on('data',chunk=>{ws._buf=Buffer.concat([ws._buf,chunk]);if(ws._buf.length>MAX_MESSAGE*2){ws.destroy();return}while(true){const d=decode(ws._buf);if(!d)break;if(d.tooBig){ws.destroy();break}if(d.close){ws.end();break}ws._buf=ws._buf.slice(d.used);const now=Date.now();if(now-ws._rate.at>10000)ws._rate={at:now,count:0};if(++ws._rate.count>120){send(ws,{type:'error',message:'Слишком много запросов'});ws.destroy();break}let m;try{m=JSON.parse(d.data)}catch{continue}if(!m||typeof m!=='object')continue;handle(ws,m).catch(e=>{console.error('ws handle',e);send(ws,{type:'error',message:'Ошибка сервера'})})}});ws.on('close',()=>detachSocket(ws));ws.on('error',()=>detachSocket(ws))}

async function recordRaceResult(r,winner){
  if(r.resultRecorded)return;r.resultRecorded=true;r.finished=true;
  let changes=[];
  if(db){
    const ranked=r.players.filter(p=>p.dbPlayerId);
    if(ranked.length>=2&&winner?.dbPlayerId){
      const client=await db.connect();
      try{
        await client.query('BEGIN');
        const ids=ranked.map(p=>p.dbPlayerId);
        const locked=await client.query('SELECT id,rating,wins,losses,races FROM players WHERE id=ANY($1::bigint[]) FOR UPDATE',[ids]);
        const rows=new Map(locked.rows.map(x=>[Number(x.id),x]));
        const wr=rows.get(winner.dbPlayerId);
        if(wr){
          const n=Math.max(1,ranked.length-1),K=32;let winnerGain=0;const deltas=new Map();
          for(const p of ranked){if(p.dbPlayerId===winner.dbPlayerId)continue;const lr=rows.get(p.dbPlayerId);if(!lr)continue;const expectedWin=1/(1+Math.pow(10,(Number(lr.rating)-Number(wr.rating))/400));const raw=Math.max(1,Math.round(K*(1-expectedWin)/n));const loserNew=Math.max(100,Number(lr.rating)-raw),actual=Number(lr.rating)-loserNew;winnerGain+=actual;deltas.set(p.dbPlayerId,-actual)}
          deltas.set(winner.dbPlayerId,winnerGain);
          const match=await client.query('INSERT INTO matches(room_code,mode,track_seed,started_at,finished_at,winner_player_id) VALUES($1,$2,$3,to_timestamp($4/1000.0),now(),$5) RETURNING id',[r.id,'online',Number(r.seed)||0,Number(r.startedAt)||Date.now(),winner.dbPlayerId]);
          const matchId=Number(match.rows[0].id);
          for(const p of ranked){const old=rows.get(p.dbPlayerId);if(!old)continue;const delta=deltas.get(p.dbPlayerId)||0,newRating=Math.max(100,Number(old.rating)+delta),won=p.dbPlayerId===winner.dbPlayerId;
            await client.query('UPDATE players SET rating=$2,wins=wins+$3,losses=losses+$4,races=races+1,last_seen_at=now() WHERE id=$1',[p.dbPlayerId,newRating,won?1:0,won?0:1]);
            await client.query('INSERT INTO match_players(match_id,player_id,finish_place,old_rating,new_rating,crashes,turns) VALUES($1,$2,$3,$4,$5,$6,$7)',[matchId,p.dbPlayerId,won?1:2,Number(old.rating),newRating,p.crashes||0,p.movesMade||0]);
            p.rating=newRating;changes.push({playerId:p.id,name:p.name,oldRating:Number(old.rating),newRating,delta:newRating-Number(old.rating),wins:Number(old.wins)+(won?1:0),losses:Number(old.losses)+(won?0:1),races:Number(old.races)+1,winner:won});
          }
        }
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error('record race',e);changes=[]}finally{client.release()}
    }
  }
  r.started=false;
  broadcast(r,{type:'raceResult',winnerId:winner?.id||'',saved:changes.length>0,changes,state:roomState(r)});
  broadcast(r,roomMessage(r));
}

async function handle(ws,m){
  if(m.type==='create'){
    explicitLeave(ws);const id=crypto.randomBytes(6).toString('hex'),rid=roomCode(),p=player(id,m.name,ws);await bindDbPlayer(p,m.identity||{});const r={id:rid,hostId:id,players:[p],started:false,finished:false,resultRecorded:false,turn:0,turnNo:1,startTurn:0};rooms.set(rid,r);ws.room=rid;ws.pid=id;send(ws,{type:'welcome',room:rid,playerId:id,host:true,hostId:id,resumeToken:p.resumeToken,state:roomState(r)});return
  }
  if(m.type==='join'){
    explicitLeave(ws);const rid=String(m.room||'').toUpperCase(),r=rooms.get(rid);if(!r)return send(ws,{type:'error',message:'Комната не найдена'});if(r.started)return send(ws,{type:'error',message:'Гонка уже началась'});if(r.players.length>=4)return send(ws,{type:'error',message:'В комнате уже 4 игрока'});const id=crypto.randomBytes(6).toString('hex'),p=player(id,m.name,ws);await bindDbPlayer(p,m.identity||{});if(p.dbPlayerId&&r.players.some(x=>x.dbPlayerId===p.dbPlayerId))return send(ws,{type:'error',message:'Этот профиль уже находится в комнате'});r.players.push(p);ws.room=rid;ws.pid=id;send(ws,{type:'welcome',room:rid,playerId:id,host:false,hostId:r.hostId,resumeToken:p.resumeToken,state:roomState(r)});broadcast(r,roomMessage(r));return
  }
  if(m.type==='resume'){
    const rid=String(m.room||'').toUpperCase(),r=rooms.get(rid),p=r?.players.find(x=>x.id===String(m.playerId||''));if(!r||!p||!p.resumeToken||p.resumeToken!==String(m.resumeToken||''))return send(ws,{type:'error',message:'Не удалось восстановить комнату'});if(p.ws&&p.ws!==ws){try{p.ws.destroy()}catch{}}clearTimeout(p.disconnectTimer);p.disconnectTimer=null;p.ws=ws;ws.room=rid;ws.pid=p.id;send(ws,{type:'resumed',room:rid,playerId:p.id,host:r.hostId===p.id,hostId:r.hostId,resumeToken:p.resumeToken,state:roomState(r)});broadcast(r,roomMessage(r));return
  }
  if(m.type==='leave'){explicitLeave(ws);return}
  const r=rooms.get(ws.room);if(!r)return send(ws,{type:'error',message:'Сначала создай или введи комнату'});
  if(m.type==='start'){
    if(ws.pid!==r.hostId)return send(ws,{type:'error',message:'Только создатель комнаты запускает гонку'});if(r.started)return;const connected=r.players.filter(p=>p.ws);if(!connected.length)return;
    r.players=r.players.filter(p=>p.ws);r.seed=Number(m.seed)||Date.now();const Track=await TrackClassPromise;r.track=new Track(r.seed,4,false);r.started=true;r.finished=false;r.resultRecorded=false;r.startedAt=Date.now();r.startTurn=Math.floor(Math.random()*r.players.length);r.turn=r.startTurn;r.turnNo=1;const offsets=[0,-1,1,-2],normal=r.track.path[0]?.normal||{x:1,y:0},heading=r.track.path[0]?.heading??0;r.players.forEach((p,i)=>{p.pos={x:Math.round(r.track.start.x+normal.x*offsets[i]),y:Math.round(r.track.start.y+normal.y*offsets[i])};p.heading=heading;p.speed=1;p.movesMade=0;p.forceOne=false;p.crashes=0});broadcast(r,{type:'started',state:roomState(r)});return
  }
  if(m.type==='move'){
    if(!r.started||r.finished)return;const p=r.players[r.turn];if(!p||p.id!==ws.pid)return send(ws,{type:'error',message:'Сейчас ход другого игрока'});
    const heading=Number(m.heading),speed=Number(m.speed);if(!Number.isInteger(heading)||heading<0||heading>7||!Number.isInteger(speed)||speed<1||speed>MAX_SPEED)return send(ws,{type:'error',message:'Недопустимый ход'});if(Math.abs(turnDiff(p.heading,heading))>1)return send(ws,{type:'error',message:'Поворот больше 45° запрещён'});
    const allowed=((p.movesMade||0)===0||p.forceOne)?[1]:[Math.max(1,p.speed-1),p.speed,Math.min(MAX_SPEED,p.speed+1)];if(!allowed.includes(speed))return send(ws,{type:'error',message:'Скорость можно менять только на одну клетку'});const d=DIRS[heading],target={x:p.pos.x+d.x*speed,y:p.pos.y+d.y*speed};if(Number(m.target?.x)!==target.x||Number(m.target?.y)!==target.y)return send(ws,{type:'error',message:'Недопустимый узел сетки'});
    const from={...p.pos},seg=r.track.segmentCheckMove(from,target),finishT=r.track.finishCrossingFraction(from,target),den=Math.max(1e-9,(target.x-from.x)**2+(target.y-from.y)**2),segT=seg.ok?Infinity:Math.max(0,Math.min(1,((seg.impact.x-from.x)*(target.x-from.x)+(seg.impact.y-from.y)*(target.y-from.y))/den)),finishFirst=finishT!==null&&finishT<=segT+1e-6;p.heading=heading;p.movesMade++;
    if(finishFirst){p.pos={x:from.x+(target.x-from.x)*finishT,y:from.y+(target.y-from.y)*finishT};p.speed=speed;p.forceOne=false}
    else if(seg.ok){p.pos=target;p.speed=speed;p.forceOne=false}
    else{p.pos={...seg.lastGrid};p.speed=1;p.forceOne=true;p.crashes++}
    if(finishFirst){broadcast(r,{type:'state',state:roomState(r)});await recordRaceResult(r,p);return}
    r.turn=(r.turn+1)%r.players.length;if(r.turn===r.startTurn)r.turnNo++;broadcast(r,{type:'state',state:roomState(r)});return
  }
}

server.on('upgrade',(req,socket)=>{if(String(req.url||'').split('?')[0]!=='/ws'||!originAllowed(req)){socket.destroy();return}const key=req.headers['sec-websocket-key'];if(!key){socket.destroy();return}const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');attach(socket)});
server.listen(PORT,'0.0.0.0',()=>console.log(`Grid Vector Racer v0.9.7 Leaderboard server: http://localhost:${PORT} (WebSocket /ws)`));
