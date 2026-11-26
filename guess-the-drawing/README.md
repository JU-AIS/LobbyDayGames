# Guess the Drawing

A quick lobby day game: beat the AI at guessing what is being drawn.

The player watches a pre-recorded video of someone drawing in Paint. An AI guesses live on screen as the drawing appears. The player pauses the video and types a guess whenever they think they know it. Your score is how much faster (or slower) you were than the AI. The biggest lead tops the scoreboard.

Runs fully offline on one laptop. No camera, no network and no API calls during the event. All AI guesses are pre-rendered.

## Gameplay

1. The player enters a name (shown on the scoreboard).
2. Each game is 3 random rounds, picked from the eligible rounds in random order (see Scoring). Videos from the last 2 games on the same device are skipped, so people watching in the queue cannot learn the answers (`RECENT_GAMES` in `game/game.js`).
3. A round starts: the drawing video plays and the AI's guesses appear on screen.
4. The player can pause at any time and type a guess. Wrong guess: the input shakes and the video continues.
5. Correct guess: a green "Correct!" flash with the player's time, then the round result ("You beat the AI by 3.1 s" or "The AI won by 2.0 s").
6. When the AI gets it right, the correct word is hidden (not revealed to the player) and the player has **6 more seconds** to guess correctly before the round ends.
7. Some rounds the AI never gets right. There is no 6 second window then: the round runs to the end of the video, and if the player has not guessed by then it is a miss.
8. After the last round: "You beat the AI x of 3", the total margin, scoreboard position, then the JU AIS sign-up form.

## Scoring

Beat the AI: the score of a round is the player's time minus the AI's time (the margin). Negative means the player was faster. The total is the sum over the 3 rounds, shown with a sign (for example `-4.2 s` or `+3.0 s`). Lowest total wins.

- AI time: `aiCorrectAt` for the round (seconds into the video). If the AI never gets it right, the AI time is the video length.
- Player time: the video time when the player guessed correctly.
- Missed round, AI got it: the end of the 6 second window (capped at the video length) plus a 10 s penalty, minus the AI time.
- Missed round, AI never got it: the video length plus the 10 s penalty, minus the AI time (so +10 s).
- Rounds the AI never gets right therefore count against the video length: a correct guess at 14 s in a 24 s video is -10 s.
- Round gate (`MIN_AI_SECONDS` = 6 in `game/game.js`): only rounds where the AI never gets it, or gets it at 6 s or later, can be picked. Rounds where the AI is right sooner would leave the player no chance. If fewer than 3 rounds are eligible, the game uses what there is.
- The scoreboard shows the total margin plus a marker per round (a check when the player beat the AI).

## Answer matching

Guesses do not need perfect spelling.

- Case, whitespace and punctuation are ignored.
- Small typos are accepted (edit distance about 1 for short words, 2 for longer words).
- Each word has a list of accepted synonyms (e.g. `car`, `automobile`).

## AI guesses (pre-rendered)

The AI guesses are produced once, before the event, and committed, so every player sees exactly the same AI.

1. Take one frame every 3 seconds (t = 3, 6, 9, ...).
2. Send each frame to Claude Haiku 5.5 (`claude-haiku-5-5`) asking for a one-word guess of what is being drawn. The model is not given the word list.
3. Save the result as `guesses.json`: `[{ "t": 3, "guess": "house" }, ...]`. The AI counts as right at its first guess that matches the word or a synonym (`aiCorrectAt`).
4. Write `rounds/rounds.js` with all rounds, which the game loads.

How to run (in `prerender/`):

1. `npm install`
2. Optional: create `.env` with `ANTHROPIC_API_KEY=sk-ant-...` (ignored by git, never commit it). Without a key, prerender uses the Claude Code CLI (`claude -p`) with your normal Claude login.
3. `npm start` runs every round that has no `guesses.json` yet. `npm start -- --force` re-runs all, `npm start -- ../rounds/shark` runs one, `npm start -- --dry` shows what would be sent without calling the API.
4. Commit the new `guesses.json` files and `rounds/rounds.js`.

Cost is negligible (well under 1 USD for all videos). The game only reads the JSON, so the model can be swapped later (e.g. a local vision model) without touching the game.

Risk: if Haiku guesses too early, the player has no chance. Prerender prints `TOO EARLY?` when the first right guess comes in the first 30 % of the video. Fix: redraw with the recognisable part last, or pick a harder word.

## Recording the videos

Drawn by Oskar and Victor in Paint, recorded with the Windows Snipping Tool. Agree on who draws which words first, so nobody draws the same thing.

1. Open Paint, white canvas, black brush, medium thickness.
2. Press **Win+Shift+R** and drag a box around the canvas only (no toolbar, no text, no mouse cursor outside it). A smaller box gives a smaller file.
3. Click Start, wait 1 second, then draw. Roughly 20 to 40 seconds, steady pace, no writing letters or the word.
4. Stop, save as mp4.
5. Put it in `rounds/<word>/video.mp4` (folder name = the answer, lowercase English, e.g. `rounds/bicycle/video.mp4`).
6. Add `rounds/<word>/meta.json` when the word has other accepted answers: `{ "word": "bicycle", "synonyms": ["bike"] }`.
7. Run prerender (see `prerender/`), then open `game/index.html` and play the round once.

Good words: concrete objects that are recognisable halfway through and have one obvious name (bicycle, guitar, lighthouse, snowman, umbrella). Avoid words that need text or colour to tell apart.

Keep each video to a few MB, and make width and height multiples of 16 (otherwise some browsers draw a dark line at the edge). This ffmpeg command does both: no audio, at most 720p, padded with white:

```
ffmpeg -i big.mp4 -an -vf "scale=-2:'min(720,ih)',pad=ceil(iw/16)*16:ceil(ih/16)*16:0:0:white" -c:v libx264 -crf 28 -pix_fmt yuv420p -movflags +faststart video.mp4
```

Prerender brings its own ffmpeg (`ffmpeg-static`), so `npm install` is enough for it. The command above needs a system ffmpeg (`winget install Gyan.FFmpeg`).

## Structure

```
guess-the-drawing/
├── README.md
├── prerender/     one-off script: video -> frames -> Haiku -> guesses.json (API key in .env, never committed)
├── game/          static HTML/JS, opened directly in the browser, offline
└── rounds/        one folder per word: video, guesses.json, synonyms
```

Scoreboard and sign-up data are stored locally in the browser and exported to CSV after the event. Email is optional and collected with explicit GDPR consent; it is deleted after recruitment.

## Running the game

Open `game/index.html` in Chrome (double-click works, no server needed).

- With `rounds/rounds.js` present (written by `prerender/`), the game uses those rounds. Without it, it falls back to three demo rounds in `game/demo/` and shows a "Demo rounds" tag.
- Each game picks 3 random distinct rounds from the eligible pool (see Scoring). Settings at the top of `game/game.js`: rounds per game, `MIN_AI_SECONDS`, 6 s grace, 10 s miss penalty, 8 s max pause.
- A pause without a submitted guess resumes the video after 8 seconds, so nobody can stop the clock forever. Esc also resumes.
- Staff panel: **Ctrl+Shift+A**. Shows how many scores and sign-ups are stored, exports both as CSV, and can clear all data.
- Scores and sign-ups live in the browser's localStorage on that laptop (scores under `gtd.v2.scores`; older total-time scores under `gtd.v1.scores` are ignored). Export before clearing browser data.
- Commit `rounds/rounds.js` and the round videos, otherwise the game has no rounds on the lobby laptop. Keep each video to a few MB; above 50 MB we need another plan.

## Web version

URL: https://juais.se/LobbyDayGames/guess-the-drawing/game/

The same game also runs over http(s) on GitHub Pages. It switches to web mode automatically when the page is not opened from `file://`:

- Sign-ups are sent to the JU AIS Google Sheet through a Google Apps Script web app (email only if consent is ticked). Nothing is stored locally.
- No staff panel (Ctrl+Shift+A does nothing).
- The scoreboard is per device ("Your scores on this device") and the prize wording is hidden.
- The pages carry `noindex`, so search engines should not list them.

The offline version is unchanged: open `game/index.html` from disk. The web version deploys automatically on every push to `main` via GitHub Pages.

## Status

Game playable with demo rounds (branch `feat/gtd-game`). Prerender on `feat/gtd-prerender`, not yet run against Haiku. Target: first draft on GitHub and Discord by 2026-11-25, used at the lobby days 2026-11-27 (JIBS) and 2026-11-30 (JTH).
