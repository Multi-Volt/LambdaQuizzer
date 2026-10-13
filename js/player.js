/* Player (phone) side: enter PIN, pick a nickname, tap answers. */
(function () {
  'use strict';
  const { $, esc, sym, styleIdx, ordinal, fmt } = LQ;
  const A = LQAudio;
  const ss = LQ.store('session');

  const app = $('#app');
  const S = { pin: '', peer: null, conn: null, token: '', name: '', score: 0, q: -1, answered: false, phase: 'pin', timeout: null, total: 0 };

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  // Flavor text lives in js/messages.js so it is easy to edit.
  const MSG = window.LQ_MESSAGES || {};
  const quip = (key, fallback) => { const list = Array.isArray(MSG[key]) && MSG[key].length ? MSG[key] : [fallback]; return pick(list); };

  $('#corner').appendChild(LQ.audioToggles({ music: false }));

  function screen(cls, html) {
    document.body.dataset.screen = cls;
    app.innerHTML = html;
  }
  function setBar() {
    const bar = $('#pbar');
    bar.hidden = !S.name;
    $('#pbName').textContent = S.name;
    $('#pbScore').textContent = fmt(S.score);
  }

  /* ---------- PIN ---------- */

  function showPin(error) {
    S.phase = 'pin';
    S.name = ''; setBar();
    screen('join', `<div class="join-card">
      <img class="join-logo" src="assets/logo.svg" alt="">
      <h1 class="wordmark">LambdaQuizzer</h1>
      <form id="pinForm" class="card join-box" autocomplete="off">
        <label class="sr-only" for="pinIn">Game PIN</label>
        <input id="pinIn" class="big-input" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="Game PIN" value="${esc(S.pin)}">
        <button class="btn dark big block" type="submit">Enter</button>
        ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
      </form>
      <p class="host-link">Teaching or running a review session? <a href="host.html">Create and host a quiz</a></p>
    </div>`);
    const input = $('#pinIn');
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
    $('#pinForm').addEventListener('submit', e => {
      e.preventDefault();
      const pin = input.value.replace(/\D/g, '');
      if (pin.length !== 6) { showPin('Game PINs are 6 digits.'); return; }
      A.sfx('click');
      connect(pin);
    });
    if (!error) setTimeout(() => input.focus(), 50);
  }

  function connecting(msg) {
    screen('wait', `<div class="center-msg"><div class="spinner"></div><h2>${esc(msg || 'Connecting…')}</h2></div>`);
  }

  function teardown() {
    clearTimeout(S.timeout);
    if (S.conn) { S.conn.removeAllListeners && S.conn.removeAllListeners(); try { S.conn.close(); } catch (e) { /* closed */ } }
    if (S.peer) { try { S.peer.destroy(); } catch (e) { /* closed */ } }
    S.conn = null; S.peer = null;
  }

  function connect(pin) {
    teardown();
    S.pin = pin;
    // Keep the PIN in the address bar so a refresh rejoins the same game.
    if (new URLSearchParams(location.search).get('pin') !== pin) history.replaceState(null, '', '?pin=' + pin);
    S.token = ss.get('lq-token-' + pin) || LQ.randomId(16);
    ss.set('lq-token-' + pin, S.token);
    S.name = ss.get('lq-name-' + pin) || '';
    connecting(S.name ? 'Rejoining…' : 'Finding your game…');
    const peer = new Peer(LQ.PEER_OPTS);
    S.peer = peer;
    S.timeout = setTimeout(() => { if (S.peer === peer && !(S.conn && S.conn.open)) { teardown(); showPin('Could not reach that game. Check the PIN and your connection.'); } }, 15000);
    peer.on('open', () => {
      const conn = peer.connect(LQ.PEER_PREFIX + pin, { reliable: true });
      S.conn = conn;
      conn.on('open', () => {
        clearTimeout(S.timeout);
        conn.send({ t: 'join', token: S.token, name: S.name });
      });
      conn.on('data', m => { if (S.conn === conn && m && typeof m === 'object') onMessage(m); });
      conn.on('close', () => { if (S.conn === conn) hostLost(); });
    });
    peer.on('error', err => {
      if (S.peer !== peer) return;
      if (err.type === 'peer-unavailable') {
        if (S.phase === 'pin' || S.phase === 'connecting') { teardown(); showPin('We didn’t recognize that game PIN. Please check and try again.'); }
        else hostLost();
      } else if (!(S.conn && S.conn.open)) {
        teardown(); showPin('Connection problem (' + (err.type || 'error') + '). Try again.');
      }
    });
    S.phase = 'connecting';
  }

  function hostLost() {
    if (S.phase === 'ended' || S.phase === 'kicked') return;
    const pin = S.pin;
    teardown();
    S.phase = 'lost';
    screen('wait', `<div class="center-msg">
      <h2>Lost connection to the game</h2>
      <p>Your score is saved if the game is still running.</p>
      <button class="btn dark big" id="rejoin" type="button">Rejoin</button>
      <p><a href="index.html" class="link-light">Join a different game</a></p>
    </div>`);
    $('#rejoin').onclick = () => connect(pin);
  }

  /* ---------- nickname ---------- */

  function showName(error) {
    S.phase = 'name';
    screen('join', `<div class="join-card">
      <img class="join-logo" src="assets/logo.svg" alt="">
      <h1 class="wordmark">LambdaQuizzer</h1>
      <form id="nameForm" class="card join-box" autocomplete="off">
        <label class="sr-only" for="nameIn">Nickname</label>
        <input id="nameIn" class="big-input" maxlength="15" placeholder="Nickname" value="${esc(S.pendingName || '')}" autocapitalize="words" spellcheck="false">
        <button class="btn dark big block" type="submit">Join</button>
        ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
      </form>
      <p class="host-link">Game PIN ${esc(S.pin)} · <a href="index.html">change</a></p>
    </div>`);
    const input = $('#nameIn');
    setTimeout(() => input.focus(), 50);
    $('#nameForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = input.value.replace(/\s+/g, ' ').trim();
      if (!name) return showName('Pick a nickname first.');
      S.pendingName = name;
      A.sfx('click');
      if (S.conn && S.conn.open) S.conn.send({ t: 'join', token: S.token, name });
      else connect(S.pin);
    });
  }

  /* ---------- messages from host ---------- */

  function onMessage(m) {
    switch (m.t) {
      case 'needname': S.name = ''; ss.del('lq-name-' + S.pin); showName(); break;
      case 'reject':
        if (m.code === 'name') { showName(m.reason); break; }
        if (m.code === 'kicked') { kicked(); break; }
        teardown(); showPin(m.reason || 'Could not join this game.');
        break;
      case 'welcome':
        S.name = String(m.name || '').slice(0, 15);
        S.score = Number(m.score) || 0;
        S.quiz = String(m.quiz || '').slice(0, 80);
        ss.set('lq-name-' + S.pin, S.name);
        setBar();
        break;
      case 'lobby': lobby(); break;
      case 'getready': getReady(m); break;
      case 'question': question(m); break;
      case 'ack': lockedIn(); break;
      case 'reveal': reveal(m); break;
      case 'scoreboard': scoreboard(m); break;
      case 'end': end(m); break;
      case 'kicked': kicked(); break;
      case 'hostleft': S.phase = 'ended'; teardown(); screen('wait', `<div class="center-msg"><h2>The host ended the game</h2><p><a class="btn dark big" href="index.html">Join another game</a></p></div>`); break;
    }
  }

  function lobby() {
    S.phase = 'lobby';
    A.sfx('join');
    screen('lobby', `<div class="center-msg">
      <h1 class="youre-in">Joined</h1>
      <p class="big-sub">Look for your name on the big screen.</p>
      <div class="name-pill">${esc(S.name)}</div>
      ${S.quiz ? `<p class="muted">${esc(S.quiz)}</p>` : ''}
    </div>`);
  }

  function getReady(m) {
    S.phase = 'getready';
    S.total = m.total;
    screen('wait', `<div class="center-msg">
      <p class="q-of">Question ${m.q + 1} of ${m.total}</p>
      <h1 class="youre-in">Eyes on the screen</h1>
      <div class="loader-shapes">${[0, 1, 2, 3].map(i => `<span class="c${i}">${sym(false, i)}</span>`).join('')}</div>
    </div>`);
  }

  function question(m) {
    S.phase = 'answering';
    S.q = m.q;
    S.answered = false;
    const slots = Array.isArray(m.slots) ? m.slots.filter(s => s >= 0 && s < 4) : [];
    screen('answer', `<div class="answer-screen">
      <div class="answer-top"><span>Question ${m.q + 1} of ${m.total}</span></div>
      <div class="answer-grid n${slots.length}">
        ${slots.map(s => {
          const st = styleIdx(m.tf, s);
          return `<button type="button" class="answer-btn c${st}" data-slot="${s}" aria-label="${m.tf ? (s === 0 ? 'True' : 'False') : LQ.SYMBOL_NAMES[s]}">
            ${sym(m.tf, s)}${m.tf ? `<span class="tf-label">${s === 0 ? 'True' : 'False'}</span>` : ''}</button>`;
        }).join('')}
      </div>
    </div>`);
    app.querySelectorAll('.answer-btn').forEach(btn => btn.addEventListener('click', () => {
      if (S.answered || !S.conn) return;
      S.answered = true;
      btn.classList.add('chosen');
      A.sfx('submit');
      if (navigator.vibrate) navigator.vibrate(30);
      S.conn.send({ t: 'answer', q: S.q, slot: Number(btn.dataset.slot) });
      setTimeout(lockedIn, 180);
    }));
  }

  function lockedIn() {
    if (S.phase !== 'answering' || document.body.dataset.screen === 'locked') return;
    S.answered = true;
    screen('locked', `<div class="center-msg">
      <div class="spinner"></div>
      <h1 class="youre-in">${esc(quip('locked', 'Answer locked in.'))}</h1>
    </div>`);
  }

  function reveal(m) {
    S.phase = 'reveal';
    S.score = Number(m.score) || 0;
    setBar();
    const kind = !m.answered ? 'late' : m.correct ? 'right' : 'wrong';
    const title = { right: 'Correct', wrong: 'Incorrect', late: 'Time’s up' }[kind];
    const icon = kind === 'right' ? '✓' : '✕';
    let place;
    if (m.rank === 1) place = m.total > 1 ? 'You’re in 1st place!' : 'You’re in the lead!';
    else place = `You’re in ${ordinal(m.rank)} place${m.ahead ? `, ${fmt(m.ahead.gap)} points behind <b>${esc(m.ahead.name)}</b>` : ''}`;
    screen(kind, `<div class="center-msg result">
      <h1 class="result-title">${title}</h1>
      <div class="result-icon">${icon}</div>
      ${kind === 'right' && m.streak >= 2 ? `<div class="streak-pill">Hot streak <b>×${m.streak}</b></div>` : ''}
      ${kind === 'right' ? `<div class="points-pill">+ ${fmt(m.pts)}</div>` : `<p class="big-sub">${esc(quip(kind, kind === 'late' ? 'Out of time.' : 'Not quite.'))}</p>`}
      ${kind === 'right' ? `<p class="big-sub">${esc(quip('right', 'Nice work.'))}</p>` : ''}
      <p class="place">${place}</p>
    </div>`);
    if (kind === 'right') { A.sfx('correct'); if (m.streak >= 3) setTimeout(() => A.sfx('streak'), 600); }
    else A.sfx('wrong');
    if (navigator.vibrate) navigator.vibrate(kind === 'right' ? [40, 60, 40] : 200);
  }

  function scoreboard(m) {
    S.phase = 'scoreboard';
    S.score = Number(m.score) || 0;
    setBar();
    screen('wait', `<div class="center-msg">
      <p class="q-of">Scoreboard</p>
      <div class="rank-big">${ordinal(m.rank)}</div>
      <p class="big-sub">${esc(m.rank <= 3 ? quip('scoreboardTop3', 'Top three!') : quip('scoreboardRest', 'Keep going.'))}</p>
      <p class="muted">${fmt(m.score)} points · ${m.total} players</p>
    </div>`);
  }

  function end(m) {
    S.phase = 'ended';
    S.score = Number(m.score) || 0;
    setBar();
    const medal = ['🥇', '🥈', '🥉'][m.rank - 1];
    screen(m.rank <= 3 ? 'podium' : 'wait', `<div class="center-msg">
      <p class="q-of">Final results</p>
      ${medal ? `<div class="medal-big">${medal}</div>` : ''}
      <div class="rank-big">${ordinal(m.rank)} place</div>
      <p class="big-sub">${fmt(m.score)} points · ${m.correct} of ${m.questions} correct</p>
      <p class="muted">${esc(m.rank === 1 ? quip('endFirst', 'Winner!') : m.rank <= 3 ? quip('endPodium', 'Podium finish!') : quip('endRest', 'Good game.'))}</p>
      <p><a class="btn dark big" href="index.html">Play again</a></p>
    </div>`);
    // Wait for the podium reveal on the big screen before celebrating.
    setTimeout(() => {
      if (m.rank <= 3) { A.sfx('fanfare'); LQ.confetti(4000); } else A.sfx('ding');
    }, 4700);
    ss.del('lq-name-' + S.pin);
    ss.del('lq-token-' + S.pin);
  }

  function kicked() {
    S.phase = 'kicked';
    ss.del('lq-name-' + S.pin);
    ss.del('lq-token-' + S.pin);
    S.name = ''; setBar();
    teardown();
    screen('wrong', `<div class="center-msg"><h2>The host removed you from the game</h2><p><a class="btn dark big" href="index.html">Back</a></p></div>`);
  }

  /* ---------- start ---------- */

  const params = new URLSearchParams(location.search);
  const pinParam = (params.get('pin') || '').replace(/\D/g, '');
  if (pinParam.length === 6) {
    S.pin = pinParam;
    connect(pinParam);
  } else {
    showPin();
  }
})();
