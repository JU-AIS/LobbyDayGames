/* Guess the Drawing - game flow. Plain script, runs from file://.
   Data: window.ROUNDS (../rounds/rounds.js, written by prerender) or window.DEMO_ROUNDS. */
(function () {
  "use strict";

  // Each game picks ROUNDS_PER_GAME random distinct rounds (random order) from the eligible pool.
  // Eligible = the AI never gets it, or gets it no earlier than MIN_AI_SECONDS (otherwise the player has no chance).
  var ROUNDS_PER_GAME = 3;
  var MIN_AI_SECONDS = 6;
  var GRACE_SECONDS = 6;      // time left for the player after the AI gets it (AI rounds only)
  var MISS_PENALTY = 10;      // added to a missed round
  var PAUSE_LIMIT_MS = 8000;  // a pause without a submitted guess resumes the video
  var RESULT_AUTO_MS = 5000;
  var FLASH_MS = 900;         // "Correct!" overlay before the result screen

  var $ = function (id) { return document.getElementById(id); };
  var video = $("video");
  // Size the video box to the video's exact aspect ratio inside the frame (see .canvas-frame video in style.css).
  function fitVideo() {
    var vw = video.videoWidth, vh = video.videoHeight, frame = video.parentNode;
    if (!vw || !vh || !frame.clientWidth) return;
    var cs = getComputedStyle(frame);
    var w = frame.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var h = Math.min(frame.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), window.innerHeight * 0.62);
    var k = Math.min(w / vw, h / vh);
    video.style.width = Math.floor(vw * k) + "px";
    video.style.height = Math.floor(vh * k) + "px";
    video.classList.add("fitted");
  }
  video.addEventListener("loadedmetadata", fitVideo);
  window.addEventListener("resize", fitVideo);

  // ---------- data ----------
  function loadPool() {
    var real = (window.ROUNDS || []).filter(function (r) { return r && r.word && r.video; })
      .map(function (r) { return Object.assign({}, r, { src: "../" + r.video }); });
    if (real.length) return real;
    $("demo-flag").hidden = false;
    return (window.DEMO_ROUNDS || []).map(function (r) { return Object.assign({}, r, { src: r.video }); });
  }

  // Random distinct rounds in random order (Fisher-Yates) from the eligible pool.
  function pickRounds(pool) {
    var eligible = pool.filter(function (x) { return x.aiCorrectAt == null || x.aiCorrectAt >= MIN_AI_SECONDS; });
    if (!eligible.length) {
      console.warn("No round has aiCorrectAt null or >= " + MIN_AI_SECONDS + "; using all rounds.");
      eligible = pool.slice();
    }
    for (var i = eligible.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = eligible[i]; eligible[i] = eligible[j]; eligible[j] = tmp;
    }
    return eligible.slice(0, ROUNDS_PER_GAME);
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
  var introTimer = null, finalTimer = null, flashTimer = null, wrongTimer = null;
  var FINAL_AUTO_MS = 20000;  // final screen moves on to the sign-up form by itself

  function fmt(t) { return t.toFixed(1) + " s"; }
  function round1(v) { return Math.round(v * 10) / 10; }
  // Signed margin vs the AI: "-4.2 s" (beat it), "+3.0 s" (lost), "0.0 s".
  function fmtSigned(v) {
    v = round1(v);
    return (v > 0 ? "+" : "") + v.toFixed(1) + " s";
  }

  function renderBoard() {
    var list = $("scoreboard"), top = window.Store.topScores(10);
    list.innerHTML = "";
    top.forEach(function (s, i) {
      var li = document.createElement("li");
      if (s.id === latestScoreId) li.className = "latest";
      [["rank", (i + 1) + "."], ["name", s.name], ["marks", ""], ["total", fmtSigned(s.total)]].forEach(function (c) {
        var span = document.createElement("span");
        span.className = c[0]; span.textContent = c[1];
        if (c[0] === "marks") {
          (s.rounds || []).forEach(function (x) {
            var m = document.createElement("i");
            m.className = x.beat ? "win" : "lose";
            m.textContent = x.beat ? "\u2713" : "\u2022";
            span.appendChild(m);
          });
        }
        li.appendChild(span);
      });
      list.appendChild(li);
    });
    $("board-empty").hidden = top.length > 0;
  }

  // Web mode (http/https): neutral wording, no prize and no shared scoreboard.
  if (window.GTD_WEB) {
    $("board-title").textContent = "Your scores on this device";
    $("rule-prize").hidden = true;
  }

  function goStart() {
    stopRound();
    clearInterval(introTimer);
    clearTimeout(resultTimer);
    clearTimeout(finalTimer);
    clearTimeout(flashTimer);
    clearTimeout(wrongTimer);
    $("correct-flash").hidden = true;
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
    game = { name: name, rounds: pickRounds(pool), index: 0, results: [] };
    nextRound();
  });

  function nextRound() {
    if (game.index >= game.rounds.length) return finish();
    var n = game.index + 1, total = game.rounds.length, count = 3;
    $("intro-round").textContent = "Round " + n + " of " + total;
    $("intro-count").textContent = count;
    show("intro");
    prepareRound(game.rounds[game.index]);
    clearInterval(introTimer);
    introTimer = setInterval(function () {
      count--;
      if (count > 0) { $("intro-count").textContent = count; return; }
      clearInterval(introTimer);
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
    video.classList.remove("fitted"); video.style.width = video.style.height = "";
    $("ai-guess").textContent = "...";
    $("ai-guess").className = "ai-guess";
    $("ai-history").innerHTML = "";
    $("my-guesses").innerHTML = "";
    $("grace").hidden = true;
    $("grace-band").hidden = true;
    $("ai-sub").hidden = true;
    $("ai-panel").classList.remove("hit");
    $("paused-tag").hidden = true;
    $("guess").value = "";
    $("hud-round").textContent = "Round " + (game.index + 1) + "/" + game.rounds.length;
    var tot = totalSoFar();
    $("hud-total").textContent = "Margin " + fmtSigned(tot);
    $("hud-total").className = tot < 0 ? "ok" : tot > 0 ? "ai" : "";
    $("hud-clock").textContent = fmt(0);
  }

  function startRound() {
    show("play");
    fitVideo();
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
    return game ? round1(game.results.reduce(function (s, x) { return s + x.margin; }, 0)) : 0;
  }

  // ---------- per-frame update ----------
  function tick() {
    if (!r || r.done) return;
    var t = video.currentTime;
    $("hud-clock").textContent = fmt(t);
    updateAi(t);

    // AI rounds: grace window once the AI gets it. AI-never rounds: no grace, the video just runs out.
    var aiAt = r.round.aiCorrectAt;
    if (r.phase === "playing") {
      if (aiAt != null && (t >= aiAt || video.ended)) startGrace(t);
      else if (aiAt == null && video.ended) return endRound(false, t);
    }

    if (r.phase === "grace") {
      var left = GRACE_SECONDS - (performance.now() - r.graceStart) / 1000;
      if (left <= 0) return endRound(false, t);
      $("grace-fill").style.transform = "scaleX(" + Math.max(0, left / GRACE_SECONDS) + ")";
      $("grace-left").textContent = left.toFixed(1) + " s left";
      $("grace-band-fill").style.transform = "scaleX(" + Math.max(0, left / GRACE_SECONDS) + ")";
      $("grace-band-label").textContent = left.toFixed(1) + " s";
    }
    r.raf = requestAnimationFrame(tick);
  }

  function letterCount(word) { return word.replace(/[^A-Za-z\u00C0-\u024F]/g, "").length; }

  function updateAi(t) {
    var cur = null;
    for (var i = 0; i < r.guesses.length && r.guesses[i].t <= t; i++) cur = r.guesses[i];
    if (!cur || cur === r.lastShown) return;
    if (r.lastShown && r.lastShown.guess !== "nothing") addHistory(r.lastShown.guess);
    r.lastShown = cur;
    var el = $("ai-guess"), hit = isMatch(cur.guess, r.round);
    el.textContent = cur.guess === "nothing" ? "..." : hit ? "Got it!" : cur.guess;
    el.className = "ai-guess" + (hit ? " masked" : "");
    void el.offsetWidth; // restart the slide-in animation
    el.classList.add("pop");
    var sub = $("ai-sub");
    sub.hidden = !hit;
    if (hit) sub.textContent = letterCount(r.round.word) + " letters";
    if (hit && !r.aiHit) {  // pulse the panel once, when the AI first gets it
      var panel = $("ai-panel");
      panel.classList.remove("hit"); void panel.offsetWidth; panel.classList.add("hit");
    }
    r.aiHit = hit;
  }

  function addHistory(g) {
    if (r.history[r.history.length - 1] === g) return;
    r.history.push(g);
    var li = document.createElement("li");
    li.textContent = isMatch(g, r.round) ? "Got it" : g;
    $("ai-history").prepend(li);
    while ($("ai-history").children.length > 8) $("ai-history").lastChild.remove();
  }

  function startGrace(t) {
    r.phase = "grace";
    r.graceStart = performance.now();
    r.graceVideoTime = t;
    var aiGotIt = r.round.aiCorrectAt != null && t >= r.round.aiCorrectAt;
    $("grace").hidden = false;
    $("grace-band").hidden = false;
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
    if (isMatch(g, r.round)) return solveRound();
    var li = document.createElement("li");
    li.textContent = g;
    $("my-guesses").appendChild(li);
    guessInput.classList.remove("wrong"); void guessInput.offsetWidth; guessInput.classList.add("wrong");
    clearTimeout(wrongTimer);
    wrongTimer = setTimeout(function () { guessInput.classList.remove("wrong"); }, 600);
    resume();
  });

  video.addEventListener("error", function () {
    if (!r || r.done || !game) return;
    console.error("Could not load video:", r.round.src);
    clearInterval(introTimer);
    stopRound();
    game.rounds.splice(game.index, 1); // skip broken round, not counted
    nextRound();
  });

  // ---------- results ----------
  var resultTimer = null;

  // Correct guess: freeze the round, flash "Correct!" over the stage, then show the result.
  function solveRound() {
    var t = round1(video.currentTime);
    stopRound();
    $("flash-time").textContent = fmt(t);
    $("correct-flash").hidden = false;
    flashTimer = setTimeout(function () {
      $("correct-flash").hidden = true;
      endRound(true, t);
    }, FLASH_MS);
  }

  // Margin vs the AI. aiTime = aiCorrectAt, or the video length when the AI never gets it.
  // Player time: video time of the correct guess. If missed: end of the grace window (capped at the
  // video length) + MISS_PENALTY, or video length + MISS_PENALTY when the AI never got it.
  // margin = player time - aiTime (negative = beat the AI).
  function endRound(solved, t) {
    stopRound();
    var dur = isFinite(video.duration) ? video.duration : t;
    var ai = r.round.aiCorrectAt;
    var aiNever = ai == null;
    var aiTime = round1(aiNever ? dur : ai);
    var playerTime = solved ? round1(t) : null;
    var effective = solved ? playerTime
      : round1((aiNever ? dur : Math.min(dur, r.graceVideoTime + GRACE_SECONDS)) + MISS_PENALTY);
    var margin = round1(effective - aiTime);
    var beat = solved && margin < 0;
    game.results.push({ word: r.round.word, playerTime: playerTime, aiTime: aiTime, margin: margin, beat: beat });

    var abs = fmt(Math.abs(margin));
    var cls, text, sub;
    if (aiNever) {
      text = "The AI never got it";
      cls = solved ? "ok" : "muted";
      sub = solved ? "You got it, " + fmtSigned(margin) + " vs the video length"
                   : "You missed it too. +" + MISS_PENALTY + " s penalty";
    } else if (solved && margin < 0) {
      text = "You beat the AI by " + abs; cls = "ok"; sub = "Correct";
    } else if (solved && margin === 0) {
      text = "Dead heat with the AI"; cls = "muted"; sub = "Correct";
    } else if (solved) {
      text = "The AI won by " + abs; cls = "ai"; sub = "Correct, but too slow";
    } else {
      text = "Missed: the AI won by " + abs; cls = "ai"; sub = "+" + MISS_PENALTY + " s penalty";
    }
    $("result-headline").textContent = text;
    $("result-headline").className = "result-headline " + cls;
    $("result-eyebrow").textContent = sub;
    $("result-word").textContent = r.round.word;
    $("result-you").textContent = solved ? fmt(playerTime) : "missed";
    $("result-ai").textContent = aiNever ? "never" : fmt(aiTime);
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
    var total = totalSoFar();
    var beaten = game.results.filter(function (x) { return x.beat; }).length;
    var res = window.Store.addScore({ name: game.name, total: total, rounds: game.results });
    latestScoreId = res.entry.id;
    $("final-eyebrow").textContent = "You beat the AI " + beaten + " of " + game.results.length;
    var tot = $("final-total");
    tot.textContent = fmtSigned(total);
    tot.className = "final-total " + (total < 0 ? "ok" : total > 0 ? "ai" : "");
    var rank = $("final-rank");
    rank.textContent = res.rank === 1 ? "New #1 on the scoreboard!" : "Place " + res.rank + " on the scoreboard";
    rank.className = "final-rank" + (res.rank === 1 ? " first" : "");
    var list = $("final-rounds");
    list.innerHTML = "";
    game.results.forEach(function (x) {
      var li = document.createElement("li");
      li.className = x.beat ? "ok" : "ai";
      var w = document.createElement("span");
      w.className = "word"; w.textContent = x.word + (x.playerTime == null ? " (missed)" : "");
      var m = document.createElement("span");
      m.className = "margin"; m.textContent = fmtSigned(x.margin);
      li.appendChild(w); li.appendChild(m);
      list.appendChild(li);
    });
    show("final");
    $("final-next").focus();
    finalTimer = setTimeout(toSignup, FINAL_AUTO_MS);
  }

  $("final-next").addEventListener("click", toSignup);

  function toSignup() {
    clearTimeout(finalTimer);
    if (!game) return;
    var name = game.name;
    show("signup");
    window.Signup.render($("screen-signup"), { name: name, onDone: goStart });
  }

  // Kiosk: if the player clicks the video or anywhere else mid-round, typing still goes to the guess box.
  document.addEventListener("keydown", function (e) {
    if ($("screen-play").hidden || document.activeElement === guessInput || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length === 1 || e.key === "Enter") guessInput.focus();
  });
  $("screen-play").addEventListener("click", function (e) {
    if (e.target.tagName !== "BUTTON") guessInput.focus();
  });

  // ---------- staff panel (Ctrl+Shift+A) ----------
  function openAdmin() {
    var c = window.Store.counts();
    $("admin-counts").textContent = c.scores + " scores, " + c.signups + " sign-ups stored on this laptop.";
    $("admin-confirm").hidden = true;
    $("admin").hidden = false;
  }
  document.addEventListener("keydown", function (e) {
    if (window.GTD_WEB) return;  // staff panel is offline-only
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
