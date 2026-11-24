# Mappstruktur

```
LobbyDayGames/
├── README.md
├── package.json        # beroenden + npm start
├── .env.example        # ANTHROPIC_API_KEY, MODEL, INTERVAL_MS
├── .gitignore
├── server.ts           # lokal server: POST /api/guess → Claude, serverar public/
├── words.json          # ord + godkända synonymer
└── public/
    ├── index.html      # storbildsskärmen
    ├── game.js         # kamera, bild varje sekund, 30 s-runda, poäng
    └── style.css
```
