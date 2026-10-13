/* Live game host. The host's browser is the game server: players connect to it over WebRTC (PeerJS). */
(function () {
  'use strict';
  const { $, esc, sym, styleIdx, ordinal, fmt } = LQ;
  const A = LQAudio;

  const MAX_PLAYERS = 250;
  const GET_READY_SECS = 3;

  let G = null; // current game

  const stage = () => $('#stage');

  function cleanName(s) {
    return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 15);
  }

  function joinUrl(pin) {
    const u = new URL('index.html', location.href);
    u.search = '?pin=' + pin;
    u.hash = '';
    return u.href;
  }
  function shortJoinUrl() {
    const u = new URL('./', location.href);
    return (u.host + u.pathname).replace(/\/$/, '');
  }

  /* ---------- lifecycle ---------- */

  function start(quiz) {
    stop();
    const questions = quiz.questions.map(x => {
      const slots = (x.type === 'tf' ? [0, 1] : [0, 1, 2, 3]).filter(s => x.answers[s].trim());
      return { text: x.text.trim(), image: x.image, tf: x.type === 'tf', time: x.time, points: x.points, answers: x.answers, slots, correct: x.correct.filter(s => slots.includes(s)) };
    });
    G = {
      quiz, qs: questions, pin: null, peer: null, players: new Map(), banned: new Set(),
      phase: 'connecting', qi: -1, cur: null, answers: new Map(), locked: false, timers: [], tick: null, qStart: 0, lastSec: null
    };
    LQEditor.showView('game');
    document.documentElement.classList.add('in-game');
    const tg = $('#gbToggles');
    tg.innerHTML = '';
    tg.appendChild(LQ.audioToggles());
    $('#gbPin').hidden = true;
    $('#gbInfo').textContent = '';
    stage().innerHTML = '<div class="center-msg"><div class="spinner"></div><h2>Creating your game…</h2></div>';
    A.preloadMusic();
    A.playMusic('lobby');
    createPeer(0);
  }

  function stop() {
    if (!G) return;
    clearTimers();
    G.players.forEach(p => { try { p.conn && p.conn.close(); } catch (e) { /* closed */ } });
    try { G.peer && G.peer.destroy(); } catch (e) { /* closed */ }
    A.stopMusic();
    document.documentElement.classList.remove('in-game');
    G = null;
  }

  function clearTimers() {
    if (!G) return;
    G.timers.forEach(clearTimeout);
    G.timers = [];
    if (G.tick) clearInterval(G.tick);
    G.tick = null;
  }
  function later(ms, fn) { const g = G; G.timers.push(setTimeout(() => { if (G === g) fn(); }, ms)); }

  function createPeer(attempt) {
    const g = G;
    const pin = LQ.randomPin();
    const peer = new Peer(LQ.PEER_PREFIX + pin, LQ.PEER_OPTS);
    peer.on('open', () => {
      if (G !== g) return peer.destroy();
      g.pin = pin; g.peer = peer; g.phase = 'lobby';
      renderLobby();
    });
    peer.on('connection', conn => { if (G === g) onConnection(conn); });
    peer.on('disconnected', () => { if (G === g && !peer.destroyed) setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500); });
    peer.on('error', err => {
      if (G !== g) return;
      if (err.type === 'unavailable-id' && attempt < 6) { peer.destroy(); createPeer(attempt + 1); return; }
      if (!g.peer) {
        stage().innerHTML = `<div class="center-msg"><h2>Couldn't create the game</h2>
          <p>The connection service could not be reached (${esc(err.type || 'error')}). Check your internet connection and try again.</p>
          <button class="btn primary big" type="button" id="retryPeer">Try again</button></div>`;
        $('#retryPeer').onclick = () => start(g.quiz);
      } else {
        console.warn('Peer error', err);
      }
    });
  }

  /* ---------- networking ---------- */

  function send(p, msg) {
    if (p && p.conn && p.conn.open) { try { p.conn.send(msg); } catch (e) { /* closed */ } }
  }
  function broadcast(fnOrMsg) {
    G.players.forEach(p => send(p, typeof fnOrMsg === 'function' ? fnOrMsg(p) : fnOrMsg));
  }
  function connected() { return Array.from(G.players.values()).filter(p => p.connected); }

  function onConnection(conn) {
    const g = G;
    conn.on('data', m => { if (G === g && m && typeof m === 'object') onMessage(conn, m); });
    conn.on('close', () => {
      if (G !== g) return;
      const p = Array.from(g.players.values()).find(x => x.conn === conn);
      if (!p) return;
      p.conn = null; p.connected = false;
      if (g.phase === 'lobby') { g.players.delete(p.token); renderLobbyPlayers(); }
      else if (g.phase === 'answering') { updateAnswerCount(); maybeAllAnswered(); }
    });
    conn.on('error', () => { /* handled by close */ });
  }

  function onMessage(conn, m) {
    if (m.t === 'join') return onJoin(conn, m);
    const p = Array.from(G.players.values()).find(x => x.conn === conn);
    if (!p) return;
    if (m.t === 'answer') onAnswer(p, m);
  }

  function reject(conn, reason, code) {
    try { conn.send({ t: 'reject', reason, code: code || '' }); } catch (e) { /* closed */ }
  }

  function onJoin(conn, m) {
    const token = String(m.token || '').slice(0, 40);
    if (!token) return;
    if (G.banned.has(token)) { reject(conn, 'The host removed you from this game.', 'kicked'); return; }
    let p = G.players.get(token);
    if (p) { // rejoining (refresh, flaky Wi-Fi)
      if (p.conn && p.conn !== conn) { try { p.conn.close(); } catch (e) { /* closed */ } }
      p.conn = conn; p.connected = true;
      send(p, { t: 'welcome', name: p.name, score: p.score, quiz: G.quiz.title });
      sendState(p);
      if (G.phase === 'lobby') renderLobbyPlayers();
      return;
    }
    const name = cleanName(m.name);
    if (!name) { try { conn.send({ t: 'needname' }); } catch (e) { /* closed */ } return; }
    if (G.locked) { reject(conn, 'This game is locked. Ask the host to unlock it.', 'locked'); return; }
    if (G.phase === 'podium') { reject(conn, 'This game has already ended.', 'ended'); return; }
    if (G.players.size >= MAX_PLAYERS) { reject(conn, 'This game is full.', 'full'); return; }
    const lower = name.toLowerCase();
    if (Array.from(G.players.values()).some(x => x.name.toLowerCase() === lower)) { reject(conn, 'That nickname is taken. Try another one.', 'name'); return; }
    p = { token, name, conn, connected: true, score: 0, streak: 0, hist: [], lastReveal: null, joinedAt: Date.now() };
    G.players.set(token, p);
    send(p, { t: 'welcome', name, score: 0, quiz: G.quiz.title });
    sendState(p);
    if (G.phase === 'lobby') { A.sfx('join'); renderLobbyPlayers(true); }
  }

  function sendState(p) {
    const total = G.qs.length;
    switch (G.phase) {
      case 'lobby': send(p, { t: 'lobby' }); break;
      case 'getready': case 'reading': send(p, { t: 'getready', q: G.qi, total }); break;
      case 'answering':
        if (G.answers.has(p.token)) send(p, { t: 'ack' });
        else send(p, questionMsg());
        break;
      case 'reveal': send(p, p.lastReveal || revealFor(p)); break;
      case 'scoreboard': send(p, { t: 'scoreboard', rank: rankOf(p), score: p.score, total: G.players.size }); break;
      case 'podium': send(p, endMsg(p)); break;
    }
  }

  function questionMsg() {
    const c = G.cur;
    const left = Math.max(0, c.time * 1000 - (performance.now() - G.qStart));
    return { t: 'question', q: G.qi, total: G.qs.length, slots: c.slots, tf: c.tf, time: c.time, left: Math.round(left) };
  }

  /* ---------- lobby ---------- */

  function renderLobby() {
    $('#gbPin').hidden = true;
    $('#gbInfo').innerHTML = '<div class="gb-q">Waiting for players</div>';
    const qr = qrcode(0, 'M');
    qr.addData(joinUrl(G.pin));
    qr.make();
    stage().innerHTML = `<div class="lobby">
      <div class="join-panel">
        <div class="join-how">
          <p>Join at <b>${shortJoinUrl().split('/').map(s => `<span>${esc(s)}</span>`).join('/<wbr>')}</b></p>
          <p class="or">or scan the QR code with your phone camera</p>
        </div>
        <div class="pin-box"><span>Game PIN:</span><strong>${G.pin.slice(0, 3)} ${G.pin.slice(3)}</strong></div>
        <a class="qr" href="${esc(joinUrl(G.pin))}" target="_blank" rel="noopener" title="Join link">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</a>
      </div>
      <div class="lobby-bar">
        <div class="count"><b id="pCount">0</b><span>players</span></div>
        <div class="lobby-title">${esc(G.quiz.title || 'Untitled quiz')}</div>
        <div class="row">
          <button class="btn ghost" id="lockBtn" type="button">${G.locked ? 'Unlock' : 'Lock'}</button>
          <button class="btn primary big" id="startBtn" type="button" disabled>Start</button>
        </div>
      </div>
      <div id="lobbyPlayers" class="lobby-players"></div>
    </div>`;
    $('#startBtn').onclick = () => { if (G.players.size) startGame(); };
    $('#lockBtn').onclick = e => { G.locked = !G.locked; e.target.textContent = G.locked ? 'Unlock' : 'Lock'; A.sfx('click'); };
    $('#lobbyPlayers').addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      kick(chip.dataset.token);
    });
    renderLobbyPlayers();
  }

  function renderLobbyPlayers(newest) {
    const box = $('#lobbyPlayers');
    if (!box || G.phase !== 'lobby') return;
    const list = Array.from(G.players.values());
    $('#pCount').textContent = list.length;
    $('#startBtn').disabled = !list.length;
    if (!list.length) { box.innerHTML = '<div class="waiting-note">Waiting for players…</div>'; return; }
    box.innerHTML = list.map((p, i) => `<button type="button" class="chip${newest && i === list.length - 1 ? ' pop' : ''}" data-token="${esc(p.token)}" title="Click to remove ${esc(p.name)}">${esc(p.name)}</button>`).join('');
  }

  function kick(token) {
    const p = G.players.get(token);
    if (!p) return;
    G.banned.add(token);
    send(p, { t: 'kicked' });
    const conn = p.conn;
    setTimeout(() => { try { conn && conn.close(); } catch (e) { /* closed */ } }, 300);
    G.players.delete(token);
    A.sfx('pop');
    renderLobbyPlayers();
  }

  /* ---------- question flow ---------- */

  function startGame() {
    A.sfx('click');
    $('#gbPin').hidden = false;
    $('#gbPin').innerHTML = `PIN <b>${G.pin}</b>`;
    nextQuestion();
  }

  function setInfo(label) {
    const n = G.qs.length;
    const segs = n <= 30 ? `<div class="gb-progress">${G.qs.map((_, i) => `<i class="${i < G.qi ? 'done' : i === G.qi ? 'now' : ''}"></i>`).join('')}</div>` : '';
    $('#gbInfo').innerHTML = label ? `<div class="gb-q">${esc(label)}</div>` : `<div class="gb-q">Question <b>${G.qi + 1}</b> of ${n}</div>${segs}`;
  }

  function nextQuestion() {
    clearTimers();
    G.qi++;
    if (G.qi >= G.qs.length) return showPodium();
    G.cur = G.qs[G.qi];
    G.answers = new Map();
    G.players.forEach(p => { p.lastReveal = null; });
    getReady();
  }

  function getReady() {
    G.phase = 'getready';
    setInfo();
    A.stopMusic(0.4);
    A.cueMusic('question');
    A.sfx('whoosh');
    broadcast({ t: 'getready', q: G.qi, total: G.qs.length });
    const label = G.qi === G.qs.length - 1 ? 'Last question!' : `Question ${G.qi + 1}`;
    stage().innerHTML = `<div class="getready">
      <div class="gr-label">${label}</div>
      <div class="gr-count"><span id="grNum"></span></div>
      <div class="gr-sub">${G.cur.tf ? 'True or false' : 'Quiz'}${G.cur.points === 2 ? ' · <b>Double points!</b>' : G.cur.points === 0 ? ' · No points' : ''}</div>
    </div>`;
    LQ.centerText($('#grNum'), GET_READY_SECS);
    A.sfx('count');
    for (let i = 1; i < GET_READY_SECS; i++) {
      later(i * 1000, () => { const el = $('#grNum'); if (el) { LQ.centerText(el, GET_READY_SECS - i); el.parentNode.classList.remove('bump'); void el.offsetWidth; el.parentNode.classList.add('bump'); } A.sfx('count'); });
    }
    later(GET_READY_SECS * 1000, reading);
  }

  function imageHtml(c) {
    return c.image ? `<div class="q-image"><img src="${esc(c.image)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('broken')"></div>` : '';
  }

  function reading() {
    G.phase = 'reading';
    const c = G.cur;
    const ms = Math.min(6000, Math.max(2500, 1500 + c.text.length * 40));
    A.sfx('go');
    stage().innerHTML = `<div class="reading">
      <h1 class="q-text big">${esc(c.text)}</h1>
      ${imageHtml(c) || '<div class="q-image empty"></div>'}
      <div class="read-bar"><i style="animation-duration:${ms}ms"></i></div>
    </div>`;
    later(ms, answering);
  }

  function answerTiles(c, reveal) {
    return `<div class="tiles n${c.slots.length}">${c.slots.map(s => {
      const st = styleIdx(c.tf, s);
      const ok = c.correct.includes(s);
      const cls = reveal ? (ok ? ' right' : ' dim') : '';
      return `<div class="tile c${st}${cls}">${sym(c.tf, s)}<span class="tile-text">${esc(c.answers[s])}</span>${reveal && ok ? '<span class="tick">✓</span>' : ''}</div>`;
    }).join('')}</div>`;
  }

  function answering() {
    G.phase = 'answering';
    const c = G.cur;
    G.qStart = performance.now();
    G.lastSec = null;
    stage().innerHTML = `<div class="answering">
      <div class="q-banner"><h1 class="q-text">${esc(c.text)}</h1></div>
      <div class="q-mid">
        <div class="timer-ring" id="tRing"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="tr-track" cx="50" cy="50" r="45"/><circle class="tr-arc" id="tArc" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="100 100"/></svg><span id="tLeft"></span></div>
        ${imageHtml(c) || '<div class="q-image placeholder"><img src="assets/logo.svg" alt=""></div>'}
        <div class="q-side">
          <div class="ans-count"><b id="aCount">0</b><span>Answers</span></div>
          <button class="btn ghost small" id="skipBtn" type="button">Skip</button>
        </div>
      </div>
      ${answerTiles(c, false)}
    </div>`;
    LQ.centerText($('#tLeft'), c.time);
    $('#skipBtn').onclick = endQuestion;
    broadcast(questionMsg());
    A.playMusic('question');
    G.tick = setInterval(() => {
      const left = c.time - (performance.now() - G.qStart) / 1000;
      const sec = Math.max(0, Math.ceil(left));
      const el = $('#tLeft');
      if (el && el.textContent !== String(sec)) LQ.centerText(el, sec);
      const arc = $('#tArc');
      if (arc) arc.setAttribute('stroke-dasharray', `${(Math.max(0, left / c.time) * 100).toFixed(2)} 100`);
      if (sec !== G.lastSec) {
        G.lastSec = sec;
        if (sec <= 5 && sec > 0) { A.sfx('tickUrgent'); const r = $('#tRing'); if (r) r.classList.add('urgent'); }
      }
      if (left <= 0) endQuestion();
    }, 100);
  }

  function updateAnswerCount() {
    const el = $('#aCount');
    if (el) el.textContent = G.answers.size;
  }

  function maybeAllAnswered() {
    const live = connected();
    if (live.length && live.every(p => G.answers.has(p.token))) later(400, endQuestion);
  }

  function onAnswer(p, m) {
    if (G.phase !== 'answering' || m.q !== G.qi || G.answers.has(p.token)) return;
    const slot = Number(m.slot);
    if (!G.cur.slots.includes(slot)) return;
    const ms = performance.now() - G.qStart;
    G.answers.set(p.token, { slot, ms });
    send(p, { t: 'ack' });
    A.sfx('click');
    updateAnswerCount();
    maybeAllAnswered();
  }

  function scorePlayers() {
    const c = G.cur;
    G.players.forEach(p => {
      const a = G.answers.get(p.token);
      const correct = !!a && c.correct.includes(a.slot);
      let pts = 0;
      if (correct) {
        p.streak++;
        if (c.points) {
          const frac = Math.min(1, a.ms / (c.time * 1000));
          pts = Math.round(1000 * c.points * (1 - frac / 2));
          if (p.streak >= 2) pts += Math.min(p.streak - 1, 5) * 100;
        }
      } else {
        p.streak = 0;
      }
      p.score += pts;
      p.hist[G.qi] = { slot: a ? a.slot : null, correct, pts, ms: a ? Math.round(a.ms) : null };
    });
  }

  function ranked() {
    return Array.from(G.players.values()).sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  }
  function rankOf(p) { return ranked().indexOf(p) + 1; }

  function revealFor(p, order) {
    order = order || ranked();
    const h = p.hist[G.qi] || { slot: null, correct: false, pts: 0 };
    const r = order.indexOf(p);
    const ahead = r > 0 ? order[r - 1] : null;
    return {
      t: 'reveal', q: G.qi, answered: h.slot != null, correct: h.correct, pts: h.pts, score: p.score,
      streak: p.streak, rank: r + 1, total: order.length,
      ahead: ahead ? { name: ahead.name, gap: ahead.score - p.score } : null
    };
  }

  function endQuestion() {
    if (G.phase !== 'answering') return;
    clearTimers();
    G.phase = 'reveal';
    A.stopMusic(0.05);
    A.sfx(G.answers.size ? 'gong' : 'timeup');
    scorePlayers();
    const order = ranked();
    G.players.forEach(p => { p.lastReveal = revealFor(p, order); send(p, p.lastReveal); });

    const c = G.cur;
    const counts = {};
    c.slots.forEach(s => { counts[s] = 0; });
    G.answers.forEach(a => { counts[a.slot]++; });
    const max = Math.max(1, ...Object.values(counts));
    const last = G.qi === G.qs.length - 1;
    stage().innerHTML = `<div class="reveal">
      <div class="q-banner"><h1 class="q-text">${esc(c.text)}</h1></div>
      <div class="chart-row">
        <div class="chart">${c.slots.map(s => {
          const st = styleIdx(c.tf, s);
          const ok = c.correct.includes(s);
          return `<div class="bar-col c${st}${ok ? '' : ' dim'}">
            <div class="bar-n">${counts[s]}${ok ? ' <span class="tick">✓</span>' : ''}</div>
            <div class="bar" style="--h:${Math.round(counts[s] / max * 100)}%"></div>
            <div class="bar-base">${sym(c.tf, s)}</div>
          </div>`;
        }).join('')}</div>
        <button class="btn primary big" id="nextBtn" type="button">${last ? 'Final results' : 'Next'}</button>
      </div>
      ${answerTiles(c, true)}
    </div>`;
    $('#nextBtn').onclick = last ? showPodium : showScoreboard;
    $('#nextBtn').focus();
  }

  function showScoreboard() {
    clearTimers();
    G.phase = 'scoreboard';
    const order = ranked();
    broadcast(p => ({ t: 'scoreboard', rank: order.indexOf(p) + 1, score: p.score, total: order.length }));
    A.sfx('whoosh');
    A.playMusic('results');
    const top = order.slice(0, 5);
    const streaker = order.filter(p => p.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
    stage().innerHTML = `<div class="scoreboard">
      <div class="sb-head"><h1>Scoreboard</h1><button class="btn primary big" id="nextBtn" type="button">Next</button></div>
      <ol class="sb-list">${top.map((p, i) => `<li style="animation-delay:${i * 90}ms">
        <span class="sb-rank">${i + 1}</span><span class="sb-name">${esc(p.name)}${p.streak >= 3 ? ` <span class="streak" title="Hot streak">×${p.streak}</span>` : ''}</span><span class="sb-score">${fmt(p.score)}</span></li>`).join('')}
      </ol>
      ${streaker ? `<p class="sb-note">${esc(streaker.name)} is on a ${streaker.streak}-question hot streak</p>` : ''}
    </div>`;
    $('#nextBtn').onclick = nextQuestion;
    $('#nextBtn').focus();
  }

  function endMsg(p) {
    const order = ranked();
    return { t: 'end', rank: order.indexOf(p) + 1, score: p.score, total: order.length, correct: p.hist.filter(h => h && h.correct).length, questions: G.qs.length };
  }

  function showPodium() {
    clearTimers();
    G.phase = 'podium';
    setInfo('Final results');
    A.stopMusic(0.3);
    const order = ranked();
    broadcast(endMsg);
    const places = [order[1], order[0], order[2]]; // 2nd, 1st, 3rd
    stage().innerHTML = `<div class="podium-wrap">
      <h1 class="podium-title">${esc(G.quiz.title || 'Results')}</h1>
      <div class="podium">${places.map((p, i) => {
        const place = [2, 1, 3][i];
        if (!p) return `<div class="pod p${place} empty"></div>`;
        return `<div class="pod p${place}" id="pod${place}">
          <div class="pod-name">${esc(p.name)}</div>
          <div class="pod-block"><div class="medal">${place}</div><div class="pod-score">${fmt(p.score)}</div>
          <div class="pod-correct">${p.hist.filter(h => h && h.correct).length} of ${G.qs.length} correct</div></div>
        </div>`;
      }).join('')}</div>
      <div class="podium-actions" id="podActions" hidden>
        <button class="btn ghost" id="csvBtn" type="button">Download results (CSV)</button>
        <button class="btn ghost" id="againBtn" type="button">Play again</button>
        <button class="btn primary" id="doneBtn" type="button">Back to quizzes</button>
      </div>
    </div>`;
    A.sfx('drumroll', 4.7);   // rolls under the 3rd and 2nd place reveals, cuts off as 1st lands
    const reveal = (place, at) => later(at, () => { const el = $('#pod' + place); if (el) el.classList.add('show'); });
    reveal(3, 2500);
    reveal(2, 3500);
    later(4700, () => {
      const el = $('#pod1'); if (el) el.classList.add('show');
      A.sfx('fanfare');
      LQ.confetti(6000);
      $('#podActions').hidden = false;
    });
    later(8000, () => A.playMusic('results'));
    $('#csvBtn').onclick = downloadCsv;
    $('#againBtn').onclick = () => { const q = G.quiz; if (confirm('Start a new game with a new PIN? Players will need to join again.')) start(q); };
    $('#doneBtn').onclick = () => { stop(); LQEditor.showLibrary(); };
  }

  function downloadCsv() {
    const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""') + '"' : s; };
    const head = ['Rank', 'Nickname', 'Score', 'Correct'].concat(G.qs.map((_, i) => 'Q' + (i + 1)));
    const rows = ranked().map((p, i) => [i + 1, p.name, p.score, p.hist.filter(h => h && h.correct).length].concat(G.qs.map((q, qi) => {
      const h = p.hist[qi];
      if (!h || h.slot == null) return '-';
      return (h.correct ? '✓ ' : '✗ ') + q.answers[h.slot];
    })));
    const csv = [head].concat(rows).map(r => r.map(cell).join(',')).join('\n');
    LQ.download((G.quiz.title || 'results').replace(/[^\w-]+/g, '_') + '_results.csv', '﻿' + csv, 'text/csv');
  }

  /* ---------- controls ---------- */

  $('#endGame').addEventListener('click', () => {
    if (!G) return;
    if (G.phase === 'podium' || confirm('End this game for everyone?')) {
      if (G.phase !== 'podium') broadcast({ t: 'hostleft' });
      setTimeout(() => { stop(); LQEditor.showLibrary(); }, 150);
    }
  });

  document.addEventListener('keydown', e => {
    if (!G || e.target.closest('input, textarea, select')) return;
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.id !== 'nextBtn') {
      const next = $('#nextBtn') || (G.phase === 'lobby' && !$('#startBtn').disabled && $('#startBtn'));
      if (next) { e.preventDefault(); next.click(); }
    }
  });

  window.addEventListener('beforeunload', e => {
    if (G && G.players.size && G.phase !== 'podium') { e.preventDefault(); e.returnValue = ''; }
  });

  window.LQHost = { start };
})();
