/* Guess the Drawing - game flow. Plain script, runs from file://.
   Data: window.ROUNDS (../rounds/rounds.js, written by prerender) or window.DEMO_ROUNDS. */
(function () {
  "use strict";

  var ROUNDS_PER_GAME = 3;
  var GRACE_SECONDS = 6;      // time left for the player after the AI gets it (or the video ends)
  var MISS_PENALTY = 10;      // added to a missed round
  var PAUSE_LIMIT_MS = 8000;  // a pause without a submitted guess resumes the video
  var RESULT_AUTO_MS = 5000;

  var $ = function (id) { return document.getElementById(id); };
  var video = $("video");

  // ---------- data ----------
  function loadPool() {
    var real = (window.ROUNDS || []).filter(function (r) { return r && r.word && r.video; })
      .map(function (r) { return Object.assign({}, r, { src: "../" + r.video }); });
    if (real.length) return real;
    $("demo-flag").hidden = false;
    return (window.DEMO_ROUNDS || []).map(function (r) { return Object.assign({}, r, { src: r.video }); });
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- answer matching ----------
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .trim().replace(/^(a|an|the)\s+/, "").replace(/[^a-z0-9]/g, "");
  }
  function lev(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function allowed(len) { return len <= 3 ? 0 : len <= 6 ? 1 : 2; }
  function variants(s) { return s.length > 3 && s.slice(-1) === "s" ? [s, s.slice(0, -1)] : [s]; }
  function isMatch(guess, round) {
    var g = norm(guess);
    if (!g) return false;
    return [round.word].concat(round.synonyms || []).some(function (ans) {
      var a = norm(ans);
      return variants(g).some(function (gv) {
        return variants(a).some(function (av) { return lev(gv, av) <= allowed(av.length); });
      });
    });
  }

  // ---------- screens ----------
  var screens = ["start", "intro", "play", "result", "final", "signup"];
  function show(name) {
    screens.forEach(function (s) { $("screen-" + s).hidden = s !== name; });
  }

  // ---------- game state ----------
  var game = null;   // { name, rounds, index, results }
  var r = null;      // current round state
  var latestScoreId = null;

  function fmt(t) { return t.toFixed(1) + " s"; }

  function renderBoard() {
    var list = $("scoreboard"), top = window.Store.topScores(10);
    list.innerHTML = "";
    top.forEach(function (s, i) {
      var li = document.createElement("li");
      if (s.id === latestScoreId) li.className = "latest";
      [["rank", (i + 1) + "."], ["name", s.name], ["total", fmt(s.total)]].forEach(function (c) {
        var span = document.createElement("span");
        span.className = c[0]; span.textContent = c[1]; li.appendChild(span);
      });
      list.appendChild(li);
    });
    $("board-empty").hidden = top.length > 0;
  }

  function goStart() {
    stopRound();
    game = null;
    renderBoard();
    show("start");
    $("player-name").value = "";
    $("player-name").focus();
  }

  $("start-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("player-name").value.trim();
    if (!name) return;
    var pool = loadPool();
    if (!pool.length) { $("board-empty").textContent = "No rounds found. Run prerender first."; return; }
    game = { name: name, rounds: shuffle(pool).slice(0, ROUNDS_PER_GAME), index: 0, results: [] };
    nextRound();
  });

  function nextRound() {
    if (game.index >= game.rounds.length) return finish();
    var n = game.index + 1, total = game.rounds.length, count = 3;
    $("intro-round").textContent = "Round " + n + " of " + total;
    $("intro-count").textContent = count;
    show("intro");
    prepareRound(game.rounds[game.index]);
    var iv = setInterval(function () {
      count--;
      if (count > 0) { $("intro-count").textContent = count; return; }
      clearInterval(iv);
      startRound();
    }, 700);
  }

  function prepareRound(round) {
    r = {
      round: round,
      guesses: (round.guesses || []).slice().sort(function (a, b) { return a.t - b.t; }),
      phase: "loading", graceStart: 0, graceVideoTime: 0,
      pauseTimer: null, raf: 0, lastShown: null, history: [], done: false
    };
    video.src = round.src;
    video.load();
    $("ai-guess").textContent = "...";
    $("ai-guess").className = "ai-guess";
    $("ai-history").innerHTML = "";
    $("my-guesses").innerHTML = "";
    $("grace").hidden = true;
    $("paused-tag").hidden = true;
    $("guess").value = "";
    $("hud-round").textContent = "Round " + (game.index + 1) + "/" + game.rounds.length;
    $("hud-total").textContent = "Total " + fmt(totalSoFar());
    $("hud-clock").textContent = fmt(0);
  }

  function startRound() {
    show("play");
    r.phase = "playing";
    $("guess").focus();
    video.currentTime = 0;
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
    r.raf = requestAnimationFrame(tick);
  }

  function stopRound() {
    if (!r) return;
    cancelAnimationFrame(r.raf);
    clearTimeout(r.pauseTimer);
    video.pause();
    r.done = true;
  }

  function totalSoFar() {
    return game ? game.results.reduce(function (s, x) { return s + x.time; }, 0) : 0;
  }

  // ---------- per-frame update ----------
  function tick() {
    if (!r || r.done) return;
    var t = video.currentTime;
    $("hud-clock").textContent = fmt(t);
    updateAi(t);

    var aiAt = r.round.aiCorrectAt;
    if (r.phase === "playing" && ((aiAt != null && t >= aiAt) || video.ended)) startGrace(t);

    if (r.phase === "grace") {
      var left = GRACE_SECONDS - (performance.now() - r.graceStart) / 1000;
      if (left <= 0) return endRound(false);
      $("grace-fill").style.transform = "scaleX(" + Math.max(0, left / GRACE_SECONDS) + ")";
      $("grace-left").textContent = left.toFixed(1) + " s left";
    }
    r.raf = requestAnimationFrame(tick);
  }

  function mask(word) { return word.replace(/\S/g, "●"); }

  function updateAi(t) {
    var cur = null;
    for (var i = 0; i < r.guesses.length && r.guesses[i].t <= t; i++) cur = r.guesses[i];
    if (!cur || cur === r.lastShown) return;
    if (r.lastShown && r.lastShown.guess !== "nothing") addHistory(r.lastShown.guess);
    r.lastShown = cur;
    var el = $("ai-guess"), hit = isMatch(cur.guess, r.round);
    el.textContent = cur.guess === "nothing" ? "..." : hit ? mask(r.round.word) : cur.guess;
    el.className = "ai-guess" + (hit ? " masked" : "");
    void el.offsetWidth; // restart the pop animation
    el.classList.add("pop");
  }

  function addHistory(g) {
    if (r.history[r.history.length - 1] === g) return;
    r.history.push(g);
    var li = document.createElement("li");
    li.textContent = isMatch(g, r.round) ? mask(r.round.word) : g;
    $("ai-history").prepend(li);
    while ($("ai-history").children.length > 8) $("ai-history").lastChild.remove();
  }

  function startGrace(t) {
    r.phase = "grace";
    r.graceStart = performance.now();
    r.graceVideoTime = t;
    var aiGotIt = r.round.aiCorrectAt != null && t >= r.round.aiCorrectAt;
    $("grace").hidden = false;
    document.querySelector(".grace-title").textContent = aiGotIt ? "The AI got it" : "Drawing finished";
  }

  // ---------- player input ----------
  var guessInput = $("guess");

  guessInput.addEventListener("input", function () {
    if (!r || r.done || r.phase === "loading") return;
    if (!video.paused && guessInput.value.trim()) pauseForGuess();
  });

  guessInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { guessInput.value = ""; resume(); }
  });

  function pauseForGuess() {
    video.pause();
    $("paused-tag").hidden = false;
    clearTimeout(r.pauseTimer);
    r.pauseTimer = setTimeout(function () { guessInput.value = ""; resume(); }, PAUSE_LIMIT_MS);
  }

  function resume() {
    if (!r || r.done) return;
    clearTimeout(r.pauseTimer);
    $("paused-tag").hidden = true;
    if (!video.ended) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
  }

  $("guess-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!r || r.done || r.phase === "loading") return;
    var g = guessInput.value.trim();
    guessInput.value = "";
    if (!g) return resume();
    if (isMatch(g, r.round)) return endRound(true);
    var li = document.createElement("li");
    li.textContent = g;
    $("my-guesses").appendChild(li);
    var form = $("guess-form");
    form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake");
    resume();
  });

  video.addEventListener("error", function () {
    if (!r || r.done || !game) return;
    console.error("Could not load video:", r.round.src);
    stopRound();
    game.rounds.splice(game.index, 1); // skip broken round, not counted
    nextRound();
  });

  // ---------- results ----------
  var resultTimer = null;

  function endRound(solved) {
    var t = video.currentTime;
    stopRound();
    var time = solved ? t : Math.min(video.duration || t, r.graceVideoTime + GRACE_SECONDS) + MISS_PENALTY;
    time = Math.round(time * 10) / 10;
    game.results.push({ word: r.round.word, time: time, solved: solved });

    var ai = r.round.aiCorrectAt;
    $("result-eyebrow").textContent = solved
      ? (ai == null || t < ai ? "You beat the AI" : "Correct, but the AI was faster")
      : "Missed it. +" + MISS_PENALTY + " s penalty";
    $("result-word").textContent = r.round.word;
    $("result-you").textContent = solved ? fmt(time) : "missed";
    $("result-ai").textContent = ai == null ? "never" : fmt(ai);
    show("result");
    $("result-next").focus();
    resultTimer = setTimeout(advance, RESULT_AUTO_MS);
  }

  function advance() {
    clearTimeout(resultTimer);
    game.index++;
    nextRound();
  }
  $("result-next").addEventListener("click", advance);

  function finish() {
    var total = Math.round(totalSoFar() * 10) / 10;
    var res = window.Store.addScore({ name: game.name, total: total, rounds: game.results });
    latestScoreId = res.entry.id;
    $("final-total").textContent = fmt(total);
    var rank = $("final-rank");
    rank.textContent = res.rank === 1 ? "New #1 on the scoreboard!" : "Place " + res.rank + " on the scoreboard";
    rank.className = "final-rank" + (res.rank === 1 ? " first" : "");
    var list = $("final-rounds");
    list.innerHTML = "";
    game.results.forEach(function (x) {
      var li = document.createElement("li");
      li.textContent = x.word + ": " + (x.solved ? fmt(x.time) : "missed");
      list.appendChild(li);
    });
    show("final");
    $("final-next").focus();
  }

  $("final-next").addEventListener("click", function () {
    var name = game.name;
    show("signup");
    window.Signup.render($("screen-signup"), { name: name, onDone: goStart });
  });

  // ---------- staff panel (Ctrl+Shift+A) ----------
  function openAdmin() {
    var c = window.Store.counts();
    $("admin-counts").textContent = c.scores + " scores, " + c.signups + " sign-ups stored on this laptop.";
    $("admin-confirm").hidden = true;
    $("admin").hidden = false;
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      if ($("admin").hidden) openAdmin(); else $("admin").hidden = true;
    }
  });
  $("admin-close").addEventListener("click", function () { $("admin").hidden = true; });
  $("admin-export").addEventListener("click", function () { window.Store.exportCSV(); });
  $("admin-clear").addEventListener("click", function () { $("admin-confirm").hidden = false; });
  $("admin-clear-yes").addEventListener("click", function () {
    window.Store.clearAll();
    latestScoreId = null;
    openAdmin();
    renderBoard();
  });

  goStart();
})();
