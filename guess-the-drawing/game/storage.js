/* storage.js - localStorage-backed score and sign-up store (window.Store).
   Every storage access is guarded; an in-memory copy keeps the game working
   if localStorage is blocked or full. */
// Web mode: true when served over http(s) (GitHub Pages), false when opened from file://.
window.GTD_WEB = window.location.protocol !== 'file:';

(function () {
  'use strict';

  // Scores moved to v2 (margin vs the AI); old v1 total-time scores must not mix in. Sign-ups keep their key.
  var KEYS = { scores: 'gtd.v2.scores', signups: 'gtd.v1.signups' };
  var LEGACY_SCORES_KEY = 'gtd.v1.scores';
  var mem = { scores: [], signups: [] };

  function read(name) {
    try {
      var raw = window.localStorage.getItem(KEYS[name]);
      if (raw !== null) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) mem[name] = arr;
      }
    } catch (e) { /* use the in-memory copy */ }
    return mem[name];
  }

  function write(name, list) {
    mem[name] = list;
    try { window.localStorage.setItem(KEYS[name], JSON.stringify(list)); } catch (e) { /* memory only */ }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function byTotal(a, b) {
    if (a.total !== b.total) return a.total - b.total;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  }

  function sortedScores() {
    return read('scores').slice().sort(byTotal);
  }

  function addScore(o) {
    o = o || {};
    var entry = {
      id: newId(),
      date: new Date().toISOString(),
      name: String(o.name == null ? '' : o.name).trim(),
      total: Number(o.total) || 0,
      rounds: (Array.isArray(o.rounds) ? o.rounds : []).map(function (r) {
        r = r || {};
        return {
          word: String(r.word != null ? r.word : ''),
          playerTime: r.playerTime == null ? null : Number(r.playerTime) || 0,
          aiTime: Number(r.aiTime) || 0,
          margin: Number(r.margin) || 0,
          beat: !!r.beat
        };
      })
    };
    var list = read('scores').slice();
    list.push(entry);
    write('scores', list);
    return { rank: list.slice().sort(byTotal).indexOf(entry) + 1, entry: entry };
  }

  function topScores(n) {
    return sortedScores().slice(0, n == null ? 10 : n);
  }

  // Total = summed margin vs the AI (negative = ahead of the AI); lowest ranks first.
  // A new score loses ties against existing ones (it has a later date).
  function rankOf(total) {
    total = Number(total) || 0;
    return read('scores').filter(function (s) { return s.total <= total; }).length + 1;
  }

  function addSignup(o) {
    o = o || {};
    var consent = o.consent === true;
    var entry = {
      id: newId(),
      date: new Date().toISOString(),
      name: String(o.name == null ? '' : o.name).trim(),
      email: consent ? String(o.email == null ? '' : o.email).trim() : '',
      consent: consent,
      departments: Array.isArray(o.departments) ? o.departments.map(String) : [],
      interested: String(o.interested || '')
    };
    var list = read('signups').slice();
    list.push(entry);
    write('signups', list);
    return entry;
  }

  function counts() {
    return { scores: read('scores').length, signups: read('signups').length };
  }

  /* ---- CSV export ---- */

  // Quote when needed; for free-text fields, neutralise spreadsheet formulas.
  function cell(v, text) {
    var s = String(v == null ? '' : v);
    if (text && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csvLine(cells) { return cells.join(','); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function download(filename, csv) {
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  function exportCSV() {
    var day = today();

    // rounds = word:playerTime:aiTime:margin:beat per round ("miss" when the player did not get it), joined by |
    var scoreRows = [csvLine(['date', 'name', 'total_margin', 'beat_count', 'rounds'])];
    read('scores').slice().sort(byTotal).forEach(function (s) {
      var list = s.rounds || [];
      var beat = list.filter(function (r) { return r.beat; }).length;
      var rounds = list.map(function (r) {
        return [r.word, r.playerTime == null ? 'miss' : r.playerTime, r.aiTime, r.margin, r.beat].join(':');
      }).join('|');
      scoreRows.push(csvLine([cell(s.date), cell(s.name, true), cell(s.total), cell(beat), cell(rounds, true)]));
    });

    var signupRows = [csvLine(['date', 'name', 'email', 'consent', 'departments', 'interested'])];
    read('signups').forEach(function (s) {
      signupRows.push(csvLine([
        cell(s.date), cell(s.name, true), cell(s.email, true), cell(s.consent),
        cell((s.departments || []).join(';'), true), cell(s.interested)
      ]));
    });

    download('gtd-scores-' + day + '.csv', scoreRows.join('\r\n') + '\r\n');
    setTimeout(function () {
      download('gtd-signups-' + day + '.csv', signupRows.join('\r\n') + '\r\n');
    }, 300);
  }

  function clearAll() {
    write('scores', []);
    write('signups', []);
    try { window.localStorage.removeItem(LEGACY_SCORES_KEY); } catch (e) { /* ignore */ }
  }

  window.Store = {
    addScore: addScore,
    topScores: topScores,
    rankOf: rankOf,
    addSignup: addSignup,
    counts: counts,
    exportCSV: exportCSV,
    clearAll: clearAll
  };
})();
