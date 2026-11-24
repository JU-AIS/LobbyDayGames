/* storage.js - localStorage-backed score and sign-up store (window.Store).
   Every storage access is guarded; an in-memory copy keeps the game working
   if localStorage is blocked or full. */
// Web mode: true when served over http(s) (GitHub Pages), false when opened from file://.
window.GTD_WEB = window.location.protocol !== 'file:';

(function () {
  'use strict';

  var PREFIX = 'gtd.v1.';
  var mem = { scores: [], signups: [] };

  function read(name) {
    try {
      var raw = window.localStorage.getItem(PREFIX + name);
      if (raw !== null) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) mem[name] = arr;
      }
    } catch (e) { /* use the in-memory copy */ }
    return mem[name];
  }

  function write(name, list) {
    mem[name] = list;
    try { window.localStorage.setItem(PREFIX + name, JSON.stringify(list)); } catch (e) { /* memory only */ }
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
        return { word: String(r && r.word != null ? r.word : ''), time: Number(r && r.time) || 0, solved: !!(r && r.solved) };
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

    var scoreRows = [csvLine(['date', 'name', 'total', 'rounds'])];
    read('scores').slice().sort(byTotal).forEach(function (s) {
      var rounds = (s.rounds || []).map(function (r) { return r.word + ':' + r.time + ':' + r.solved; }).join('|');
      scoreRows.push(csvLine([cell(s.date), cell(s.name, true), cell(s.total), cell(rounds, true)]));
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
