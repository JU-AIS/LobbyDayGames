/* signup.js - recruitment sign-up form shown after a round (window.Signup).
   Requires storage.js (window.Store) and signup.css. */
(function () {
  'use strict';

  var DEPARTMENTS = [
    'AI Development',
    'AI Research',
    'Tech & Platform',
    'Growth (marketing & events)',
    'Business & Partnerships'
  ];
  var IDLE_MS = 60000;
  var THANKS_MS = 1500;
  var INTEREST = [['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Web mode only: sign-ups go to the JU AIS Google Sheet through an Apps Script web app.
  var SIGNUP_URL = 'https://script.google.com/macros/s/AKfycbzIhSJeSwzWqRifwBnRoDcaLRG04IkezxED6LhklqGra5bZIe729yHHGNLWx6eDTdLMlg/exec';
  var CONSENT_TEXT = 'I agree that JU AIS may store my email to contact me about joining. It is deleted after recruitment.';
  var CONSENT_TEXT_WEB = 'I agree that JU AIS may store my email in a Google Sheet to contact me about joining. It is deleted after recruitment.';

  var cleanupPrev = null; // tears down a form that is still open

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function render(container, opts) {
    opts = opts || {};
    if (cleanupPrev) cleanupPrev();

    var finished = false;
    var idleTimer = null;
    var thanksTimer = null;

    function finish() {
      if (finished) return;
      finished = true;
      teardown();
      if (typeof opts.onDone === 'function') opts.onDone();
    }

    function teardown() {
      clearTimeout(idleTimer);
      clearTimeout(thanksTimer);
      ['input', 'change', 'click', 'keydown', 'pointerdown', 'touchstart'].forEach(function (ev) {
        container.removeEventListener(ev, resetIdle, true);
      });
      if (cleanupPrev === abort) cleanupPrev = null;
    }

    // Called when render() replaces this form: stop timers, never call onDone.
    function abort() { finished = true; teardown(); }
    cleanupPrev = abort;

    function resetIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, IDLE_MS);
    }

    /* ---- build form ---- */
    var nameIn = el('input', { type: 'text', id: 'su-name', autocomplete: 'off', maxlength: '60' });
    nameIn.value = opts.name || '';
    var nameErr = el('p', { class: 'su-error', role: 'alert' });

    var emailIn = el('input', { type: 'email', id: 'su-email', autocomplete: 'off', maxlength: '120', placeholder: 'you@example.com' });
    var emailErr = el('p', { class: 'su-error', role: 'alert' });

    var consentIn = el('input', { type: 'checkbox', id: 'su-consent' });
    var consentErr = el('p', { class: 'su-error', role: 'alert' });

    var deptBoxes = DEPARTMENTS.map(function (d) {
      var cb = el('input', { type: 'checkbox', value: d });
      return cb;
    });

    var interestIns = INTEREST.map(function (p) {
      return el('input', { type: 'radio', name: 'su-interest', value: p[0] });
    });
    var interestErr = el('p', { class: 'su-error', role: 'alert' });

    var sendBtn = el('button', { type: 'button', class: 'su-btn su-primary', text: 'Send' });
    var skipBtn = el('button', { type: 'button', class: 'su-btn su-secondary', text: 'Skip' });

    var form = el('form', { class: 'su-card', novalidate: '' }, [
      el('h2', { class: 'su-title', text: 'Want to join JU AIS?' }),
      el('p', { class: 'su-sub', text: 'Leave your details and we will tell you how to get involved.' }),

      el('div', { class: 'su-field' }, [el('label', { for: 'su-name', text: 'Your name' }), nameIn, nameErr]),
      el('div', { class: 'su-field' }, [el('label', { for: 'su-email', text: 'Email (optional)' }), emailIn, emailErr]),

      el('div', { class: 'su-field' }, [
        el('label', { class: 'su-check', for: 'su-consent' }, [
          consentIn,
          el('span', { text: window.GTD_WEB ? CONSENT_TEXT_WEB : CONSENT_TEXT })
        ]),
        consentErr
      ]),

      el('fieldset', { class: 'su-field' }, [
        el('legend', { text: 'Which teams sound interesting?' }),
        el('div', { class: 'su-depts' }, DEPARTMENTS.map(function (d, i) {
          return el('label', { class: 'su-check' }, [deptBoxes[i], el('span', { text: d })]);
        }))
      ]),

      el('fieldset', { class: 'su-field' }, [
        el('legend', { text: 'Are you interested in JU AIS?' }),
        el('div', { class: 'su-toggles' }, INTEREST.map(function (p, i) {
          return el('label', { class: 'su-toggle' }, [interestIns[i], el('span', { text: p[1] })]);
        })),
        interestErr
      ]),

      el('div', { class: 'su-actions' }, [sendBtn, skipBtn])
    ]);

    var root = el('div', { class: 'signup' }, [form]);
    container.innerHTML = '';
    container.appendChild(root);

    /* ---- behaviour ---- */
    function setErr(p, msg) { p.textContent = msg || ''; }

    function validate() {
      var ok = true;
      var email = emailIn.value.trim();
      setErr(nameErr); setErr(emailErr); setErr(consentErr); setErr(interestErr);
      if (!nameIn.value.trim()) { setErr(nameErr, 'Please enter your name.'); ok = false; }
      if (email && !EMAIL_RE.test(email)) { setErr(emailErr, 'That email address does not look right.'); ok = false; }
      if (email && !consentIn.checked) { setErr(consentErr, 'Please tick the box so we may store your email, or clear the email field.'); ok = false; }
      if (!interestIns.some(function (r) { return r.checked; })) { setErr(interestErr, 'Please pick Yes, Maybe or No.'); ok = false; }
      return ok;
    }

    function send() {
      if (finished || !validate()) return;
      var chosen = interestIns.filter(function (r) { return r.checked; })[0];
      var entry = {
        name: nameIn.value.trim(),
        email: emailIn.value.trim(),
        consent: consentIn.checked,
        departments: deptBoxes.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }),
        interested: chosen ? chosen.value : ''
      };
      if (window.GTD_WEB) {
        // Fire and forget: text/plain avoids a CORS preflight; "Thanks!" does not wait for the response.
        var payload = { name: entry.name, email: entry.consent ? entry.email : '', consent: entry.consent, departments: entry.departments, interested: entry.interested };
        fetch(SIGNUP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }).catch(function (e) { console.warn('Sign-up failed', e); });
      } else {
        window.Store.addSignup(entry);
      }
      clearTimeout(idleTimer);
      sendBtn.disabled = skipBtn.disabled = true;
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'su-card su-thanks', role: 'status' }, [
        el('h2', { class: 'su-title', text: 'Thanks!' }),
        el('p', { class: 'su-sub', text: 'See you around JU AIS.' })
      ]));
      thanksTimer = setTimeout(finish, THANKS_MS);
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); send(); });
    sendBtn.addEventListener('click', send);
    skipBtn.addEventListener('click', finish);

    // Any activity inside the container restarts the idle countdown.
    ['input', 'change', 'click', 'keydown', 'pointerdown', 'touchstart'].forEach(function (ev) {
      container.addEventListener(ev, resetIdle, true);
    });
    resetIdle();
  }

  window.Signup = { DEPARTMENTS: DEPARTMENTS, render: render };
})();
