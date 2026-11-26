# LobbyDayGames

Quick games for the Jönköping University AI Student Association (JU AIS) lobby days. Each game lives in its own folder and runs offline on one laptop, and online on the dashboard.

Dashboard: https://juais.se/LobbyDayGames/ (not linked from juais.se, `noindex`). Every push to `main` is published by GitHub Pages within about a minute, so keep unfinished work on branches.

| Game | Folder | Status |
|---|---|---|
| Guess the Drawing: name the drawing before the AI does | [`guess-the-drawing/`](guess-the-drawing/) | Playable, 13 rounds |

## Play

- Lobby laptop (offline): `git pull`, then double-click `guess-the-drawing/game/index.html` and open it in Chrome. Scores and sign-ups stay on the laptop; export them from the staff panel (Ctrl+Shift+A).
- Online: open the dashboard and pick a game. Sign-ups go to the JU AIS Google Sheet.

See each game's README for rules and details.

## Add a game

1. Create a folder `<game-name>/` (lowercase, hyphens) with its own `README.md` and an `index.html` that works when opened from disk.
2. Add an entry to [`games.js`](games.js): title, folder, link, thumbnail, one-line tagline and `status` (`"playable"` or `"coming soon"`).
3. Add a row to the table above.

## Working in this repo

- Work on a feature branch, merge to `main` when it runs.
- Never commit API keys or personal data: `.env` is ignored.
- Commit generated rounds and videos (keep each video small, a few hundred KB to a few MB), so the lobby laptop only needs a `git pull`.
