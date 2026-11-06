(() => {
  'use strict';

  /* ============================================================
     Jumper Fox — one button, one fox, a lot of neon spikes.
     ============================================================ */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.getElementById('stage');

  // The world is re-laid out for the current screen: 960 wide in landscape,
  // a narrower, much taller stage in portrait. Physics stay in world units.
  const LANDSCAPE_W = 960;
  const PORTRAIT_W = 680;
  let W = LANDSCAPE_W;
  let H = 540;
  let DPR = 2;
  let portraitLayout = false;

  const FOX_W = 80;
  const FOX_H = 60;
  let GROUND_Y = 440;
  let FOX_X = 200;
  let MENU_FOX_X = 92;
  const GRAVITY = 3000;
  const HOLD_GRAVITY = 1850;
  const JUMP_VEL = -820;
  const BASE_SPEED = 300;
  const MAX_SPEED = 820;
  const LEVEL_SPEED_GAIN = 1.09;
  const STEP_DISTANCE = 50;
  const COYOTE = 0.09;
  const TAU = Math.PI * 2;

  const ui = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    bestHud: document.getElementById('bestHud'),
    menuBest: document.getElementById('menuBest'),
    dashChip: document.getElementById('dashChip'),
    start: document.getElementById('startScreen'),
    over: document.getElementById('gameOver'),
    finalScore: document.getElementById('finalScore'),
    finalBest: document.getElementById('finalBest'),
    newBest: document.getElementById('newBest'),
    playBtn: document.getElementById('playBtn'),
    retryBtn: document.getElementById('retryBtn'),
    soundBtn: document.getElementById('soundBtn'),
    flash: document.getElementById('flash'),
    rotateHint: document.getElementById('rotateHint'),
    portraitBtn: document.getElementById('portraitBtn'),
  };

  /* ---------------- persistence ---------------- */

  const KEY_BEST = 'jumperfox.best';
  const KEY_SOUND = 'jumperfox.sound';

  function loadBest() {
    try {
      return Math.max(0, Number(localStorage.getItem(KEY_BEST)) || 0);
    } catch {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(KEY_BEST, String(value));
    } catch {
      /* storage can be blocked; the game still works */
    }
  }

  function loadSound() {
    try {
      const raw = localStorage.getItem(KEY_SOUND);
      return raw === null ? true : raw === 'on';
    } catch {
      return true;
    }
  }

  function saveSound(value) {
    try {
      localStorage.setItem(KEY_SOUND, value ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }

  let best = loadBest();
  let soundOn = loadSound();
  let portraitDismissed = false;

  const portraitQuery = window.matchMedia
    ? window.matchMedia('(orientation: portrait) and (max-width: 900px) and (pointer: coarse)')
    : { matches: false, addEventListener: () => {} };

  /* ---------------- tiny synth ---------------- */

  const audio = {
    ac: null,
    out: null,

    init() {
      if (this.ac) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ac = new AudioCtx();
      this.out = this.ac.createGain();
      this.out.gain.value = 0.22;
      this.out.connect(this.ac.destination);
    },

    resume() {
      if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    },

    tone(freq, dur, opts = {}) {
      if (!soundOn || !this.ac) return;
      const { type = 'sine', vol = 0.16, slide = 0, delay = 0, attack = 0.006 } = opts;
      const now = this.ac.currentTime + delay;
      const osc = this.ac.createOscillator();
      const gain = this.ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), now + dur);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain).connect(this.out);
      osc.start(now);
      osc.stop(now + dur + 0.03);
    },

    noise(dur, vol = 0.1, freq = 900, q = 1, delay = 0) {
      if (!soundOn || !this.ac) return;
      const rate = this.ac.sampleRate;
      const length = Math.max(1, Math.floor(rate * dur));
      const buffer = this.ac.createBuffer(1, length, rate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) channel[i] = Math.random() * 2 - 1;
      const src = this.ac.createBufferSource();
      src.buffer = buffer;
      const filter = this.ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = this.ac.createGain();
      const now = this.ac.currentTime + delay;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(filter).connect(gain).connect(this.out);
      src.start(now);
      src.stop(now + dur);
    },

    jump() {
      this.tone(300, 0.15, { type: 'triangle', vol: 0.18, slide: 660 });
    },
    dash() {
      this.tone(900, 0.16, { type: 'sawtooth', vol: 0.06, slide: 180 });
      this.noise(0.15, 0.08, 1500, 0.8);
    },
    clear() {
      this.tone(920, 0.07, { type: 'triangle', vol: 0.09 });
      this.tone(1380, 0.09, { type: 'triangle', vol: 0.07, delay: 0.055 });
    },
    chirp() {
      this.tone(1500, 0.06, { type: 'sine', vol: 0.05, slide: 2100 });
      this.tone(1900, 0.07, { type: 'sine', vol: 0.04, slide: 1500, delay: 0.06 });
    },
    milestone() {
      [523, 659, 784, 1046].forEach((freq, i) => {
        this.tone(freq, 0.15, { type: 'square', vol: 0.055, delay: i * 0.075 });
      });
    },
    hit() {
      this.tone(190, 0.34, { type: 'sawtooth', vol: 0.2, slide: 42 });
      this.noise(0.32, 0.18, 300, 0.9);
    },
    gameover() {
      this.tone(392, 0.2, { type: 'triangle', vol: 0.07, slide: 330 });
      this.tone(294, 0.28, { type: 'triangle', vol: 0.07, delay: 0.17, slide: 196 });
    },
    start() {
      this.tone(440, 0.11, { type: 'triangle', vol: 0.1, slide: 880 });
    },
    click() {
      this.tone(560, 0.05, { type: 'square', vol: 0.05 });
    },
  };

  /* ---------------- background music ---------------- */

  const music = {
    bus: null,
    timer: null,
    index: 0,
    nextTime: 0,
    noiseBuffer: null,

    ensure() {
      if (!audio.ac || this.bus) return;
      const ac = audio.ac;

      this.bus = ac.createGain();
      this.bus.gain.value = 0.0001;

      const toneFilter = ac.createBiquadFilter();
      toneFilter.type = 'lowpass';
      toneFilter.frequency.value = 3000;
      toneFilter.Q.value = 0.4;
      this.bus.connect(toneFilter).connect(audio.out);

      const length = Math.floor(ac.sampleRate * 0.25);
      this.noiseBuffer = ac.createBuffer(1, length, ac.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    },

    start() {
      if (!audio.ac || !soundOn) return;
      this.ensure();
      const ac = audio.ac;

      this.bus.gain.cancelScheduledValues(ac.currentTime);
      this.bus.gain.setTargetAtTime(0.3, ac.currentTime, 0.12);

      if (this.timer) return;

      this.index = 0;
      this.nextTime = ac.currentTime + 0.08;
      this.timer = window.setInterval(() => this.tick(), 30);
      this.tick();
    },

    stop() {
      if (this.timer) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
      if (this.bus && audio.ac) {
        this.bus.gain.cancelScheduledValues(audio.ac.currentTime);
        this.bus.gain.setTargetAtTime(0.0001, audio.ac.currentTime, 0.045);
      }
    },

    tick() {
      if (!audio.ac || !soundOn) return;
      const ac = audio.ac;
      if (this.nextTime < ac.currentTime) this.nextTime = ac.currentTime + 0.03;

      while (this.nextTime < ac.currentTime + 0.16) {
        this.play(this.index, this.nextTime);
        this.index = (this.index + 1) % 64;
        this.nextTime += 60 / 112 / 4;
      }
    },

    play(index, when) {
      const bar = Math.floor(index / 16);
      const beat = index % 16;
      const roots = [110, 87.31, 130.81, 98];
      const chords = [
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
        [261.63, 329.63, 392],
        [196, 246.94, 293.66],
      ];
      const root = roots[bar];
      const chord = chords[bar];

      // Slow pad once per bar.
      if (beat === 0) {
        for (const freq of chord) {
          this.note(freq, when, 2.1, { type: 'sine', vol: 0.032, attack: 0.22, release: 0.55 });
        }
      }

      // Four-on-the-floor kick + saw bass on the quarter notes.
      if (beat % 4 === 0) {
        this.kick(when);
        this.note(root, when, 0.3, {
          type: 'sawtooth', vol: 0.075, attack: 0.008, release: 0.1, filter: 420,
        });
      }

      // Octave bounce.
      if (beat % 4 === 2) {
        this.note(root * 2, when, 0.16, {
          type: 'square', vol: 0.033, attack: 0.005, release: 0.06, filter: 900,
        });
      }

      if (beat % 2 === 0) this.hat(when, beat % 4 === 2 ? 0.05 : 0.028);
      if (beat === 4 || beat === 12) this.snare(when);

      // Sparse arpeggio sparkle.
      if (beat % 4 === 2) {
        const arp = chord[Math.floor(beat / 4) % chord.length] * 2;
        this.note(arp, when, 0.13, { type: 'triangle', vol: 0.026, attack: 0.005, release: 0.07 });
      }
    },

    note(freq, when, duration, opts = {}) {
      if (!audio.ac || !this.bus || !soundOn) return;
      const { type = 'sine', vol = 0.04, attack = 0.01, release = 0.08, filter = 0 } = opts;
      const ac = audio.ac;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, when);

      let chain = osc;
      if (filter) {
        const lowpass = ac.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(filter, when);
        lowpass.Q.value = 0.8;
        osc.connect(lowpass);
        chain = lowpass;
      }
      chain.connect(gain).connect(this.bus);

      const end = when + duration;
      const releaseStart = Math.max(when + attack, end - release);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(vol, when + attack);
      gain.gain.setValueAtTime(vol, releaseStart);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.start(when);
      osc.stop(end + 0.03);
    },

    kick(when) {
      if (!audio.ac || !this.bus || !soundOn) return;
      const ac = audio.ac;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(45, when + 0.13);
      gain.gain.setValueAtTime(0.15, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      osc.connect(gain).connect(this.bus);
      osc.start(when);
      osc.stop(when + 0.18);
    },

    snare(when) {
      if (!audio.ac || !this.bus || !soundOn || !this.noiseBuffer) return;
      const ac = audio.ac;
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1700;
      filter.Q.value = 0.9;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.08, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
      src.connect(filter).connect(gain).connect(this.bus);
      src.start(when);
      src.stop(when + 0.14);
    },

    hat(when, vol) {
      if (!audio.ac || !this.bus || !soundOn || !this.noiseBuffer) return;
      const ac = audio.ac;
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7500;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(vol, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
      src.connect(filter).connect(gain).connect(this.bus);
      src.start(when);
      src.stop(when + 0.05);
    },
  };

  /* ---------------- state ---------------- */

  const fox = {
    x: FOX_X,
    y: GROUND_Y - FOX_H,
    vy: 0,
    grounded: true,
    dashAvail: true,
    dashTime: 0,
    dashCd: 0,
    hold: false,
    coyote: COYOTE,
    squash: 0,
    rot: 0,
    deadT: 0,
  };

  let state = 'menu';
  let time = 0;
  let distance = 0;
  let score = 0;
  let cleared = 0;
  let level = 0;
  let speed = BASE_SPEED;
  let spawnAccum = 0;
  let spawnGap = 660;
  let jumpBuffer = 0;
  let shake = 0;
  let runCycle = 0;
  let dustTimer = 0;
  let deathTimer = 0;
  let newBestFlag = false;
  let announcement = null;

  const obstacles = [];
  const particles = [];
  const floaters = [];
  let lastTime = performance.now();

  /* ---------------- responsive world layout ---------------- */

  function relayout() {
    const cssW = stage && stage.clientWidth ? stage.clientWidth : window.innerWidth;
    const cssH = stage && stage.clientHeight ? stage.clientHeight : window.innerHeight;
    const aspect = Math.max(0.4, cssH / Math.max(1, cssW));

    const prevW = W;
    const prevGround = GROUND_Y;
    const prevFoxX = FOX_X;

    portraitLayout = aspect > 1.02;

    // Portrait keeps the same pixel density as landscape but shows a narrower,
    // much taller slice of the world, so the action sits near the bottom.
    W = portraitLayout ? PORTRAIT_W : LANDSCAPE_W;
    H = Math.max(360, Math.round(W * aspect));
    GROUND_Y = portraitLayout
      ? H - 150
      : H - Math.round(clamp(H * 0.185, 88, 160));
    FOX_X = portraitLayout ? Math.round(W * 0.22) : 200;
    MENU_FOX_X = portraitLayout ? Math.round(W * 0.14) : 92;

    DPR = portraitLayout ? Math.min(window.devicePixelRatio || 1, 1.6) : 2;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);

    // Rescale the live run when the phone rotates so nothing spawns off-screen.
    const widthChanged = prevW !== W;
    const groundShift = GROUND_Y - prevGround;

    if (widthChanged) {
      const oldTrack = Math.max(1, prevW - prevFoxX);
      const newTrack = Math.max(1, W - FOX_X);
      const scale = newTrack / oldTrack;

      for (const obstacle of obstacles) {
        obstacle.x = W - (prevW - obstacle.x) * scale;
      }
      for (const particle of particles) {
        particle.x = W - (prevW - particle.x) * scale;
      }
      for (const floater of floaters) {
        floater.x = W - (prevW - floater.x) * scale;
      }
    }

    if (widthChanged || groundShift !== 0) {
      if (groundShift !== 0) {
        for (const obstacle of obstacles) {
          if (obstacle.type === 'bird') obstacle.y += groundShift;
        }
      }
      if (fox.grounded) fox.y = GROUND_Y - FOX_H;
      else if (groundShift !== 0) fox.y += groundShift;
    }

    fox.x = FOX_X;
  }

  /* ---------------- small helpers ---------------- */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  function flash(kind) {
    ui.flash.className = '';
    void ui.flash.offsetWidth;
    ui.flash.className = kind;
    window.setTimeout(() => {
      if (ui.flash.className === kind) ui.flash.className = '';
    }, 620);
  }

  function announce(main, sub) {
    announcement = { main, sub, t: 0, dur: 1.5 };
  }

  function bumpScore() {
    ui.score.classList.remove('score-pop');
    void ui.score.offsetWidth;
    ui.score.classList.add('score-pop');
  }

  function setDashReady(ready) {
    ui.dashChip.classList.toggle('spent', !ready);
  }

  function updateSoundButton() {
    ui.soundBtn.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    ui.soundBtn.setAttribute('aria-pressed', String(soundOn));
    ui.soundBtn.classList.toggle('muted', !soundOn);
  }

  function updateBestLabels() {
    ui.bestHud.textContent = best;
    ui.menuBest.textContent = best;
  }

  function updateRotateHint() {
    const show = state === 'menu' && !portraitDismissed && portraitQuery.matches;
    ui.rotateHint.classList.toggle('visible', show);
    ui.rotateHint.setAttribute('aria-hidden', String(!show));
  }

  /* ---------------- run flow ---------------- */

  function resetRun() {
    score = 0;
    distance = 0;
    cleared = 0;
    level = 0;
    speed = BASE_SPEED;
    spawnAccum = 0;
    spawnGap = 680;
    jumpBuffer = 0;
    shake = 0;
    runCycle = 0;
    dustTimer = 0;
    newBestFlag = false;
    announcement = null;
    deathTimer = 0;

    obstacles.length = 0;
    particles.length = 0;
    floaters.length = 0;

    fox.x = FOX_X;
    fox.y = GROUND_Y - FOX_H;
    fox.vy = 0;
    fox.grounded = true;
    fox.dashAvail = true;
    fox.dashTime = 0;
    fox.dashCd = 0;
    fox.hold = false;
    fox.coyote = COYOTE;
    fox.squash = 0;
    fox.rot = 0;
    fox.deadT = 0;

    ui.score.textContent = '0';
    setDashReady(true);
  }

  function startGame() {
    audio.init();
    audio.resume();
    resetRun();
    state = 'playing';
    lastTime = performance.now();
    ui.start.classList.add('is-hidden');
    ui.over.classList.add('is-hidden');
    ui.hud.classList.add('visible');
    updateRotateHint();
    audio.start();
    music.start();
  }

  function die() {
    if (state !== 'playing') return;
    state = 'dead';
    deathTimer = 1.02;
    shake = 18;
    fox.vy = -380;
    fox.deadT = 0;
    setDashReady(false);
    music.stop();
    flash('hit');
    audio.hit();

    burst(FOX_X + 40, fox.y + 32, 34, ['#ff9a4d', '#ffe9cf', '#64f3ff', '#ff4f8b']);
    spawnFeathers(9, FOX_X + 40, fox.y + 26);

    newBestFlag = score > best;
    if (newBestFlag) {
      best = score;
      saveBest(best);
    }
    updateBestLabels();
  }

  function showGameOver() {
    state = 'gameover';
    deathTimer = 0;
    ui.finalScore.textContent = score;
    ui.finalBest.textContent = best;
    ui.newBest.classList.toggle('is-hidden', !newBestFlag);
    ui.over.classList.remove('is-hidden');
    audio.gameover();
  }

  /* ---------------- input ---------------- */

  function tryJump() {
    if (jumpBuffer <= 0) return;
    if (!fox.grounded && fox.coyote <= 0) return;

    fox.vy = JUMP_VEL;
    fox.grounded = false;
    fox.coyote = 0;
    fox.dashAvail = true;
    fox.dashTime = 0;
    fox.dashCd = 0;
    fox.squash = 0;
    fox.hold = true;
    jumpBuffer = 0;
    setDashReady(true);
    dustPuff(FOX_X + 42, GROUND_Y - 2, 7);
    audio.jump();
  }

  function doDash() {
    fox.dashTime = 0.2;
    fox.dashAvail = false;
    fox.dashCd = 0.24;
    if (fox.vy > 0) fox.vy *= 0.45;
    fox.hold = true;
    shake = Math.max(shake, 2.5);
    setDashReady(false);
    audio.dash();

    for (let i = 0; i < 12; i += 1) {
      particles.push({
        type: 'spark',
        x: FOX_X + rand(0, 50),
        y: fox.y + rand(12, 52),
        vx: rand(-240, -70),
        vy: rand(-70, 70),
        gravity: 40,
        life: rand(0.18, 0.4),
        maxLife: 0.4,
        size: rand(1.5, 3.5),
        color: Math.random() < 0.5 ? '#64f3ff' : '#ff9a4d',
        rot: 0,
        spin: 0,
      });
    }
  }

  function pressJump() {
    if (state !== 'playing') return;
    if (!fox.grounded && fox.coyote <= 0) {
      if (fox.dashAvail && fox.dashCd <= 0) {
        doDash();
        return;
      }
      jumpBuffer = 0.14;
      return;
    }
    jumpBuffer = 0.14;
    fox.hold = true;
    tryJump();
  }

  function releaseJump() {
    fox.hold = false;
    if (state === 'playing' && fox.vy < -520) fox.vy = -520;
  }

  function onPrimaryPress() {
    audio.init();
    audio.resume();
    // While the portrait hint is up, only its own button starts the game.
    if (ui.rotateHint.classList.contains('visible')) return;
    if (state === 'menu') {
      startGame();
    } else if (state === 'playing') {
      pressJump();
    } else if (state === 'gameover') {
      startGame();
    }
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'Enter') {
      event.preventDefault();
      onPrimaryPress();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'Enter') {
      releaseJump();
    }
  });

  window.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('button')) return;
    event.preventDefault();
    onPrimaryPress();
  });

  window.addEventListener('pointerup', releaseJump);
  window.addEventListener('pointercancel', releaseJump);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      music.stop();
    } else {
      lastTime = performance.now();
      if (state === 'playing' && soundOn) music.start();
    }
  });

  ui.playBtn.addEventListener('click', () => {
    audio.init();
    audio.click();
    startGame();
  });

  ui.retryBtn.addEventListener('click', () => {
    audio.init();
    audio.click();
    startGame();
  });

  ui.soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    saveSound(soundOn);
    updateSoundButton();
    audio.init();
    audio.resume();
    if (soundOn) {
      audio.click();
      if (state === 'playing') music.start();
    } else {
      music.stop();
    }
  });

  ui.portraitBtn.addEventListener('click', () => {
    portraitDismissed = true;
    updateRotateHint();
    audio.init();
    audio.click();
    startGame();
  });

  if (portraitQuery.addEventListener) {
    portraitQuery.addEventListener('change', updateRotateHint);
  } else if (portraitQuery.addListener) {
    portraitQuery.addListener(updateRotateHint);
  }

  function onViewportChange() {
    relayout();
    updateRotateHint();
  }

  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChange);
  }

  /* ---------------- particles ---------------- */

  function burst(x, y, count, colors) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const force = rand(60, 380);
      particles.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force - 60,
        gravity: 700,
        life: rand(0.35, 0.9),
        maxLife: 0.9,
        size: rand(2, 5),
        color: colors[(Math.random() * colors.length) | 0],
        rot: 0,
        spin: 0,
      });
    }
  }

  function dustPuff(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      particles.push({
        type: 'dust',
        x: x + rand(-14, 14),
        y: y + rand(-4, 2),
        vx: rand(-90, 20),
        vy: rand(-110, -20),
        gravity: 90,
        life: rand(0.25, 0.55),
        maxLife: 0.55,
        size: rand(2, 4.5),
        color: Math.random() < 0.6 ? '#ffb37a' : '#7a5c91',
        rot: 0,
        spin: 0,
      });
    }
  }

  function spawnFeathers(count, x, y) {
    for (let i = 0; i < count; i += 1) {
      particles.push({
        type: 'feather',
        x: x + rand(-30, 30),
        y: y + rand(-30, 20),
        vx: rand(-150, -20),
        vy: rand(-90, 60),
        gravity: 60,
        life: rand(0.7, 1.4),
        maxLife: 1.4,
        size: rand(2.4, 4.6),
        color: Math.random() < 0.7 ? '#ffe9cf' : '#ffb37a',
        rot: rand(0, TAU),
        spin: rand(-6, 6),
      });
    }
  }

  function spawnAmbientFeather() {
    particles.push({
      type: 'feather',
      x: W + 20,
      y: rand(GROUND_Y * 0.1, GROUND_Y - 40),
      vx: rand(-46, -22),
      vy: rand(2, 16),
      gravity: 0,
      life: rand(7, 12),
      maxLife: 12,
      size: rand(2.4, 5),
      color: Math.random() < 0.6 ? '#ffe9cf' : '#b9a5e6',
      rot: rand(0, TAU),
      spin: rand(-1.8, 1.8),
      sway: rand(0.6, 1.6),
      baseY: 0,
    });
  }

  function addFloater(text, x, y, color) {
    floaters.push({ text, x, y, color, life: 0.85, maxLife: 0.85 });
  }

  /* ---------------- obstacle spawning ---------------- */

  const SPIKE_COLORS = ['#ff4f8b', '#c86bff', '#8b7bff', '#ff6f9c'];
  const BIRD_COLORS = ['#64f3ff', '#ff7ab8', '#c86bff'];

  function spawnBird() {
    const height = 28;
    const altitude = rand(112, 148);
    const width = 54;

    obstacles.push({
      type: 'bird',
      x: W + 24,
      y: GROUND_Y - altitude - height,
      w: width,
      h: height,
      altitude,
      color: BIRD_COLORS[(Math.random() * BIRD_COLORS.length) | 0],
      seed: Math.random(),
      passed: false,
    });

    spawnGap = speed * 0.95 + 150 + Math.random() * speed * 0.55;
  }

  function spawnObstacle() {
    const birdChance = Math.min(0.42, 0.16 + level * 0.035);
    if (Math.random() < birdChance) {
      spawnBird();
      return;
    }

    const roll = Math.random();
    let count = 1;
    let height = 38;
    let tall = false;

    if (level < 1) {
      if (roll < 0.7) {
        count = 1;
        height = 36;
      } else {
        count = 2;
        height = 44;
      }
    } else if (level < 3) {
      if (roll < 0.3) {
        count = 1;
        height = 38;
      } else if (roll < 0.6) {
        count = 2;
        height = 48;
      } else if (roll < 0.82) {
        count = 1;
        height = 72;
        tall = true;
      } else {
        count = 3;
        height = 40;
      }
    } else if (roll < 0.18) {
      count = 1;
      height = 42;
    } else if (roll < 0.46) {
      count = 2;
      height = 52;
    } else if (roll < 0.66) {
      count = 3;
      height = 46;
    } else if (roll < 0.82) {
      count = 1;
      height = 78;
      tall = true;
    } else if (roll < 0.93) {
      count = 5;
      height = 26;
    } else {
      count = 2;
      height = 64;
      tall = true;
    }

    const spikeWidth = tall ? 30 : 26;
    const width = count * spikeWidth + (count > 1 ? rand(0, 6) : 0);

    obstacles.push({
      type: 'spike',
      x: W + 24,
      w: width,
      h: height,
      count,
      tall,
      color: SPIKE_COLORS[(Math.random() * SPIKE_COLORS.length) | 0],
      seed: Math.random(),
      passed: false,
    });

    spawnGap = speed * 0.92 + 125 + Math.random() * speed * 0.5 + width * 0.55;
  }

  function obstacleCleared(obstacle) {
    cleared += 1;
    const cx = obstacle.x + obstacle.w * 0.5;

    if (obstacle.type === 'bird') {
      addFloater('+5', cx, obstacle.y - 16, '#ffe9cf');
      spawnFeathers(8, cx, obstacle.y + obstacle.h * 0.5);
      audio.chirp();
    } else {
      addFloater('+5', cx, GROUND_Y - obstacle.h - 22, '#9ef6ff');
      spawnFeathers(4, cx, GROUND_Y - obstacle.h - 6);
      audio.clear();
    }

    bumpScore();
  }

  function milestone() {
    announce('SPEED UP', `LEVEL ${level} · +${Math.round((LEVEL_SPEED_GAIN - 1) * 100)}% FASTER`);
    shake = Math.max(shake, 5);
    flash('boost');
    audio.milestone();
    spawnFeathers(16, rand(W * 0.3, W * 0.92), rand(GROUND_Y - 360, GROUND_Y - 120));
    burst(W * 0.5, GROUND_Y - 270, 14, ['#64f3ff', '#ffd47a', '#ff4f8b']);
  }

  /* ---------------- updating ---------------- */

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;

      if (p.type === 'feather' && p.sway) {
        p.x += Math.sin(time * p.sway + p.y * 0.02) * 14 * dt;
        p.vy += Math.sin(time * 2 + p.y * 0.03) * 8 * dt;
        p.vy = clamp(p.vy, -20, 40);
      }

      if (p.x < -40 || p.y > H + 60) particles.splice(i, 1);
    }

    if (particles.length > 320) particles.splice(0, particles.length - 320);
  }

  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  let featherTimer = 2.2;

  function updateAmbient(dt) {
    featherTimer -= dt;
    if (featherTimer <= 0) {
      featherTimer = rand(1.9, 4.2);
      spawnAmbientFeather();
    }
  }

  function updateFox(dt) {
    if (fox.dashCd > 0) fox.dashCd = Math.max(0, fox.dashCd - dt);
    if (fox.dashTime > 0) fox.dashTime = Math.max(0, fox.dashTime - dt);
    if (jumpBuffer > 0) jumpBuffer = Math.max(0, jumpBuffer - dt);
    if (fox.squash > 0) fox.squash = Math.max(0, fox.squash - dt * 5.5);

    if (fox.grounded) fox.coyote = COYOTE;
    else fox.coyote = Math.max(0, fox.coyote - dt);

    const gravity = fox.hold && fox.vy < 0 ? HOLD_GRAVITY : GRAVITY;
    fox.vy = Math.min(fox.vy + gravity * dt, 2200);
    fox.y += fox.vy * dt;

    if (fox.y + FOX_H >= GROUND_Y) {
      const wasAirborne = !fox.grounded;
      fox.y = GROUND_Y - FOX_H;
      fox.vy = 0;
      fox.grounded = true;
      fox.coyote = COYOTE;
      fox.dashAvail = true;
      fox.dashCd = 0;
      setDashReady(true);

      if (wasAirborne) {
        fox.squash = 1;
        dustPuff(FOX_X + 40, GROUND_Y - 2, 9);
        shake = Math.max(shake, 1.4);
        if (jumpBuffer > 0) tryJump();
      }
    } else {
      fox.grounded = false;
    }
  }

  function update(dt) {
    time += dt;
    shake = Math.max(0, shake - dt * 58);
    updateAmbient(dt);
    updateParticles(dt);
    updateFloaters(dt);

    if (announcement) {
      announcement.t += dt;
      if (announcement.t > announcement.dur) announcement = null;
    }

    if (state === 'menu') {
      distance += dt * 30;
      runCycle += dt * 4.2;
      fox.y = GROUND_Y - FOX_H;
      fox.rot = 0;
      dustTimer -= dt;
      if (dustTimer <= 0) {
        dustTimer = 0.2;
        dustPuff(MENU_FOX_X + 32, GROUND_Y - 1, 1);
      }
      return;
    }

    if (state === 'dead') {
      deathTimer -= dt;
      fox.deadT += dt;
      fox.vy += 2400 * dt;
      fox.y += fox.vy * dt;
      fox.rot += 7 * dt;
      if (deathTimer <= 0) showGameOver();
      return;
    }

    if (state !== 'playing') return;

    const dashing = fox.dashTime > 0;
    const worldSpeed = speed * (dashing ? 2.4 : 1);

    distance += worldSpeed * dt;
    if (fox.grounded) runCycle += dt * (worldSpeed / 28);

    // Running dust
    if (fox.grounded) {
      dustTimer -= dt;
      if (dustTimer <= 0) {
        dustTimer = 0.075;
        dustPuff(FOX_X + 26, GROUND_Y - 1, 1);
      }
    }

    // Spawn hazards by distance, so speed-ups stay fair.
    spawnAccum += worldSpeed * dt;
    if (spawnAccum >= spawnGap) {
      spawnAccum = 0;
      spawnObstacle();
    }

    // Move hazards and reward clean passes.
    for (let i = obstacles.length - 1; i >= 0; i -= 1) {
      const obstacle = obstacles[i];
      const obstacleSpeed = obstacle.type === 'bird' ? worldSpeed * 1.1 : worldSpeed;
      obstacle.x -= obstacleSpeed * dt;

      if (!obstacle.passed && obstacle.x + obstacle.w < FOX_X + 22) {
        obstacle.passed = true;
        obstacleCleared(obstacle);
      }

      if (obstacle.x + obstacle.w < -60) obstacles.splice(i, 1);
    }

    const previousScore = score;
    score = Math.floor(distance / STEP_DISTANCE) + cleared * 5;
    if (score !== previousScore) ui.score.textContent = score;

    const newLevel = Math.floor(score / 100);
    if (newLevel > level) {
      level = newLevel;
      speed = Math.min(MAX_SPEED, BASE_SPEED * Math.pow(LEVEL_SPEED_GAIN, level));
      milestone();
    }

    updateFox(dt);

    // Forgiving AABB collision, tuned to the drawn fox.
    const foxBox = {
      x: FOX_X + 22,
      y: fox.y + 12,
      w: 44,
      h: 46,
    };

    for (const obstacle of obstacles) {
      const obBox = obstacle.type === 'bird'
        ? {
          x: obstacle.x + 10,
          y: obstacle.y + 6,
          w: obstacle.w - 20,
          h: obstacle.h - 12,
        }
        : {
          x: obstacle.x + 6,
          y: GROUND_Y - obstacle.h + 1,
          w: obstacle.w - 12,
          h: obstacle.h - 1,
        };

      if (
        foxBox.x < obBox.x + obBox.w &&
        foxBox.x + foxBox.w > obBox.x &&
        foxBox.y < obBox.y + obBox.h &&
        foxBox.y + foxBox.h > obBox.y
      ) {
        die();
        break;
      }
    }
  }

  /* ---------------- fox sprite ---------------- */

  const foxCanvas = document.createElement('canvas');
  foxCanvas.width = 40;
  foxCanvas.height = 30;
  const fctx = foxCanvas.getContext('2d');

  function paintFox() {
    const f = fctx;
    f.clearRect(0, 0, 40, 30);

    const airborne = !fox.grounded;
    const dashing = fox.dashTime > 0;
    const orange = '#ff9548';
    const light = '#ffc07f';
    const deep = '#df6a2f';
    const cream = '#ffe9cf';
    const dark = '#2b1730';
    const cyan = '#64f3ff';

    const bob = fox.grounded && !dashing ? Math.round(Math.abs(Math.sin(runCycle)) * 1.2) : 0;
    const wag = Math.round(Math.sin(airborne ? time * 5 : runCycle * 0.9) * 1.5);

    // Tail, back to front.
    f.fillStyle = orange;
    f.fillRect(10, 16 - bob, 5, 4);
    f.fillRect(7, 13 - bob + Math.round(wag * 0.4), 4, 4);
    f.fillRect(4, 10 - bob + Math.round(wag * 0.8), 4, 4);
    f.fillStyle = cream;
    f.fillRect(2, 7 - bob + wag, 4, 4);
    f.fillRect(1, 6 - bob + wag, 2, 2);

    // Body.
    f.fillStyle = orange;
    f.fillRect(12, 16 - bob, 16, 7);
    f.fillRect(14, 14 - bob, 11, 3);
    f.fillRect(11, 20 - bob, 3, 3);
    f.fillStyle = light;
    f.fillRect(15, 14 - bob, 9, 1);
    f.fillRect(13, 16 - bob, 13, 1);
    f.fillStyle = deep;
    f.fillRect(13, 22 - bob, 14, 1);

    // Legs.
    if (dashing) {
      f.fillStyle = orange;
      f.fillRect(12, 22 - bob, 5, 4);
      f.fillRect(22, 23 - bob, 4, 3);
      f.fillStyle = dark;
      f.fillRect(11, 26 - bob, 5, 2);
      f.fillRect(25, 25 - bob, 4, 2);
    } else if (airborne) {
      f.fillStyle = orange;
      f.fillRect(14, 22 - bob, 4, 4);
      f.fillRect(23, 22 - bob, 3, 4);
      f.fillStyle = dark;
      f.fillRect(13, 25 - bob, 4, 2);
      f.fillRect(25, 25 - bob, 4, 2);
    } else {
      const stride = Math.round(Math.sin(runCycle) * 3);
      f.fillStyle = orange;
      f.fillRect(14 + stride, 22 - bob, 3, 5);
      f.fillRect(21 - stride, 22 - bob, 3, 5);
      f.fillStyle = dark;
      f.fillRect(13 + stride, 27 - bob, 4, 2);
      f.fillRect(20 - stride, 27 - bob, 4, 2);
    }

    // Cyan scarf, trailing behind.
    const sway = Math.round(Math.sin(time * 7) * 1.2);
    f.fillStyle = cyan;
    f.fillRect(24, 15 - bob, 3, 2);
    f.fillRect(21, 14 - bob + sway, 3, 2);
    f.fillRect(18, 13 - bob + sway * 2, 3, 2);
    f.fillRect(15, 12 - bob + sway * 2, 2, 2);

    // Head.
    f.fillStyle = orange;
    f.fillRect(26, 11 - bob, 10, 9);
    f.fillRect(25, 13 - bob, 2, 5);
    f.fillRect(27, 6 - bob, 3, 6);
    f.fillRect(32, 7 - bob, 3, 5);
    f.fillStyle = light;
    f.fillRect(27, 11 - bob, 8, 1);
    f.fillStyle = '#b3542a';
    f.fillRect(28, 8 - bob, 1, 3);
    f.fillRect(33, 9 - bob, 1, 2);

    // Muzzle and nose.
    f.fillStyle = cream;
    f.fillRect(34, 15 - bob, 5, 4);
    f.fillRect(36, 14 - bob, 3, 1);
    f.fillStyle = dark;
    f.fillRect(38, 16 - bob, 2, 2);

    // Eye.
    f.fillStyle = dark;
    f.fillRect(32, 13 - bob, 3, 3);
    f.fillStyle = cyan;
    f.fillRect(33, 14 - bob, 1, 1);

    // Chest fluff.
    f.fillStyle = cream;
    f.fillRect(24, 19 - bob, 4, 3);
  }

  function drawFox() {
    if (state === 'gameover') return;

    const drawX = state === 'menu' ? MENU_FOX_X : FOX_X;
    const airborne = !fox.grounded && state === 'playing';

    // Ground shadow.
    const lift = clamp((GROUND_Y - FOX_H - fox.y) / 190, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.34 * (1 - lift * 0.55);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(drawX + 39, GROUND_Y + 2, 30 * (1 - lift * 0.35), 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    paintFox();

    const dashing = fox.dashTime > 0;
    let alpha = 1;
    let tilt = 0;

    if (state === 'dead') {
      alpha = clamp(1 - fox.deadT * 0.9, 0, 1);
      tilt = fox.rot;
    } else if (dashing) {
      tilt = -0.055;
    } else if (airborne) {
      tilt = clamp(fox.vy / 4800, -0.08, 0.11);
    }

    let scaleX = 1;
    let scaleY = 1;
    if (fox.squash > 0) {
      scaleX += fox.squash * 0.2;
      scaleY -= fox.squash * 0.2;
    }
    if (dashing) {
      scaleX *= 1.06;
      scaleY *= 0.95;
    } else if (airborne) {
      const stretch = clamp(Math.abs(fox.vy) / 12000, 0, 0.05);
      scaleX -= stretch;
      scaleY += stretch;
    }

    ctx.save();
    ctx.translate(drawX + 40, fox.y + 30);
    ctx.rotate(tilt);
    ctx.scale(scaleX, scaleY);
    ctx.imageSmoothingEnabled = false;

    if (dashing) {
      ctx.globalAlpha = alpha * 0.18;
      ctx.drawImage(foxCanvas, -65, -30, 80, 60);
      ctx.globalAlpha = alpha * 0.09;
      ctx.drawImage(foxCanvas, -88, -30, 80, 60);
    }

    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(255, 128, 66, 0.9)';
    ctx.shadowBlur = 16;
    ctx.drawImage(foxCanvas, -40, -30, 80, 60);
    ctx.shadowBlur = 0;
    ctx.drawImage(foxCanvas, -40, -30, 80, 60);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
  }

  /* ---------------- backdrop ---------------- */

  const stars = Array.from({ length: 150 }, () => ({
    nx: Math.random(),
    ny: Math.random(),
    size: Math.random() < 0.86 ? 1 : 2,
    phase: Math.random() * TAU,
    twinkle: rand(0.5, 2.2),
    color: Math.random() < 0.18 ? '#ff9ac4' : Math.random() < 0.32 ? '#9ff7ff' : '#ffffff',
  }));

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 30);
    sky.addColorStop(0, '#060210');
    sky.addColorStop(0.4, '#120726');
    sky.addColorStop(0.72, '#280c3b');
    sky.addColorStop(1, '#1a0928');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const starField = GROUND_Y - 24;
    for (const star of stars) {
      const a = 0.2 + 0.65 * (0.5 + 0.5 * Math.sin(time * star.twinkle + star.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = star.color;
      ctx.fillRect(star.nx * W, star.ny * starField, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    // Retro sun, kept in the upper part of the sky in both layouts.
    const cx = W * 0.8;
    const cy = portraitLayout ? H * 0.18 : H * 0.244;
    const radius = portraitLayout ? 86 : 62;

    const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 170);
    glow.addColorStop(0, 'rgba(255, 111, 156, 0.24)');
    glow.addColorStop(0.55, 'rgba(255, 111, 156, 0.07)');
    glow.addColorStop(1, 'rgba(255, 111, 156, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 180, cy - 180, 360, 360);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
    sun.addColorStop(0, '#ffe9b0');
    sun.addColorStop(0.5, '#ff9a5f');
    sun.addColorStop(1, '#ff3f7f');
    ctx.fillStyle = sun;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    for (let i = 0; i < 6; i += 1) {
      ctx.fillStyle = 'rgba(22, 9, 38, 0.88)';
      ctx.fillRect(cx - radius, cy + 6 + i * 10, radius * 2, 2 + i * 1.4);
    }
    ctx.restore();
  }

  function drawRidge(baseY, height, offset, fill, rim) {
    ctx.beginPath();
    ctx.moveTo(-30, baseY + 80);

    for (let x = -30; x <= W + 30; x += 16) {
      const t = x + offset;
      const shape =
        Math.sin(t * 0.006) * 0.52 +
        Math.sin(t * 0.0135 + 2.1) * 0.3 +
        Math.sin(t * 0.029 + 0.6) * 0.18;
      const y = baseY - (0.46 + shape * 0.5) * height;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(W + 30, baseY + 80);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    if (rim) {
      ctx.shadowColor = rim;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawGround() {
    const floor = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    floor.addColorStop(0, '#160c26');
    floor.addColorStop(0.4, '#0c0618');
    floor.addColorStop(1, '#05020b');
    ctx.fillStyle = floor;
    ctx.fillRect(-20, GROUND_Y, W + 40, H - GROUND_Y + 50);

    // Perspective grid.
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 243, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -9; i <= 9; i += 1) {
      const shift = (distance * 0.5) % 130;
      const xBottom = W / 2 + i * 130 - shift;
      const xTop = W / 2 + (xBottom - W / 2) * 0.28;
      ctx.moveTo(xTop, GROUND_Y + 3);
      ctx.lineTo(xBottom, H + 30);
    }
    ctx.stroke();

    const rows = [12, 26, 44, 68, 98, 134];
    rows.forEach((offset, index) => {
      ctx.globalAlpha = 0.5 - index * 0.06;
      ctx.strokeStyle = 'rgba(160, 99, 255, 0.24)';
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + offset);
      ctx.lineTo(W, GROUND_Y + offset);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // Horizon.
    const line = ctx.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, 'rgba(255, 79, 139, 0)');
    line.addColorStop(0.25, '#ff4f8b');
    line.addColorStop(0.55, '#8b7bff');
    line.addColorStop(0.78, '#64f3ff');
    line.addColorStop(1, 'rgba(100, 243, 255, 0)');
    ctx.save();
    ctx.shadowColor = '#ff4f8b';
    ctx.shadowBlur = 16;
    ctx.fillStyle = line;
    ctx.fillRect(0, GROUND_Y - 1, W, 2);
    ctx.restore();

    // Speed dashes.
    if (state === 'playing') {
      ctx.fillStyle = 'rgba(100, 243, 255, 0.34)';
      for (let i = 0; i < 7; i += 1) {
        const x = ((i * 173 - distance * 1.35) % (W + 120) + W + 120) % (W + 120) - 60;
        const y = GROUND_Y + 7 + (i % 3) * 4;
        ctx.fillRect(x, y, 14 + (i % 4) * 7, 1.5);
      }
    }
  }

  /* ---------------- entities ---------------- */

  function drawBird(bird) {
    const bob = Math.sin(time * 9 + bird.seed * 8) * 2;
    const cx = bird.x + bird.w * 0.5;
    const cy = bird.y + bird.h * 0.5 + bob;
    const flap = Math.sin(time * 13 + bird.seed * 9);

    ctx.save();
    ctx.shadowColor = bird.color;
    ctx.shadowBlur = 18;

    // Far wing.
    ctx.fillStyle = 'rgba(255, 233, 207, 0.24)';
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy - 1);
    ctx.lineTo(cx + 10, cy - 18 - flap * 6);
    ctx.lineTo(cx + 22, cy - 2);
    ctx.closePath();
    ctx.fill();

    // Tail feathers.
    ctx.strokeStyle = 'rgba(255, 233, 207, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 16, cy - 2);
    ctx.lineTo(cx + 30, cy - 7);
    ctx.moveTo(cx + 17, cy + 1);
    ctx.lineTo(cx + 32, cy + 1);
    ctx.stroke();

    // Body.
    const body = ctx.createLinearGradient(0, cy - 12, 0, cy + 12);
    body.addColorStop(0, '#fff2ff');
    body.addColorStop(0.4, bird.color);
    body.addColorStop(1, 'rgba(58, 16, 76, 0.5)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 22, 10, -0.06, 0, TAU);
    ctx.fill();

    // Near wing.
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = bird.color;
    ctx.beginPath();
    ctx.moveTo(cx + 1, cy + 1);
    ctx.lineTo(cx - 7, cy + 17 + flap * 4);
    ctx.lineTo(cx + 12, cy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Head.
    ctx.fillStyle = '#ffe9cf';
    ctx.beginPath();
    ctx.arc(cx - 19, cy - 4, 7, 0, TAU);
    ctx.fill();

    // Beak.
    ctx.fillStyle = '#ffd47a';
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy - 6);
    ctx.lineTo(cx - 34, cy - 1);
    ctx.lineTo(cx - 23, cy + 2);
    ctx.closePath();
    ctx.fill();

    // Eye.
    ctx.fillStyle = '#1a0b22';
    ctx.fillRect(cx - 21, cy - 7, 3, 3);
    ctx.fillStyle = '#64f3ff';
    ctx.fillRect(cx - 20, cy - 6, 1, 1);

    ctx.restore();
  }

  function drawObstacles() {
    for (const obstacle of obstacles) {
      if (obstacle.type === 'bird') {
        drawBird(obstacle);
        continue;
      }

      const baseY = GROUND_Y;
      const spikes = obstacle.count;
      const slot = obstacle.w / spikes;

      ctx.save();
      ctx.shadowColor = obstacle.color;
      ctx.shadowBlur = 22;

      const fill = ctx.createLinearGradient(0, baseY - obstacle.h, 0, baseY);
      fill.addColorStop(0, '#fff1ff');
      fill.addColorStop(0.22, obstacle.color);
      fill.addColorStop(1, 'rgba(64, 8, 78, 0.5)');
      ctx.fillStyle = fill;

      ctx.beginPath();
      for (let i = 0; i < spikes; i += 1) {
        const x0 = obstacle.x + i * slot;
        const width = slot - 4;
        const variance = 0.86 + (((i * 37 + obstacle.seed * 100) % 10) / 100);
        const tipX = x0 + width * (0.42 + ((i * 13) % 5) * 0.03);
        const tipY = baseY - obstacle.h * variance;
        ctx.moveTo(x0, baseY);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(x0 + width, baseY);
        ctx.closePath();
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(255, 226, 255, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Glowing base bar.
      ctx.fillStyle = obstacle.color;
      ctx.shadowColor = obstacle.color;
      ctx.shadowBlur = 10;
      ctx.fillRect(obstacle.x - 2, baseY - 3, obstacle.w + 4, 3);
      ctx.restore();
    }
  }

  function drawParticles(group) {
    for (const p of particles) {
      const isFeather = p.type === 'feather';
      if (group === 'feather' ? !isFeather : isFeather) continue;

      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;

      if (isFeather) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.7, p.size * 0.62, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.65;
        ctx.fillRect(-p.size * 1.8, -0.5, p.size * 1.8, 1);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        if (p.type === 'spark') {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
        }
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 16px "Cascadia Mono", Consolas, monospace';
    for (const f of floaters) {
      const alpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  function drawAnnouncement() {
    if (!announcement) return;

    const t = announcement.t;
    const { dur, main, sub } = announcement;
    const pop = t < 0.22 ? 0.62 + easeOutBack(t / 0.22) * 0.38 : 1;
    const alpha = t > dur - 0.35 ? clamp((dur - t) / 0.35, 0, 1) : 1;

    ctx.save();
    ctx.translate(W / 2, GROUND_Y - 268);
    const annScale = pop * (portraitLayout ? 1.15 : 1);
    ctx.scale(annScale, annScale);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';

    ctx.font = '900 46px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#64f3ff';
    ctx.shadowBlur = 24;
    ctx.fillText(main, 0, 0);

    ctx.font = '700 14px "Cascadia Mono", Consolas, monospace';
    ctx.fillStyle = '#ffd47a';
    ctx.shadowColor = '#ff4f8b';
    ctx.shadowBlur = 14;
    ctx.fillText(sub, 0, 30);
    ctx.restore();
  }

  function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  /* ---------------- render loop ---------------- */

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;

    drawSky();

    const shakeX = shake > 0 ? rand(-shake, shake) : 0;
    const shakeY = shake > 0 ? rand(-shake, shake) * 0.7 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawRidge(GROUND_Y - 4, clamp(H * 0.36, 190, 620), distance * 0.05, '#241040', 'rgba(123, 82, 255, 0.28)');
    drawRidge(GROUND_Y + 6, clamp(H * 0.24, 128, 420), distance * 0.12, '#120826', 'rgba(255, 79, 139, 0.3)');

    drawGround();

    drawParticles('feather');
    drawObstacles();
    drawFox();
    drawParticles('fx');
    drawFloaters();
    drawAnnouncement();

    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.033);
    lastTime = now;

    update(dt);
    render();

    requestAnimationFrame(frame);
  }

  relayout();
  updateSoundButton();
  updateBestLabels();
  updateRotateHint();
  setDashReady(true);
  requestAnimationFrame(frame);
})();
