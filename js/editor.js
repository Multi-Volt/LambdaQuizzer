/* Quiz library and editor (host page). */
(function () {
  'use strict';
  const { $, $$, esc, sym, styleIdx } = LQ;
  const Q = LQQuizzes;

  function showView(id) {
    $$('.view').forEach(v => { v.hidden = v.id !== id; });
    window.scrollTo(0, 0);
  }

  /* ---------- library ---------- */

  function renderLibrary() {
    const list = Q.all();
    const el = $('#quizList');
    if (!list.length) {
      el.innerHTML = '<div class="empty card"><h2>No quizzes yet</h2><p>Make your first one. It takes about two minutes.</p></div>';
      return;
    }
    el.innerHTML = list.map(quiz => {
      const n = quiz.questions.length;
      const ok = !Q.problems(quiz).length;
      return `<article class="quiz-card card" data-id="${esc(quiz.id)}">
        <div class="qc-band"></div>
        <h2>${esc(quiz.title || 'Untitled quiz')}</h2>
        <p class="sub">${esc(quiz.description || '')}</p>
        <p class="qc-meta">${n} question${n === 1 ? '' : 's'}${ok ? '' : ' · <span class="warn">needs work</span>'}</p>
        <div class="qc-actions">
          <button class="btn primary" data-act="host" type="button">Host</button>
          <button class="btn ghost" data-act="edit" type="button">Edit</button>
          <details class="menu">
            <summary class="btn ghost" aria-label="More actions">⋯</summary>
            <div class="menu-pop">
              <button data-act="dup" type="button">Duplicate</button>
              <button data-act="export" type="button">Export JSON</button>
              <button data-act="delete" class="danger" type="button">Delete</button>
            </div>
          </details>
        </div>
      </article>`;
    }).join('');
  }

  $('#quizList').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    const card = e.target.closest('.quiz-card');
    if (!btn || !card) return;
    const id = card.dataset.id;
    const quiz = Q.get(id);
    if (!quiz) return;
    switch (btn.dataset.act) {
      case 'host': hostQuiz(quiz); break;
      case 'edit': openEditor(id); break;
      case 'dup': Q.duplicate(id); renderLibrary(); break;
      case 'export': LQ.download(slug(quiz.title) + '.lambdaquiz.json', JSON.stringify(quiz, null, 2)); break;
      case 'delete':
        if (confirm(`Delete "${quiz.title || 'Untitled quiz'}"? This can't be undone.`)) { Q.remove(id); renderLibrary(); }
        break;
    }
  });

  function slug(s) { return (s || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'quiz'; }

  $('#newQuiz').addEventListener('click', () => openEditor(Q.create().id));

  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const added = Q.importText(await file.text());
      renderLibrary();
      alert(added.length ? `Imported ${added.length} quiz${added.length === 1 ? '' : 'zes'}.` : 'No quizzes found in that file.');
    } catch (err) {
      alert('That file is not a LambdaQuizzer quiz (JSON could not be read).');
    }
  });

  function hostQuiz(quiz) {
    const issues = Q.problems(quiz);
    if (issues.length) {
      alert('This quiz is not ready to host yet:\n\n• ' + issues.slice(0, 8).join('\n• ') + (issues.length > 8 ? `\n…and ${issues.length - 8} more` : ''));
      openEditor(quiz.id);
      return;
    }
    LQHost.start(quiz);
  }

  /* ---------- editor ---------- */

  let quiz = null, saveTimer = null;

  function openEditor(id) {
    quiz = Q.get(id);
    if (!quiz) return;
    showView('editor');
    $('#qzTitle').value = quiz.title;
    $('#qzDesc').value = quiz.description;
    renderQuestions();
    setSaved(true);
    if (!quiz.title) $('#qzTitle').focus();
  }

  function setSaved(ok) {
    const el = $('#saveState');
    el.textContent = ok ? 'All changes saved' : 'Saving…';
    el.classList.toggle('pending', !ok);
  }

  function save() {
    setSaved(false);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { Q.put(quiz); setSaved(true); }, 350);
  }
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; Q.put(quiz); setSaved(true); }
  }

  const timeOpts = sel => Q.TIMES.map(t => `<option value="${t}"${t === sel ? ' selected' : ''}>${t < 60 ? t + ' sec' : (t / 60) + ' min'}</option>`).join('');
  const pointOpts = sel => [[1, 'Standard'], [2, 'Double points'], [0, 'No points']].map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('');

  function questionCard(x, i, total) {
    const isTf = x.type === 'tf';
    const slots = isTf ? [0, 1] : [0, 1, 2, 3];
    return `<article class="card q-card" data-i="${i}">
      <div class="q-head">
        <span class="q-num">Question ${i + 1}</span>
        <div class="q-tools">
          <button type="button" class="icon-btn dark" data-act="up" title="Move up" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" class="icon-btn dark" data-act="down" title="Move down" aria-label="Move down"${i === total - 1 ? ' disabled' : ''}>↓</button>
          <button type="button" class="icon-btn dark" data-act="dupq" title="Duplicate" aria-label="Duplicate question">⧉</button>
          <button type="button" class="icon-btn dark danger" data-act="del" title="Delete" aria-label="Delete question">✕</button>
        </div>
      </div>
      <div class="q-settings">
        <label class="field inline"><span>Type</span>
          <select data-f="type"><option value="quiz"${!isTf ? ' selected' : ''}>Quiz</option><option value="tf"${isTf ? ' selected' : ''}>True or false</option></select></label>
        <label class="field inline"><span>Time limit</span><select data-f="time">${timeOpts(x.time)}</select></label>
        <label class="field inline"><span>Points</span><select data-f="points">${pointOpts(x.points)}</select></label>
      </div>
      <label class="field">
        <span class="sr-only">Question text</span>
        <textarea data-f="text" rows="2" maxlength="${Q.LIMITS.text}" placeholder="Start typing your question">${esc(x.text)}</textarea>
      </label>
      <label class="field">
        <span>Image URL <em>(optional)</em></span>
        <input data-f="image" type="url" placeholder="https://…" value="${esc(x.image)}">
      </label>
      <div class="ans-grid ${isTf ? 'tf' : ''}">
        ${slots.map(s => {
          const st = styleIdx(isTf, s);
          const on = x.correct.includes(s);
          return `<div class="ans-edit c${st}">
            ${sym(isTf, s)}
            ${isTf ? `<span class="ans-fixed">${esc(x.answers[s])}</span>`
                   : `<input data-f="ans" data-s="${s}" type="text" maxlength="${Q.LIMITS.answer}" placeholder="Add answer ${s + 1}${s >= 2 ? ' (optional)' : ''}" value="${esc(x.answers[s])}">`}
            <button type="button" class="check${on ? ' on' : ''}" data-act="correct" data-s="${s}" aria-pressed="${on}" title="Mark as correct" aria-label="Answer ${s + 1} is correct">✓</button>
          </div>`;
        }).join('')}
      </div>
      <p class="hint">${isTf ? 'Tap ✓ on the correct answer.' : 'Tap ✓ to mark the correct answer. Mark more than one if several answers count.'}</p>
    </article>`;
  }

  function renderQuestions() {
    const n = quiz.questions.length;
    $('#qList').innerHTML = quiz.questions.map((x, i) => questionCard(x, i, n)).join('');
  }

  $('#qzTitle').addEventListener('input', e => { quiz.title = e.target.value.slice(0, Q.LIMITS.title); save(); });
  $('#qzDesc').addEventListener('input', e => { quiz.description = e.target.value.slice(0, Q.LIMITS.desc); save(); });

  $('#qList').addEventListener('input', e => {
    const card = e.target.closest('.q-card');
    if (!card) return;
    const x = quiz.questions[+card.dataset.i];
    const f = e.target.dataset.f;
    if (f === 'text') x.text = e.target.value;
    else if (f === 'image') x.image = e.target.value.trim();
    else if (f === 'ans') x.answers[+e.target.dataset.s] = e.target.value;
    else return;
    save();
  });

  $('#qList').addEventListener('change', e => {
    const card = e.target.closest('.q-card');
    if (!card) return;
    const x = quiz.questions[+card.dataset.i];
    const f = e.target.dataset.f;
    if (f === 'time') x.time = +e.target.value;
    else if (f === 'points') x.points = +e.target.value;
    else if (f === 'type') {
      x.type = e.target.value;
      if (x.type === 'tf') { x.answers = ['True', 'False', '', '']; x.correct = [0]; if (x.time > 20) x.time = 20; }
      else { x.answers = ['', '', '', '']; x.correct = []; }
      renderQuestions();
    } else return;
    save();
  });

  $('#qList').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    const card = e.target.closest('.q-card');
    if (!btn || !card) return;
    const i = +card.dataset.i;
    const qs = quiz.questions;
    const x = qs[i];
    switch (btn.dataset.act) {
      case 'correct': {
        const s = +btn.dataset.s;
        if (x.type === 'tf') x.correct = [s];
        else x.correct = x.correct.includes(s) ? x.correct.filter(c => c !== s) : x.correct.concat(s).sort();
        if (x.type === 'tf') renderQuestions();
        else { btn.classList.toggle('on', x.correct.includes(s)); btn.setAttribute('aria-pressed', String(x.correct.includes(s))); }
        break;
      }
      case 'up': if (i > 0) { [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]]; renderQuestions(); } break;
      case 'down': if (i < qs.length - 1) { [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]]; renderQuestions(); } break;
      case 'dupq': {
        const c = JSON.parse(JSON.stringify(x)); c.id = LQ.randomId(8);
        qs.splice(i + 1, 0, c); renderQuestions(); break;
      }
      case 'del':
        if (!x.text.trim() || confirm('Delete question ' + (i + 1) + '?')) { qs.splice(i, 1); renderQuestions(); }
        break;
      default: return;
    }
    save();
  });

  $('#addQ').addEventListener('click', () => {
    if (quiz.questions.length >= Q.LIMITS.questions) return alert('That is the maximum number of questions.');
    quiz.questions.push(Q.blankQuestion());
    renderQuestions();
    save();
    const cards = $$('.q-card');
    const last = cards[cards.length - 1];
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('textarea', last).focus({ preventScroll: true });
  });

  $('#editor').addEventListener('click', e => {
    const btn = e.target.closest('.topbar [data-act]');
    if (!btn) return;
    e.preventDefault();
    flush();
    if (btn.dataset.act === 'back') { renderLibrary(); showView('library'); }
    if (btn.dataset.act === 'host') hostQuiz(quiz);
  });

  window.addEventListener('beforeunload', flush);

  window.LQEditor = {
    showLibrary() { renderLibrary(); showView('library'); },
    showView
  };

  renderLibrary();
})();
