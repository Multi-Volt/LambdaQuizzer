/* Quiz storage (browser localStorage) and the starter quizzes. */
(function () {
  'use strict';

  const KEY = 'lq-quizzes-v1';
  const ls = LQ.store('local');
  let memory = null; // used if localStorage is blocked

  const TIMES = [5, 10, 20, 30, 45, 60, 90, 120];
  const LIMITS = { title: 80, desc: 300, text: 240, answer: 90, questions: 100 };

  function q(text, answers, correct, extra) {
    return Object.assign({ id: LQ.randomId(8), type: 'quiz', text, image: '', time: 20, points: 1, answers, correct }, extra || {});
  }
  function tf(text, isTrue, extra) {
    return Object.assign({ id: LQ.randomId(8), type: 'tf', text, image: '', time: 10, points: 1, answers: ['True', 'False', '', ''], correct: [isTrue ? 0 : 1] }, extra || {});
  }

  function samples() {
    return [
      {
        id: LQ.randomId(10), title: 'λ Intro to CS Trivia', description: 'A warm-up for any intro programming class.', updated: Date.now(),
        questions: [
          q('What does the λ in "lambda calculus" describe?', ['A loop', 'A function', 'A variable type', 'A compiler'], [1]),
          tf('In most languages, arrays start at index 0.', true),
          q('Which data structure is LIFO (last in, first out)?', ['Queue', 'Stack', 'Heap', 'Linked list'], [1]),
          q('What is the time complexity of binary search?', ['O(n)', 'O(n log n)', 'O(log n)', 'O(1)'], [2]),
          q('Who is considered the first computer programmer?', ['Alan Turing', 'Ada Lovelace', 'Grace Hopper', 'Charles Babbage'], [1], { time: 30 }),
          tf('HTML is a programming language.', false),
          q('What does "git commit -m" do?', ['Deletes a branch', 'Saves a snapshot with a message', 'Pushes to GitHub', 'Merges two branches'], [1]),
          q('Which of these is NOT a programming language?', ['Python', 'Rust', 'Haskell', 'Photoshop'], [3], { points: 2, time: 20 })
        ]
      },
      {
        id: LQ.randomId(10), title: 'Campus Life Speed Round', description: 'Fast, silly questions for an icebreaker.', updated: Date.now(),
        questions: [
          q('Best time to start a 10-page paper due tomorrow?', ['Two weeks ago', 'Right now', 'After one more episode', '11:59 PM'], [0, 1], { time: 10 }),
          tf('Coffee counts as a food group during finals week.', true, { time: 5, points: 0 }),
          q('Roughly how many hours are in a 15-week semester?', ['360', '1,500', '2,520', '10,080'], [2], { time: 20 }),
          q('What does "GPA" stand for?', ['Grade Point Average', 'General Performance Assessment', 'Grand Party Attendance', 'Graded Paper Allowance'], [0], { time: 10 })
        ]
      }
    ];
  }

  function load() {
    if (memory) return memory;
    const raw = ls.get(KEY);
    if (raw) {
      try { const v = JSON.parse(raw); if (Array.isArray(v)) { memory = v.map(normalize).filter(Boolean); return memory; } } catch (e) { /* fall through */ }
    }
    memory = samples();
    persist();
    return memory;
  }
  function persist() { ls.set(KEY, JSON.stringify(memory)); }

  const str = (v, max) => String(v == null ? '' : v).slice(0, max);

  // Make any imported or stored object a well-formed quiz (or null).
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const qs = Array.isArray(raw.questions) ? raw.questions.slice(0, LIMITS.questions) : [];
    return {
      id: str(raw.id, 40) || LQ.randomId(10),
      title: str(raw.title, LIMITS.title) || 'Untitled quiz',
      description: str(raw.description, LIMITS.desc),
      updated: Number(raw.updated) || Date.now(),
      questions: qs.map(x => {
        x = x || {};
        const type = x.type === 'tf' ? 'tf' : 'quiz';
        let answers = Array.isArray(x.answers) ? x.answers.slice(0, 4).map(a => str(a, LIMITS.answer)) : [];
        while (answers.length < 4) answers.push('');
        if (type === 'tf') answers = ['True', 'False', '', ''];
        let correct = Array.isArray(x.correct) ? x.correct.map(Number).filter(i => i >= 0 && i < (type === 'tf' ? 2 : 4)) : [];
        correct = Array.from(new Set(correct));
        if (type === 'tf' && correct.length !== 1) correct = [0];
        const time = TIMES.includes(Number(x.time)) ? Number(x.time) : 20;
        const points = [0, 1, 2].includes(Number(x.points)) ? Number(x.points) : 1;
        return { id: str(x.id, 20) || LQ.randomId(8), type, text: str(x.text, LIMITS.text), image: str(x.image, 500), time, points, answers, correct };
      })
    };
  }

  // Problems that stop a quiz from being hosted.
  function problems(quiz) {
    const out = [];
    if (!quiz.questions.length) out.push('Add at least one question.');
    quiz.questions.forEach((x, i) => {
      const n = 'Question ' + (i + 1);
      if (!x.text.trim()) out.push(n + ' has no question text.');
      const filled = x.answers.map((a, j) => a.trim() ? j : -1).filter(j => j >= 0);
      if (filled.length < 2) out.push(n + ' needs at least two answers.');
      if (!x.correct.some(j => filled.includes(j))) out.push(n + ' needs a correct answer marked.');
    });
    return out;
  }

  function blankQuestion() { return q('', ['', '', '', ''], []); }

  window.LQQuizzes = {
    TIMES, LIMITS,
    all: () => load().slice().sort((a, b) => b.updated - a.updated),
    get: id => load().find(x => x.id === id) || null,
    put(quiz) {
      const list = load();
      quiz.updated = Date.now();
      const i = list.findIndex(x => x.id === quiz.id);
      if (i >= 0) list[i] = quiz; else list.push(quiz);
      persist();
    },
    remove(id) { memory = load().filter(x => x.id !== id); persist(); },
    create() {
      const quiz = { id: LQ.randomId(10), title: '', description: '', updated: Date.now(), questions: [blankQuestion()] };
      load().push(quiz); persist();
      return quiz;
    },
    duplicate(id) {
      const src = this.get(id);
      if (!src) return null;
      const copy = normalize(JSON.parse(JSON.stringify(src)));
      copy.id = LQ.randomId(10);
      copy.title = (src.title + ' (copy)').slice(0, LIMITS.title);
      copy.questions.forEach(x => { x.id = LQ.randomId(8); });
      this.put(copy);
      return copy;
    },
    importText(text) {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : [data];
      const added = [];
      arr.forEach(raw => {
        const quiz = normalize(raw);
        if (!quiz) return;
        quiz.id = LQ.randomId(10);
        this.put(quiz);
        added.push(quiz);
      });
      return added;
    },
    normalize, problems, blankQuestion
  };
})();
