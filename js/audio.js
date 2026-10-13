/* LambdaQuizzer audio: a tiny MIDI-style sequencer and sound effects, all synthesized with Web Audio.
   Songs are written as MIDI note numbers on a 16-step grid, so there are no audio files to load. */
(function () {
  'use strict';

  const PREF_KEY = 'lq-audio';
  const prefs = (() => {
    try { return Object.assign({ music: true, sfx: true }, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); }
    catch (e) { return { music: true, sfx: true }; }
  })();
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ } }

  let ctx = null, master, musicBus, sfxBus, noiseBuf;

  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0.85;
      master.connect(comp); comp.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? 0.5 : 0; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfx ? 0.9 : 0; sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Browsers only allow sound after a user gesture.
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => window.addEventListener(ev, init, { passive: true }));

  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);

  /* ---------- voices ---------- */

  function tone(o) {
    const t = o.t, dur = o.dur, vol = o.vol == null ? 0.2 : o.vol;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + (o.slideTime || dur));
    if (o.detune) osc.detune.value = o.detune;
    if (o.vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = o.vibrato;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t + 0.08); lfo.stop(t + dur + 0.1);
    }
    const g = ctx.createGain();
    const atk = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    if (o.pluck) {
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else {
      const rel = Math.min(o.release || 0.06, dur * 0.5);
      g.gain.setValueAtTime(vol, t + Math.max(atk, dur - rel));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type || 'lowpass';
      f.frequency.setValueAtTime(o.filter.freq, t);
      if (o.filter.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t + dur);
      f.Q.value = o.filter.q || 0.8;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.dest || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noise(o) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.ftype || 'highpass';
    f.frequency.setValueAtTime(o.freq || 6000, o.t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, o.t + o.dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.linearRampToValueAtTime(o.vol, o.t + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(o.t, Math.random() * 0.5); src.stop(o.t + o.dur + 0.05);
  }

  function kick(t, dest, vol) {
    tone({ type: 'sine', freq: 160, slideTo: 42, slideTime: 0.12, t, dur: 0.28, vol: vol || 0.8, pluck: true, dest });
  }
  function snare(t, dest, vol) {
    noise({ t, dur: 0.16, vol: vol || 0.3, ftype: 'bandpass', freq: 1900, q: 0.6, dest });
    tone({ type: 'triangle', freq: 200, slideTo: 140, t, dur: 0.08, vol: (vol || 0.3) * 0.6, pluck: true, dest });
  }
  function clap(t, dest, vol) {
    for (let i = 0; i < 3; i++) noise({ t: t + i * 0.011, dur: 0.05 + i * 0.04, vol: (vol || 0.25) * (i === 2 ? 1 : 0.6), ftype: 'bandpass', freq: 1300, q: 1.2, dest });
  }
  function hat(t, dest, vol, open) {
    noise({ t, dur: open ? 0.18 : 0.035, vol: vol || 0.08, ftype: 'highpass', freq: 8000, dest });
  }
  function block(t, dest, freq, vol) {
    tone({ type: 'sine', freq, t, dur: 0.06, vol: vol || 0.2, pluck: true, dest });
  }

  /* ---------- songs (MIDI note numbers, 16 steps per bar) ---------- */

  // [step, midiNote, lengthInSteps]
  function seq(bars) {
    return bars.map(bar => { const m = {}; bar.forEach(([s, n, l]) => { m[s] = { n, l }; }); return m; });
  }

  // Lobby: a bouncy F major groove. F | Dm | Bb | C, twice, with a different melody each time.
  const LOBBY_CHORDS = [
    { root: 41, notes: [57, 60, 65] }, // F
    { root: 38, notes: [57, 62, 65] }, // Dm
    { root: 34, notes: [58, 62, 65] }, // Bb
    { root: 36, notes: [55, 60, 64] }  // C
  ];
  const LOBBY_MELODY = seq([
    [[0, 72, 2], [2, 69, 2], [4, 72, 2], [6, 77, 4], [10, 76, 2], [12, 74, 2], [14, 72, 2]],
    [[0, 69, 2], [2, 74, 2], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 69, 2], [14, 72, 2]],
    [[0, 74, 2], [2, 70, 2], [4, 74, 2], [6, 77, 2], [8, 79, 3], [11, 77, 1], [12, 74, 2], [14, 70, 2]],
    [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 84, 2], [8, 82, 2], [10, 79, 2], [12, 76, 2], [14, 79, 2]],
    [[0, 72, 2], [2, 69, 2], [4, 72, 2], [6, 77, 4], [10, 76, 2], [12, 77, 2], [14, 79, 2]],
    [[0, 81, 3], [3, 79, 1], [4, 77, 2], [6, 74, 2], [8, 69, 4], [12, 74, 2], [14, 76, 2]],
    [[0, 77, 2], [2, 74, 2], [4, 70, 2], [6, 74, 2], [8, 77, 4], [12, 79, 2], [14, 81, 2]],
    [[0, 79, 2], [2, 76, 2], [4, 72, 2], [6, 67, 2], [8, 69, 2], [10, 70, 2], [12, 72, 4]]
  ]);
  const LOBBY_BASS = { 0: 0, 3: 0, 6: 12, 8: 0, 10: 7, 12: 12, 14: 0 };

  // Question: a driving A minor countdown groove. Am | F | G | E
  const Q_CHORDS = [
    { root: 45, notes: [57, 60, 64] },
    { root: 41, notes: [57, 60, 65] },
    { root: 43, notes: [55, 59, 62] },
    { root: 40, notes: [56, 59, 64] }
  ];
  const Q_ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3];
  const Q_HOOK = seq([
    [[0, 76, 3], [3, 76, 1], [4, 77, 2], [6, 76, 2], [8, 72, 4], [12, 71, 2], [14, 72, 2]],
    [[0, 69, 6], [8, 72, 2], [10, 77, 2], [12, 76, 4]],
    [[0, 74, 3], [3, 74, 1], [4, 76, 2], [6, 74, 2], [8, 71, 4], [12, 67, 2], [14, 71, 2]],
    [[0, 68, 4], [4, 71, 4], [8, 76, 4], [12, 80, 4]]
  ]);

  const SONGS = {
    lobby: {
      bpm: 116, bars: 8, swing: 0.14,
      step(bar, s, t, sp, out) {
        const ch = LOBBY_CHORDS[bar % 4];
        if (s % 4 === 0) kick(t, out, 0.7);
        if (s === 4 || s === 12) { snare(t, out, 0.22); clap(t, out, 0.16); }
        if (s % 2 === 0) hat(t, out, s % 4 === 2 ? 0.07 : 0.035);
        if (s === 14 && bar % 2 === 1) hat(t, out, 0.07, true);
        const b = LOBBY_BASS[s];
        if (b != null) {
          tone({ type: 'triangle', freq: mtof(ch.root + 12 + b), t, dur: sp * 1.8, vol: 0.34, pluck: true, dest: out });
          tone({ type: 'square', freq: mtof(ch.root + 12 + b), t, dur: sp * 1.4, vol: 0.06, pluck: true, filter: { freq: 900, to: 200 }, dest: out });
        }
        if (s === 2 || s === 6 || s === 10 || s === 14) {
          ch.notes.forEach(n => tone({ type: 'square', freq: mtof(n), t, dur: sp * 1.3, vol: 0.035, pluck: true, filter: { freq: 2600, to: 700 }, dest: out }));
        }
        // Marimba-ish sparkle on the last beat of every other bar.
        if (bar % 2 === 1 && s >= 12) {
          const n = ch.notes[(s - 12) % 3] + 24;
          tone({ type: 'sine', freq: mtof(n), t, dur: sp * 1.5, vol: 0.06, pluck: true, dest: out });
        }
        const m = LOBBY_MELODY[bar][s];
        if (m) {
          const d = m.l * sp * 0.92;
          tone({ type: 'square', freq: mtof(m.n), t, dur: d, vol: 0.075, vibrato: m.l > 2 ? 4 : 0, filter: { freq: 3800 }, attack: 0.01, release: 0.05, dest: out });
          tone({ type: 'sine', freq: mtof(m.n + 12), t, dur: Math.min(d, 0.25), vol: 0.05, pluck: true, dest: out });
        }
      }
    },
    question: {
      bpm: 138, bars: 4, swing: 0,
      step(bar, s, t, sp, out) {
        const ch = Q_CHORDS[bar % 4];
        if (s % 4 === 0) kick(t, out, 0.8);
        if (s === 4 || s === 12) clap(t, out, 0.2);
        hat(t, out, s % 2 === 0 ? 0.06 : 0.03);
        // Clock tick-tock on every beat.
        if (s % 4 === 0) block(t, out, s % 8 === 0 ? 1650 : 1250, 0.09);
        if (s % 2 === 0) {
          const n = ch.root + 12 + (s % 4 === 2 ? 12 : 0);
          tone({ type: 'sawtooth', freq: mtof(n), t, dur: sp * 1.6, vol: 0.09, pluck: true, filter: { freq: 1200, to: 180, q: 4 }, dest: out });
          tone({ type: 'triangle', freq: mtof(n), t, dur: sp * 1.6, vol: 0.22, pluck: true, dest: out });
        }
        const arpNotes = ch.notes.concat(ch.notes[0] + 12);
        tone({ type: 'square', freq: mtof(arpNotes[Q_ARP[s]] + 12), t, dur: sp * 0.9, vol: 0.03, pluck: true, filter: { freq: 3000, to: 900 }, dest: out });
        const m = Q_HOOK[bar][s];
        if (m) tone({ type: 'sawtooth', freq: mtof(m.n), t, dur: m.l * sp * 0.9, vol: 0.045, filter: { freq: 2200 }, attack: 0.01, vibrato: m.l > 3 ? 5 : 0, dest: out });
      }
    }
  };

  /* ---------- sequencer ---------- */

  let song = null, songName = null, songGain = null, stepIdx = 0, nextTime = 0, timer = null;

  function schedule() {
    if (!song || !ctx) return;
    const sp = 60 / song.bpm / 4;
    const total = song.bars * 16;
    const ahead = document.hidden ? 1.2 : 0.18;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.02;
    while (nextTime < ctx.currentTime + ahead) {
      const s = stepIdx % total;
      const swing = (s % 2 === 1) ? song.swing * sp : 0;
      song.step(Math.floor(s / 16), s % 16, nextTime + swing, sp, songGain);
      nextTime += sp;
      stepIdx++;
    }
  }

  function playMusic(name) {
    if (!init()) return;
    if (songName === name) return;
    stopMusic(0.15);
    song = SONGS[name]; songName = name;
    songGain = ctx.createGain();
    songGain.connect(musicBus);
    stepIdx = 0;
    nextTime = ctx.currentTime + 0.08;
    schedule();
    timer = setInterval(schedule, 25);
  }

  function stopMusic(fade) {
    if (timer) clearInterval(timer);
    timer = null;
    if (songGain && ctx) {
      const g = songGain;
      g.gain.setTargetAtTime(0, ctx.currentTime, (fade == null ? 0.3 : fade) / 3);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, 1500);
    }
    song = null; songName = null; songGain = null;
  }

  /* ---------- sound effects ---------- */

  const SFX = {
    join(t) {
      const base = 76 + Math.floor(Math.random() * 5);
      tone({ type: 'sine', freq: mtof(base), slideTo: mtof(base + 7), slideTime: 0.06, t, dur: 0.14, vol: 0.3, pluck: true });
      tone({ type: 'square', freq: mtof(base + 12), t: t + 0.06, dur: 0.12, vol: 0.06, pluck: true });
    },
    pop(t) { tone({ type: 'sine', freq: 600, slideTo: 150, slideTime: 0.1, t, dur: 0.14, vol: 0.3, pluck: true }); },
    click(t) { tone({ type: 'triangle', freq: 900, slideTo: 1400, slideTime: 0.04, t, dur: 0.07, vol: 0.25, pluck: true }); },
    submit(t) {
      tone({ type: 'sine', freq: mtof(79), t, dur: 0.1, vol: 0.25, pluck: true });
      tone({ type: 'sine', freq: mtof(86), t: t + 0.07, dur: 0.16, vol: 0.22, pluck: true });
    },
    tick(t) { block(t, sfxBus, 1500, 0.3); },
    tickUrgent(t) { block(t, sfxBus, 2000, 0.4); block(t + 0.12, sfxBus, 1500, 0.25); },
    count(t) { tone({ type: 'square', freq: mtof(81), t, dur: 0.16, vol: 0.12, pluck: true, filter: { freq: 3000 } }); },
    go(t) { tone({ type: 'square', freq: mtof(93), t, dur: 0.35, vol: 0.12, pluck: true, filter: { freq: 4000 } }); },
    whoosh(t) { noise({ t, dur: 0.45, vol: 0.25, ftype: 'bandpass', freq: 300, to: 4000, q: 1.5, attack: 0.15 }); },
    gong(t) {
      const f0 = 98;
      [[1, 0.5, 3.2], [2.76, 0.22, 2.2], [5.4, 0.12, 1.4], [8.93, 0.07, 0.9], [1.5, 0.15, 2.6]].forEach(([r, v, d]) => {
        tone({ type: 'sine', freq: f0 * r, t, dur: d, vol: v, pluck: true, vibrato: 1.5 });
      });
      noise({ t, dur: 0.6, vol: 0.12, ftype: 'lowpass', freq: 2500, to: 300 });
    },
    correct(t) {
      [72, 76, 79, 84].forEach((n, i) => tone({ type: 'square', freq: mtof(n), t: t + i * 0.07, dur: 0.22, vol: 0.09, pluck: true, filter: { freq: 4000 } }));
      [84, 88, 91].forEach(n => tone({ type: 'sine', freq: mtof(n), t: t + 0.3, dur: 0.7, vol: 0.09, pluck: true }));
      noise({ t: t + 0.28, dur: 0.5, vol: 0.05, ftype: 'highpass', freq: 9000 });
    },
    wrong(t) {
      tone({ type: 'sawtooth', freq: mtof(55), slideTo: mtof(53), t, dur: 0.3, vol: 0.14, filter: { freq: 900 } });
      tone({ type: 'sawtooth', freq: mtof(52), slideTo: mtof(46), slideTime: 0.55, t: t + 0.32, dur: 0.6, vol: 0.14, filter: { freq: 900, to: 300 }, vibrato: 6 });
    },
    timeup(t) {
      tone({ type: 'square', freq: mtof(64), t, dur: 0.18, vol: 0.1, filter: { freq: 1500 } });
      tone({ type: 'square', freq: mtof(60), t: t + 0.2, dur: 0.4, vol: 0.1, filter: { freq: 1500, to: 400 } });
    },
    ding(t) {
      tone({ type: 'sine', freq: mtof(88), t, dur: 1.0, vol: 0.18, pluck: true });
      tone({ type: 'sine', freq: mtof(95), t, dur: 0.6, vol: 0.06, pluck: true });
    },
    drumroll(t, dur) {
      dur = dur || 2.4;
      let x = 0, gap = 0.07;
      while (x < dur) {
        const p = x / dur;
        snare(t + x, sfxBus, 0.06 + 0.22 * p);
        x += gap; gap = Math.max(0.035, gap * 0.985);
      }
      kick(t + dur, sfxBus, 0.9);
      noise({ t: t + dur, dur: 1.4, vol: 0.18, ftype: 'highpass', freq: 5000 });
    },
    hit(t) {
      kick(t, sfxBus, 0.9);
      [60, 64, 67].forEach(n => tone({ type: 'sawtooth', freq: mtof(n), t, dur: 0.5, vol: 0.06, filter: { freq: 2500, to: 600 }, pluck: true }));
      noise({ t, dur: 0.8, vol: 0.12, ftype: 'highpass', freq: 6000 });
    },
    fanfare(t) {
      const brass = (n, at, d, v) => {
        tone({ type: 'sawtooth', freq: mtof(n), t: t + at, dur: d, vol: v, filter: { freq: 600, to: 3000 }, attack: 0.03, vibrato: d > 0.5 ? 4 : 0 });
        tone({ type: 'sawtooth', freq: mtof(n), t: t + at, dur: d, vol: v * 0.7, detune: 9, filter: { freq: 2200 }, attack: 0.03 });
      };
      const tr = 0.11;
      brass(67, 0, tr, 0.07); brass(67, tr, tr, 0.07); brass(67, tr * 2, tr, 0.07);
      brass(72, tr * 3, 0.45, 0.08);
      brass(67, tr * 3 + 0.5, 0.2, 0.07); brass(72, tr * 3 + 0.72, 0.2, 0.07);
      [72, 76, 79, 84].forEach(n => brass(n, tr * 3 + 0.95, 1.6, 0.06));
      kick(t + tr * 3 + 0.95, sfxBus, 0.9);
      noise({ t: t + tr * 3 + 0.95, dur: 1.8, vol: 0.15, ftype: 'highpass', freq: 5000 });
      snare(t + tr * 3, sfxBus, 0.3);
    },
    streak(t) {
      [79, 83, 86, 91].forEach((n, i) => tone({ type: 'triangle', freq: mtof(n), t: t + i * 0.05, dur: 0.15, vol: 0.12, pluck: true }));
    }
  };

  function sfx(name, arg) {
    if (!init() || !SFX[name]) return;
    SFX[name](ctx.currentTime + 0.01, arg);
  }

  function setMusic(on) {
    prefs.music = !!on; savePrefs();
    if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.05);
  }
  function setSfx(on) {
    prefs.sfx = !!on; savePrefs();
    if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02);
  }

  window.LQAudio = {
    unlock: init, playMusic, stopMusic, sfx, setMusic, setSfx,
    get musicOn() { return prefs.music; },
    get sfxOn() { return prefs.sfx; },
    get playing() { return songName; }
  };
})();
