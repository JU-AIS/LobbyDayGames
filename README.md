# LobbyDayGames

Quick games for the Jönköping University AI Student Association (JU AIS) lobby days. Everything runs offline on one laptop. Each game lives in its own folder.

| Game | Folder | Status |
|---|---|---|
| Guess the Drawing: beat the AI at guessing a drawing as it appears | [`guess-the-drawing/`](guess-the-drawing/) | Playable with demo rounds, first real round recorded |

## Play

Open `guess-the-drawing/game/index.html` in Chrome. See the game's README for rules, recording new rounds and the staff panel (Ctrl+Shift+A).

## Working in this repo

- Work on a feature branch, merge to `main` when it runs.
- Never commit API keys: `.env` is ignored.
- Commit generated rounds and videos (a few MB each), so the lobby laptop only needs a `git pull`.
