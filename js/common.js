/* Shared helpers for the host and player pages. */
(function () {
  'use strict';

  // Every game is a PeerJS peer named PEER_PREFIX + PIN. Players connect straight to the host's browser.
  const PEER_PREFIX = 'lambdaquizzer-v1-';
  const PEER_OPTS = { debug: 1 };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function randomId(len) {
    const a = new Uint8Array(len || 12);
    crypto.getRandomValues(a);
    return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  }

  function randomPin() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return String(100000 + (a[0] % 900000));
  }

  // Answer slots are Greek letters: indigo α, teal β, orange γ, magenta δ.
  // True/False uses the logic symbols ⊤ (teal) and ⊥ (magenta).
  const SYMBOLS = ['α', 'β', 'γ', 'δ'];
  const SYMBOL_NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const TF_SYMBOLS = ['⊤', '⊥'];
  function styleIdx(isTf, slot) { return isTf ? [1, 3][slot] : slot; }
  function sym(isTf, slot) { return `<span class="sym" aria-hidden="true">${isTf ? TF_SYMBOLS[slot] : SYMBOLS[slot]}</span>`; }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function fmt(n) { return Number(n || 0).toLocaleString(); }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function store(kind) {
    const s = kind === 'session' ? 'sessionStorage' : 'localStorage';
    return {
      get(k) { try { return window[s].getItem(k); } catch (e) { return null; } },
      set(k, v) { try { window[s].setItem(k, v); return true; } catch (e) { return false; } },
      del(k) { try { window[s].removeItem(k); } catch (e) { /* storage blocked */ } }
    };
  }

  /* Confetti burst on a full-screen canvas. */
  function confetti(ms) {
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const resize = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    resize();
    const colors = ['#6d6af0', '#12a594', '#f07a3a', '#d6409f', '#ffffff', '#ffd166'];
    const parts = Array.from({ length: 180 }, () => ({
      x: Math.random() * cv.width, y: -Math.random() * cv.height * 0.6,
      vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr,
      s: (6 + Math.random() * 8) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      col: colors[Math.floor(Math.random() * colors.length)], shape: Math.floor(Math.random() * 3)
    }));
    const end = performance.now() + (ms || 4000);
    (function frame(now) {
      c.clearRect(0, 0, cv.width, cv.height);
      const fading = now > end;
      let alive = 0;
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.04 * dpr; p.r += p.vr; p.vx *= 0.995;
        if (p.y > cv.height + 20) { if (fading) continue; p.y = -20; p.vy = (2 + Math.random() * 3) * dpr; }
        alive++;
        c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col;
        if (p.shape === 0) c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        else if (p.shape === 1) { c.beginPath(); c.arc(0, 0, p.s / 3, 0, 7); c.fill(); }
        else { c.beginPath(); c.moveTo(0, -p.s / 2); c.lineTo(p.s / 2, p.s / 2); c.lineTo(-p.s / 2, p.s / 2); c.fill(); }
        c.restore();
      }
      if (alive) requestAnimationFrame(frame); else cv.remove();
    })(performance.now());
  }

  /* Music / sound toggle buttons. */
  const ICONS = {
    music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="18" cy="16" r="3" fill="currentColor"/></svg>',
    sfx: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };
  function audioToggles(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'audio-toggles';
    const kinds = (opts && opts.music === false) ? ['sfx'] : ['music', 'sfx'];
    kinds.forEach(kind => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-btn';
      const sync = () => {
        const on = kind === 'music' ? LQAudio.musicOn : LQAudio.sfxOn;
        b.classList.toggle('off', !on);
        b.setAttribute('aria-pressed', String(on));
        b.title = (kind === 'music' ? 'Music ' : 'Sound effects ') + (on ? 'on' : 'off');
        b.setAttribute('aria-label', b.title);
      };
      b.innerHTML = ICONS[kind];
      b.addEventListener('click', () => {
        if (kind === 'music') LQAudio.setMusic(!LQAudio.musicOn); else LQAudio.setSfx(!LQAudio.sfxOn);
        sync();
      });
      sync();
      wrap.appendChild(b);
    });
    return wrap;
  }

  // Sets el's text and nudges it so the visible glyphs (not the font's line box) sit dead centre.
  // Digits like "1" are lopsided in their advance box, and fonts reserve more room above than below.
  const inkCtx = document.createElement('canvas').getContext('2d');
  function centerText(el, text) {
    el.textContent = text;
    const place = () => {
      const cs = getComputedStyle(el);
      inkCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = inkCtx.measureText(String(text));
      const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize);
      const baseline = (lineH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      const inkMidY = baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      const inkMidX = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
      el.style.left = (m.width / 2 - inkMidX).toFixed(2) + 'px';
      el.style.top = (lineH / 2 - inkMidY).toFixed(2) + 'px';
    };
    place();
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(place);
  }

  window.LQ = { PEER_PREFIX, centerText, PEER_OPTS, $, $$, esc, randomId, randomPin, SYMBOLS, SYMBOL_NAMES, sym, styleIdx, ordinal, fmt, download, store, confetti, audioToggles };
})();
