GRID VECTOR RACER 0.9.5 — Render WSS server

1. Создай пустой GitHub-репозиторий, например grid-vector-racer-wss.
2. Загрузи в корень репозитория содержимое этой папки.
3. На render.com: New -> Web Service -> подключи GitHub -> выбери репозиторий.
4. Plan: Free. Start command: node server.cjs. Health Check Path: /health.
5. После Deploy Render выдаст адрес вида https://grid-vector-racer-wss.onrender.com
6. Проверка: открой https://<имя>.onrender.com/health — должен быть JSON {"ok":true,...}
7. WSS игры: wss://<имя>.onrender.com/ws
8. В Яндекс Играх -> CSP добавь host: <имя>.onrender.com (БЕЗ https://, БЕЗ /ws, БЕЗ порта).
9. После получения адреса этот WSS надо вписать в src/config.js финального Yandex ZIP.

На Free Render сервис засыпает после 15 минут без HTTP/WebSocket-трафика и может просыпаться около минуты.
