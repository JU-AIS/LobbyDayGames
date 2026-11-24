# Guess the Drawing

A quick lobby day game: beat the AI at guessing what is being drawn.

The player watches a pre-recorded video of someone drawing in Paint. An AI guesses live on screen as the drawing appears. The player pauses the video and types a guess whenever they think they know it. Fastest correct guesses top the scoreboard.

Runs fully offline on one laptop. No camera, no network and no API calls during the event. All AI guesses are pre-rendered.

## Gameplay

1. The player enters a name (shown on the scoreboard).
2. A round starts: the drawing video plays and the AI's guesses appear on screen with timestamps.
3. The player can pause at any time and type a guess. Wrong guess: the video continues.
4. When the AI gets it right, the correct word is hidden (not revealed to the player) and the player has **6 more seconds** to guess correctly before the round ends.
5. After the last round: score, scoreboard position, then the JU AIS sign-up form.

## Scoring

- Score = total time (seconds into the video) the player needed to guess correctly, summed over all rounds. Lowest total wins.
- A missed round counts as the round's end time plus a penalty (proposed: +10 s). Not final.

## Answer matching

Guesses do not need perfect spelling.

- Case, whitespace and punctuation are ignored.
- Small typos are accepted (edit distance about 1 for short words, 2 for longer words).
- Each word has a list of accepted synonyms (e.g. `car`, `automobile`).

## AI guesses (pre-rendered)

The AI guesses are produced once, before the event, and saved as JSON next to each video.

1. Extract one frame per second from the video (ffmpeg).
2. Send each frame to Claude Haiku 5.5 (`claude-haiku-5-5`) asking for a one-word guess of what is being drawn. The model is not given the word list.
3. Save the result as `guesses.json`: `[{ "t": 3, "guess": "house" }, ...]`.

Cost is negligible (well under 1 USD for all videos). The game only reads the JSON, so the model can be swapped later (e.g. a local vision model) without touching the game.

Risk to check on the first recording: if Haiku guesses too early, the player has no chance. Mitigations: harder words, or only count the AI as correct after the same guess on two frames in a row.

## Recording the videos

- Drawn by Oskar and Victor in Paint, recorded as a screen capture.
- Only the canvas in frame, white background, no text on screen.
- Roughly 20 to 40 seconds per drawing, steady pace.
- One word per video. File name = the word, e.g. `bicycle.mp4`.

## Planned structure

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
- 3 random rounds per game. Settings are at the top of `game/game.js` (rounds per game, 6 s grace, 10 s miss penalty, 8 s max pause).
- A pause without a submitted guess resumes the video after 8 seconds, so nobody can stop the clock forever. Esc also resumes.
- Staff panel: **Ctrl+Shift+A**. Shows how many scores and sign-ups are stored, exports both as CSV, and can clear all data.
- Scores and sign-ups live in the browser's localStorage on that laptop. Export before clearing browser data.

## Status

Game playable with demo rounds (branch `feat/gtd-game`). Prerender on `feat/gtd-prerender`, not yet run against Haiku. Target: first draft on GitHub and Discord by 2026-11-25, used at the lobby days 2026-11-27 (JIBS) and 2026-11-30 (JTH).
