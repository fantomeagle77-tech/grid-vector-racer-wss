GRID VECTOR RACER v0.9.7 — RENDER + NEON + GLOBAL LEADERBOARD

Что нового:
- общий рейтинг хранится в Neon;
- игрок создаётся/обновляется в players;
- сетевой матч после реального финиша записывается в matches + match_players;
- победы/поражения/races/rating пересчитываются сервером;
- GET /api/leaderboard?sort=rating&limit=20;
- POST /api/player для регистрации профиля;
- /health показывает database:true при рабочем Neon.

Render:
Build Command: npm install
Start Command: node server.cjs
Environment: DATABASE_URL = pooled Neon connection string
Health Check Path: /health

Важно: рейтинг начисляется только за ONLINE PvP с минимум двумя игроками. Боты и локальные гонки рейтинг не фармят.
