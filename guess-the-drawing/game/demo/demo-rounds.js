// Demo rounds for development. Used only when ../rounds/rounds.js is missing or empty.
// Same shape as the file prerender writes, but with paths relative to game/.
window.DEMO_ROUNDS = [
  {
    word: "house", synonyms: ["home", "cottage"], video: "demo/house.mp4", aiCorrectAt: 8,
    guesses: [
      { t: 0, guess: "nothing" }, { t: 1, guess: "line" }, { t: 2, guess: "square" },
      { t: 3, guess: "box" }, { t: 4, guess: "box" }, { t: 5, guess: "tent" },
      { t: 6, guess: "barn" }, { t: 7, guess: "house" }, { t: 8, guess: "house" },
      { t: 9, guess: "house" }, { t: 10, guess: "house" }
    ]
  },
  {
    word: "sun", synonyms: [], video: "demo/sun.mp4", aiCorrectAt: 9,
    guesses: [
      { t: 0, guess: "nothing" }, { t: 1, guess: "arc" }, { t: 2, guess: "circle" },
      { t: 3, guess: "circle" }, { t: 4, guess: "ball" }, { t: 6, guess: "clock" },
      { t: 7, guess: "flower" }, { t: 8, guess: "sun" }, { t: 9, guess: "sun" }
    ]
  },
  {
    word: "fish", synonyms: [], video: "demo/fish.mp4", aiCorrectAt: null,
    guesses: [
      { t: 0, guess: "nothing" }, { t: 1, guess: "curve" }, { t: 2, guess: "egg" },
      { t: 3, guess: "oval" }, { t: 4, guess: "egg" }, { t: 5, guess: "balloon" },
      { t: 6, guess: "kite" }, { t: 7, guess: "lemon" }, { t: 8, guess: "bird" },
      { t: 9, guess: "bird" }, { t: 10, guess: "whale" }, { t: 11, guess: "whale" },
      { t: 12, guess: "whale" }
    ]
  }
];
