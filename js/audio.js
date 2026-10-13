/* LambdaQuizzer audio: background music (Incompetech MP3s) and sound effects synthesized with Web Audio. */
(function () {
  'use strict';

  const PREF_KEY = 'lq-audio';
  const prefs = (() => {
    try { return Object.assign({ music: true, sfx: true }, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); }
    catch (e) { return { music: true, sfx: true }; }
  })();
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ } }

  const MUSIC_VOL = 0.45;
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
      musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? MUSIC_VOL : 0; musicBus.connect(ctx.destination);
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
  function block(t, dest, freq, vol) {
    tone({ type: 'sine', freq, t, dur: 0.06, vol: vol || 0.2, pluck: true, dest });
  }

  /* ---------- music: Incompetech tracks by Kevin MacLeod, streamed from assets/music ---------- */

  // Each entry is a file name, or { file, start } to skip a quiet intro (seconds).
  // shuffle: pick a random file (never the same twice in a row) and start it from the top every time.
  // Otherwise the single track resumes where it left off.
  const MUSIC_DIR = 'assets/music/';
  const TRACKS = {
    lobby: { files: ['monkeys-spinning-monkeys.mp3'] },
    question: {
      shuffle: true,
      files: [
        'i-got-a-stick-arr-bryan-teoh.mp3',
        { file: 'newer-wave.mp3', start: 1.5 },
        'raving-energy-faster.mp3',
        'voxel-revolution.mp3',
        'cyborg-ninja.mp3',
        'pinball-spring-160.mp3',
        'laserpack.mp3',
        'jaunty-gumption.mp3',
        'bit-shift.mp3',
        'happy-happy-game-show.mp3'
      ]
    },
    results: { files: ['itty-bitty-8-bit.mp3'] }
  };
  const decks = {};     // file -> { el, gain, stopTimer }
  const cued = {};      // track name -> entry for its next play
  const lastPick = {};  // track name -> file played last time
  let songName = null, songDeck = null;

  const entry = f => typeof f === 'string' ? { file: f, start: 0 } : { file: f.file, start: f.start || 0 };

  function deck(file) {
    if (decks[file]) return decks[file];
    const el = new Audio(MUSIC_DIR + file);
    el.loop = true;
    el.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain);
    gain.connect(musicBus);
    return (decks[file] = { el, gain, stopTimer: null });
  }

  function pickFor(name) {
    const t = TRACKS[name];
    const list = t.files.map(entry);
    if (!t.shuffle || list.length === 1) return list[0];
    const choices = list.filter(e => e.file !== lastPick[name]);
    return choices[Math.floor(Math.random() * choices.length)];
  }

  // Choose (and start buffering) what a track will play next.
  function cueMusic(name) {
    if (!init() || !TRACKS[name]) return;
    if (!cued[name]) cued[name] = pickFor(name);
    deck(cued[name].file);
  }

  function preloadMusic() {
    if (!init()) return;
    Object.keys(TRACKS).forEach(cueMusic);
  }

  function playMusic(name) {
    if (!init() || !TRACKS[name] || songName === name) return;
    stopMusic(0.4);
    const t = TRACKS[name];
    const e = cued[name] || pickFor(name);
    cued[name] = t.shuffle ? null : e;
    lastPick[name] = e.file;
    songName = name;
    const d = songDeck = deck(e.file);
    clearTimeout(d.stopTimer);
    if (t.shuffle) d.el.currentTime = e.start;
    const now = ctx.currentTime;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(d.gain.gain.value, now);
    d.gain.gain.linearRampToValueAtTime(1, now + 0.3);
    const pr = d.el.play();
    if (pr) pr.catch(() => { /* blocked until a user gesture */ });
  }

  function stopMusic(fade) {
    const d = songDeck;
    songName = null; songDeck = null;
    if (!d || !ctx) return;
    const f = fade == null ? 0.3 : fade;
    const now = ctx.currentTime;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(d.gain.gain.value, now);
    d.gain.gain.linearRampToValueAtTime(0, now + f);
    clearTimeout(d.stopTimer);
    d.stopTimer = setTimeout(() => { if (songDeck !== d) d.el.pause(); }, f * 1000 + 60);
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
    if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.05);
  }
  function setSfx(on) {
    prefs.sfx = !!on; savePrefs();
    if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02);
  }

  window.LQAudio = {
    unlock: init, preloadMusic, cueMusic, playMusic, stopMusic, sfx, setMusic, setSfx,
    get musicOn() { return prefs.music; },
    get sfxOn() { return prefs.sfx; },
    get playing() { return songName; }
  };
})();
