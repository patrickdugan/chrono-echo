(function () {
  'use strict';
  const CE = (window.CE = window.CE || {});

  const CAMPAIGN_WAVES = [
    // Sector I: Neon Foundry
    { sector: 0, title: 'WAVE 1 // INITIAL CALIBRATION', spawns: [['mite', 6], ['pylon', 2]] },
    { sector: 0, title: 'WAVE 2 // AEGIS FRONT LINE', spawns: [['lancer', 3], ['mite', 6], ['pylon', 2]], hint: 'AEGIS LANCERS DEPLOYED! Right-Click [Q] to spawn a Time Echo & flank their shields!' },
    // Sector II: Prism Vault
    { sector: 1, title: 'WAVE 3 // BLINK AMBUSH', spawns: [['stalker', 3], ['lancer', 2], ['mite', 7]] },
    { sector: 1, title: 'WAVE 4 // PRISM CROSSFIRE', spawns: [['stalker', 4], ['pylon', 3], ['lancer', 3]] },
    // Sector III: Gravity Well
    { sector: 2, title: 'WAVE 5 // FISSION SWARM', spawns: [['splitter', 4], ['mite', 8], ['pylon', 2]] },
    { sector: 2, title: 'WAVE 6 // SINGULARITY GAUNTLET', spawns: [['splitter', 4], ['lancer', 4], ['stalker', 3]] },
    // Sector IV: Paradox Engine
    { sector: 3, title: 'WAVE 7 // WARDEN CONCLAVE', spawns: [['warden', 3], ['lancer', 4], ['splitter', 3]] },
    { sector: 3, title: 'WAVE 8 // HEAVY BASTION', spawns: [['juggernaut', 2], ['warden', 2], ['stalker', 4], ['mite', 6]] },
    // Sector V: Chronarch Sanctum
    { sector: 4, title: 'WAVE 9 // PRETORIAN VANGUARD', spawns: [['juggernaut', 2], ['warden', 3], ['lancer', 4], ['splitter', 3]] },
    { sector: 4, title: 'WAVE 10 // THE OMEGA CHRONARCH', boss: true, spawns: [['chronarch', 1]] }
  ];

  const SAVE_KEY = 'chrono_echo_save_v1';

  class Game {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.grid = new CE.SpacetimeGrid(CE.WIDTH, CE.HEIGHT, 35, 21);

      this.state = 'MENU'; // MENU, PLAYING, UPGRADE, PAUSED, GAMEOVER, VICTORY
      this.mode = 'campaign'; // campaign, endless, daily
      this.rng = CE.createRNG('init');
      this.seedLabel = '';

      this.settings = {
        music: true,
        sfx: true,
        autoAim: false,
        shake: true
      };
      this.highScores = { campaign: 0, endless: 0, daily: 0, bestTime: null };
      this.loadSave();

      // Input state
      this.keys = {};
      this.mouse = { x: CE.WIDTH * 0.65, y: CE.HEIGHT * 0.5, down: false, rightDown: false, moved: false };
      this.shakeMag = 0;
      this.hitstop = 0;
      this.rewindFlash = 0;

      // Simulation entities & stats
      this.simTime = 0;
      this.runTime = 0;
      this.timeScale = 1.0;
      this.bulletTimeTimer = 0;

      this.stats = CE.createBaseStats();
      this.ownedUpgrades = {};
      this.currentChoices = [];
      this.upgradeLockTimer = 0;

      this.player = null;
      this.history = [];
      this.echoes = [];
      this.projectiles = [];
      this.enemies = [];
      this.enemyBullets = [];
      this.particles = [];
      this.shockwaves = [];
      this.lightnings = [];
      this.floatTexts = [];
      this.pickups = [];
      this.afterimages = [];

      this.wave = 1;
      this.sector = 0;
      this.currentHpScale = 1.0;
      this.pendingSpawns = [];
      this.spawnClock = 0;
      this.waveClearDelay = 0;

      this.score = 0;
      this.combo = 1.0;
      this.comboTimer = 0;
      this.kills = 0;
      this.crossfireCount = 0;
      this.grazeCount = 0;
      this.echoesSpawned = 0;
      this.rewindsUsed = 0;

      this.banner = { text: '', color: '#38bdf8', timer: 0 };
      this.coachShownShield = false;
      this.coachShownRewind = false;

      this.resize();
      this.bindEvents();
      this.syncSettingsUI();
      this.updateHighScoreUI();

      this.lastFrameTime = performance.now();
      this.accum = 0;
      requestAnimationFrame((ts) => this.loop(ts));
    }

    loadSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.highScores) Object.assign(this.highScores, parsed.highScores);
          if (parsed.settings) Object.assign(this.settings, parsed.settings);
        }
      } catch (e) {}
      CE.Audio.setMusicEnabled(this.settings.music);
      CE.Audio.setSfxEnabled(this.settings.sfx);
    }

    saveData() {
      try {
        localStorage.setItem(
          SAVE_KEY,
          JSON.stringify({
            highScores: this.highScores,
            settings: this.settings
          })
        );
      } catch (e) {}
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = CE.WIDTH * dpr;
      this.canvas.height = CE.HEIGHT * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    clientToArena(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: CE.WIDTH * 0.5, y: CE.HEIGHT * 0.5 };
      return {
        x: CE.clamp(((clientX - rect.left) / rect.width) * CE.WIDTH, 0, CE.WIDTH),
        y: CE.clamp(((clientY - rect.top) / rect.height) * CE.HEIGHT, 0, CE.HEIGHT)
      };
    }

    bindEvents() {
      window.addEventListener('resize', () => this.resize());

      window.addEventListener('keydown', (ev) => {
        CE.Audio.init();
        const code = ev.code;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(code) !== -1) {
          ev.preventDefault();
        }

        if (ev.repeat) return;
        this.keys[code] = true;

        if (code === 'KeyM') {
          this.toggleSetting('music');
          return;
        }
        if (code === 'KeyF') {
          this.toggleSetting('autoAim');
          this.showBanner('AUTO-AIM ASSIST: ' + (this.settings.autoAim ? 'ON' : 'OFF'), '#38bdf8', 1.8);
          return;
        }

        if (this.state === 'UPGRADE' && this.upgradeLockTimer <= 0) {
          if (code === 'Digit1' || code === 'Numpad1') this.pickUpgrade(0);
          else if (code === 'Digit2' || code === 'Numpad2') this.pickUpgrade(1);
          else if (code === 'Digit3' || code === 'Numpad3') this.pickUpgrade(2);
          return;
        }

        if (code === 'Escape' || code === 'KeyP') {
          if (this.state === 'PLAYING') this.setPaused(true);
          else if (this.state === 'PAUSED') this.setPaused(false);
          return;
        }

        if (this.state !== 'PLAYING') return;

        if (code === 'Digit1') this.selectWeapon(0);
        else if (code === 'Digit2') this.selectWeapon(1);
        else if (code === 'Digit3') this.selectWeapon(2);
        else if (code === 'Tab') this.selectWeapon((this.player.weaponId + 1) % 3);
        else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') this.tryDash();
        else if (code === 'KeyQ') this.trySpawnEcho();
        else if (code === 'KeyE' || code === 'KeyR') this.tryRewind();
      });

      window.addEventListener('keyup', (ev) => {
        this.keys[ev.code] = false;
      });

      window.addEventListener('blur', () => {
        this.keys = {};
        this.mouse.down = false;
        this.mouse.rightDown = false;
      });

      this.canvas.addEventListener('mousemove', (ev) => {
        const pt = this.clientToArena(ev.clientX, ev.clientY);
        this.mouse.x = pt.x;
        this.mouse.y = pt.y;
        this.mouse.moved = true;
      });

      this.canvas.addEventListener('mousedown', (ev) => {
        CE.Audio.init();
        const pt = this.clientToArena(ev.clientX, ev.clientY);
        this.mouse.x = pt.x;
        this.mouse.y = pt.y;

        if (ev.button === 0) {
          this.mouse.down = true;
          // Check bottom-center weapon HUD click convenience
          if (this.state === 'PLAYING' && pt.y > CE.HEIGHT - 56 && Math.abs(pt.x - CE.WIDTH * 0.5) < 210) {
            const rel = pt.x - (CE.WIDTH * 0.5 - 195);
            const idx = Math.floor(rel / 130);
            if (idx >= 0 && idx <= 2) this.selectWeapon(idx);
          }
        } else if (ev.button === 2) {
          this.mouse.rightDown = true;
          if (this.state === 'PLAYING') this.trySpawnEcho();
        }
      });

      window.addEventListener('mouseup', (ev) => {
        if (ev.button === 0) this.mouse.down = false;
        if (ev.button === 2) this.mouse.rightDown = false;
      });

      this.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

      this.canvas.addEventListener(
        'wheel',
        (ev) => {
          if (this.state !== 'PLAYING' || !this.player) return;
          ev.preventDefault();
          const dir = ev.deltaY > 0 ? 1 : -1;
          this.selectWeapon((this.player.weaponId + dir + 3) % 3);
        },
        { passive: false }
      );

      // UI Buttons
      const bindBtn = (id, fn) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('click', () => {
            CE.Audio.init();
            fn();
          });
        }
      };

      bindBtn('btn-campaign', () => this.startRun('campaign'));
      bindBtn('btn-endless', () => this.startRun('endless'));
      bindBtn('btn-daily', () => this.startRun('daily'));

      bindBtn('btn-toggle-music', () => this.toggleSetting('music'));
      bindBtn('btn-toggle-sfx', () => this.toggleSetting('sfx'));
      bindBtn('btn-toggle-aim', () => this.toggleSetting('autoAim'));
      bindBtn('btn-toggle-shake', () => this.toggleSetting('shake'));

      bindBtn('btn-resume', () => this.setPaused(false));
      bindBtn('btn-restart', () => this.startRun(this.mode));
      bindBtn('btn-quit-menu', () => this.returnToMenu());

      bindBtn('btn-retry', () => this.startRun(this.mode));
      bindBtn('btn-gameover-menu', () => this.returnToMenu());

      bindBtn('btn-continue-endless', () => this.continueIntoEndless());
      bindBtn('btn-victory-menu', () => this.returnToMenu());
    }

    toggleSetting(key) {
      this.settings[key] = !this.settings[key];
      if (key === 'music') CE.Audio.setMusicEnabled(this.settings.music);
      if (key === 'sfx') CE.Audio.setSfxEnabled(this.settings.sfx);
      this.syncSettingsUI();
      this.saveData();
    }

    syncSettingsUI() {
      const setLabel = (id, prefix, on) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = prefix + ': ' + (on ? 'ON' : 'OFF');
          el.classList.toggle('active-toggle', !!on);
        }
      };
      setLabel('btn-toggle-music', 'MUSIC [M]', this.settings.music);
      setLabel('btn-toggle-sfx', 'SFX', this.settings.sfx);
      setLabel('btn-toggle-aim', 'AUTO-AIM [F]', this.settings.autoAim);
      setLabel('btn-toggle-shake', 'SHAKE', this.settings.shake);
    }

    updateHighScoreUI() {
      const el = document.getElementById('menu-records');
      if (!el) return;
      const bestT = this.highScores.bestTime
        ? this.formatTime(this.highScores.bestTime)
        : '--:--';
      el.innerHTML =
        '<span>CAMPAIGN BEST: <b>' + this.highScores.campaign.toLocaleString() + '</b></span>' +
        '<span>FASTEST CLEAR: <b>' + bestT + '</b></span>' +
        '<span>ENDLESS BEST: <b>' + this.highScores.endless.toLocaleString() + '</b></span>' +
        '<span>DAILY BEST: <b>' + this.highScores.daily.toLocaleString() + '</b></span>';
    }

    showOverlay(id) {
      ['overlay-menu', 'overlay-upgrade', 'overlay-pause', 'overlay-gameover', 'overlay-victory'].forEach((oid) => {
        const el = document.getElementById(oid);
        if (el) el.classList.toggle('hidden', oid !== id);
      });
    }

    returnToMenu() {
      this.state = 'MENU';
      CE.Audio.setState(0, 0);
      CE.Audio.setTimeWarp(1.0);
      this.updateHighScoreUI();
      this.showOverlay('overlay-menu');
    }

    setPaused(paused) {
      if (paused && this.state === 'PLAYING') {
        this.state = 'PAUSED';
        CE.Audio.setTimeWarp(0.4);
        this.renderPauseAugments();
        this.showOverlay('overlay-pause');
      } else if (!paused && this.state === 'PAUSED') {
        this.state = 'PLAYING';
        CE.Audio.setTimeWarp(this.timeScale);
        this.showOverlay(null);
      }
    }

    renderPauseAugments() {
      const box = document.getElementById('pause-augments');
      if (!box) return;
      const keys = Object.keys(this.ownedUpgrades);
      if (!keys.length) {
        box.innerHTML = '<span class="muted-note">No Chrono-Augments installed yet.</span>';
        return;
      }
      box.innerHTML = keys
        .map((id) => {
          const u = CE.UPGRADES.find((x) => x.id === id);
          const count = this.ownedUpgrades[id];
          if (!u) return '';
          return (
            '<div class="aug-pill" style="border-color:' +
            CE.RARITY_COLORS[u.rarity] +
            '"><b>' +
            u.name +
            (count > 1 ? ' x' + count : '') +
            '</b> — ' +
            u.desc +
            '</div>'
          );
        })
        .join('');
    }

    startRun(mode) {
      this.mode = mode || 'campaign';
      const today = new Date().toISOString().slice(0, 10);
      if (this.mode === 'daily') {
        this.seedLabel = 'DAILY-' + today;
        this.rng = CE.createRNG(this.seedLabel);
      } else {
        const randCode = Math.random().toString(36).slice(2, 7).toUpperCase();
        this.seedLabel = (this.mode === 'endless' ? 'END-' : 'RUN-') + randCode;
        this.rng = CE.createRNG(this.seedLabel + Date.now());
      }

      this.stats = CE.createBaseStats();
      this.ownedUpgrades = {};
      this.simTime = 0;
      this.runTime = 0;
      this.timeScale = 1.0;
      this.bulletTimeTimer = 0;
      this.hitstop = 0;
      this.rewindFlash = 0;

      this.score = 0;
      this.combo = 1.0;
      this.comboTimer = 0;
      this.kills = 0;
      this.crossfireCount = 0;
      this.grazeCount = 0;
      this.echoesSpawned = 0;
      this.rewindsUsed = 0;
      this.coachShownShield = false;
      this.coachShownRewind = false;

      this.player = {
        id: 'player',
        x: CE.WIDTH * 0.5,
        y: CE.HEIGHT * 0.55,
        vx: 0,
        vy: 0,
        radius: 14,
        aim: -Math.PI * 0.5,
        hp: this.stats.maxHp,
        weaponId: 0,
        fireCd: 0,
        shotCounter: 0,
        echoEnergy: this.stats.maxEchoCharges,
        rewindCd: 0,
        dashCd: 0,
        dashTimer: 0,
        dashVx: 0,
        dashVy: 0,
        dashMineTick: 0,
        resonatedIds: new Set(),
        invulnTimer: 0.8,
        readyShields: 0,
        shieldRegenTimer: 0
      };

      this.history = [];
      this.echoes = [];
      this.projectiles = [];
      this.enemies = [];
      this.enemyBullets = [];
      this.particles = [];
      this.shockwaves = [];
      this.lightnings = [];
      this.floatTexts = [];
      this.pickups = [];
      this.afterimages = [];
      this.grid.reset();

      // Pre-seed 1.2s of stationary/ready timeline so Echo works even in the very first second!
      for (let i = 0; i < 72; i++) {
        this.history.push({
          x: this.player.x,
          y: this.player.y,
          aim: -Math.PI * 0.5,
          firing: false,
          weaponId: 0,
          dashing: false,
          hp: this.player.hp
        });
      }

      this.wave = 0;
      this.state = 'PLAYING';
      this.showOverlay(null);
      this.startNextWave();
    }

    startNextWave() {
      this.wave++;
      this.waveClearDelay = 0;
      this.pendingSpawns = [];
      this.spawnClock = 0.25;

      let waveDef = null;
      if (this.mode === 'campaign' && this.wave <= CAMPAIGN_WAVES.length) {
        waveDef = CAMPAIGN_WAVES[this.wave - 1];
        this.sector = waveDef.sector;
        this.currentHpScale = 1 + (this.wave - 1) * 0.11;
      } else {
        // Endless or Post-Victory Overdrive procedural wave composition
        this.sector = Math.floor((this.wave - 1) / 2) % 5;
        this.currentHpScale = 1 + (this.wave - 1) * 0.16;
        const isBossWave = this.wave % 5 === 0;
        if (isBossWave) {
          waveDef = {
            sector: 4,
            boss: true,
            title: 'OVERDRIVE WAVE ' + this.wave + ' // CHRONARCH REBORN',
            spawns: [['chronarch', 1], ['warden', Math.min(3, Math.floor(this.wave / 5))]]
          };
          this.sector = 4;
        } else {
          const budget = 7 + this.wave * 2;
          const roster = ['mite', 'pylon', 'lancer'];
          if (this.wave >= 2) roster.push('stalker');
          if (this.wave >= 3) roster.push('splitter');
          if (this.wave >= 4) roster.push('warden');
          if (this.wave >= 6) roster.push('juggernaut');

          const counts = {};
          for (let b = 0; b < budget; b++) {
            const pick = this.rng.pick(roster);
            counts[pick] = (counts[pick] || 0) + 1;
          }
          waveDef = {
            sector: this.sector,
            title: (this.mode === 'daily' ? 'DAILY ' : 'OVERDRIVE ') + 'WAVE ' + this.wave,
            spawns: Object.keys(counts).map((k) => [k, counts[k]])
          };
        }
      }

      // Flatten spawn list and shuffle for dynamic pacing
      const flat = [];
      waveDef.spawns.forEach((pair) => {
        for (let c = 0; c < pair[1]; c++) flat.push(pair[0]);
      });
      this.pendingSpawns = waveDef.boss ? flat : this.rng.shuffle(flat);

      if (waveDef.boss) {
        CE.Audio.setState(3, this.sector);
        CE.Audio.bossAlert();
        this.showBanner(waveDef.title, '#fbbf24', 3.8);
      } else {
        CE.Audio.setState(this.combo >= 2.5 ? 2 : 1, this.sector);
        this.showBanner(waveDef.hint || waveDef.title, '#38bdf8', waveDef.hint ? 4.2 : 2.6);
      }

      // Spawn initial wave vanguard immediately
      const initialBatch = waveDef.boss ? this.pendingSpawns.length : Math.min(5, this.pendingSpawns.length);
      for (let i = 0; i < initialBatch; i++) {
        this.spawnNextFromQueue();
      }
    }

    spawnNextFromQueue() {
      if (!this.pendingSpawns.length) return;
      const type = this.pendingSpawns.shift();
      if (type === 'chronarch') {
        CE.spawnEnemy(this, 'chronarch', CE.WIDTH * 0.5, 165, this.currentHpScale);
        return;
      }

      // Pick perimeter spawn point safely away from Player
      let sx = 100;
      let sy = 100;
      for (let tries = 0; tries < 14; tries++) {
        const edge = this.rng.int(0, 3);
        if (edge === 0) {
          sx = this.rng.range(60, CE.WIDTH - 60);
          sy = 54;
        } else if (edge === 1) {
          sx = this.rng.range(60, CE.WIDTH - 60);
          sy = CE.HEIGHT - 54;
        } else if (edge === 2) {
          sx = 54;
          sy = this.rng.range(60, CE.HEIGHT - 60);
        } else {
          sx = CE.WIDTH - 54;
          sy = this.rng.range(60, CE.HEIGHT - 60);
        }
        if (CE.dist(sx, sy, this.player.x, this.player.y) > 230) break;
      }
      CE.spawnEnemy(this, type, sx, sy, this.currentHpScale);
    }

    selectWeapon(idx) {
      if (!this.player) return;
      this.player.weaponId = idx;
    }

    tryDash() {
      const p = this.player;
      if (!p || p.dashCd > 0 || p.dashTimer > 0) return;

      let dx = 0;
      let dy = 0;
      if (this.keys.KeyW || this.keys.ArrowUp) dy -= 1;
      if (this.keys.KeyS || this.keys.ArrowDown) dy += 1;
      if (this.keys.KeyA || this.keys.ArrowLeft) dx -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) dx += 1;

      let ang = p.aim;
      if (dx !== 0 || dy !== 0) {
        ang = Math.atan2(dy, dx);
      }

      p.dashTimer = 0.17;
      p.invulnTimer = Math.max(p.invulnTimer, 0.25);
      p.dashCd = this.stats.dashCooldown;
      p.dashVx = Math.cos(ang) * 930;
      p.dashVy = Math.sin(ang) * 930;
      p.dashMineTick = 0.02;
      p.resonatedIds.clear();

      CE.Audio.dash(false);
      this.grid.applyImpulse(p.x, p.y, 115, 220);
      this.spawnBurst(p.x, p.y, '#38bdf8', 10, 170);
    }

    trySpawnEcho() {
      const p = this.player;
      if (!p) return;
      if (p.echoEnergy < 1.0) {
        this.spawnFloatText(p.x, p.y - 24, 'NEED ECHO CHARGE', '#94a3b8', 11);
        return;
      }
      if (this.history.length < 20) return;

      p.echoEnergy -= 1.0;
      this.echoesSpawned++;

      const desiredFrames = Math.round(this.stats.echoDuration * 60);
      const startIdx = Math.max(0, this.history.length - Math.min(desiredFrames, 300));
      const frames = this.history.slice(startIdx);
      const first = frames[0];

      const echo = {
        id: 'echo_' + Date.now() + '_' + Math.random(),
        x: first.x,
        y: first.y,
        aim: first.aim,
        weaponId: first.weaponId,
        fireCd: 0,
        shotCounter: 0,
        frames: frames,
        cursor: 0,
        timeLeft: this.stats.echoDuration,
        maxTime: this.stats.echoDuration
      };

      this.echoes.push(echo);
      CE.Audio.echoSpawn();
      this.grid.applyImpulse(echo.x, echo.y, 145, 290);
      this.shockwaves.push({
        x: echo.x,
        y: echo.y,
        r: 8,
        maxR: 78,
        color: '#67e8f9',
        alpha: 0.85,
        lineWidth: 3
      });
      this.spawnBurst(echo.x, echo.y, '#67e8f9', 18, 200);
      this.spawnFloatText(echo.x, echo.y - 22, 'TIME ECHO MANIFESTED!', '#67e8f9', 13);
    }

    tryRewind() {
      const p = this.player;
      if (!p || p.rewindCd > 0 || this.history.length < 15) return;

      const backFrames = Math.min(this.history.length - 1, Math.round(this.stats.rewindWindow * 60));
      const targetIdx = this.history.length - 1 - backFrames;
      const snap = this.history[targetIdx];

      const oldX = p.x;
      const oldY = p.y;
      const healed = Math.max(0, Math.round(snap.hp - p.hp));

      // Leave a brief Paradox Remnant volley at the departure spot!
      for (let k = 0; k < 6; k++) {
        const ra = (k / 6) * CE.TAU;
        CE.fireWeapon(this, { id: 'remnant', x: oldX, y: oldY, shotCounter: 1 }, 0, ra, true);
      }

      // Draw glowing rewind ribbon particles from old pos back to rewound pos
      for (let s = targetIdx; s < this.history.length; s += 4) {
        const h = this.history[s];
        this.spawnParticle(h.x, h.y, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.38, '#fbbf24', 3.5);
      }

      p.x = snap.x;
      p.y = snap.y;
      p.hp = Math.max(p.hp, snap.hp);
      p.invulnTimer = 0.85;
      p.rewindCd = this.stats.rewindCooldown;
      this.history.length = targetIdx + 1;

      this.rewindsUsed++;
      this.rewindFlash = 1.0;
      CE.Audio.rewind();
      this.addShake(9);
      this.grid.applyImplosion(p.x, p.y, 260, 520);
      this.shockwaves.push({
        x: p.x,
        y: p.y,
        r: 12,
        maxR: Math.min(340, this.stats.rewindFreezeRadius),
        color: '#fbbf24',
        alpha: 0.9,
        lineWidth: 4
      });

      // Freeze enemies in Rewind Shockwave radius & clear nearby bullets!
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (CE.dist(p.x, p.y, e.x, e.y) <= this.stats.rewindFreezeRadius) {
          e.freezeTimer = Math.max(e.freezeTimer, this.stats.rewindFreezeDur);
        }
      }
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
        if (CE.dist(p.x, p.y, this.enemyBullets[i].x, this.enemyBullets[i].y) <= 170) {
          this.enemyBullets.splice(i, 1);
        }
      }

      const msg = healed > 0 ? 'CHRONO REWIND +' + healed + ' HP!' : 'CHRONO REWIND!';
      this.spawnFloatText(p.x, p.y - 26, msg, '#fbbf24', 15);
    }

    damagePlayer(amount) {
      const p = this.player;
      if (!p || p.invulnTimer > 0 || p.dashTimer > 0 || this.state !== 'PLAYING') return;

      p.hp -= amount;
      p.invulnTimer = 0.65;
      this.combo = Math.max(1.0, +(this.combo * 0.72).toFixed(2));
      CE.Audio.playerHit();
      this.addShake(11);
      this.grid.applyImpulse(p.x, p.y, 160, 340);
      this.spawnBurst(p.x, p.y, '#f43f5e', 18, 220);
      this.spawnFloatText(p.x, p.y - 22, '-' + Math.round(amount), '#f43f5e', 15);

      if (p.hp > 0 && p.rewindCd <= 0 && !this.coachShownRewind) {
        this.coachShownRewind = true;
        this.showBanner('HULL DAMAGED! Press [E] CHRONO REWIND now to undo recent damage!', '#fbbf24', 3.6);
      }

      if (p.hp <= 0) {
        p.hp = 0;
        this.onGameOver();
      }
    }

    onBulletGraze(bx, by, duringDash) {
      this.grazeCount++;
      this.score += Math.round(25 * this.combo);
      this.addCombo(0.08);
      this.player.echoEnergy = Math.min(this.stats.maxEchoCharges, this.player.echoEnergy + (duringDash ? 0.16 : 0.07));
      CE.Audio.graze();
      this.spawnBurst(bx, by, '#67e8f9', 5, 95);

      if (duringDash || this.ownedUpgrades.bullet_time_graze) {
        this.bulletTimeTimer = Math.max(this.bulletTimeTimer, this.stats.grazeSlowDur);
        this.spawnFloatText(this.player.x, this.player.y - 28, 'BULLET-TIME GRAZE!', '#67e8f9', 12);
      }
    }

    onBossDefeated() {
      if (this.mode === 'campaign' && this.wave === CAMPAIGN_WAVES.length) {
        // Campaign Cleared!
        this.state = 'VICTORY';
        CE.Audio.victory();
        CE.Audio.setState(0, 4);
        CE.Audio.setTimeWarp(1.0);

        if (this.score > this.highScores.campaign) this.highScores.campaign = this.score;
        if (!this.highScores.bestTime || this.runTime < this.highScores.bestTime) {
          this.highScores.bestTime = this.runTime;
        }
        this.saveData();
        this.populateEndSummary('victory-stats');
        this.showOverlay('overlay-victory');
      }
    }

    continueIntoEndless() {
      this.mode = 'endless';
      this.state = 'PLAYING';
      this.showOverlay(null);
      this.openUpgradeDraft();
    }

    onGameOver() {
      this.state = 'GAMEOVER';
      CE.Audio.setState(0, this.sector);
      CE.Audio.setTimeWarp(1.0);

      const bucket = this.mode === 'daily' ? 'daily' : this.mode === 'endless' ? 'endless' : 'campaign';
      if (this.score > this.highScores[bucket]) {
        this.highScores[bucket] = this.score;
      }
      this.saveData();
      this.populateEndSummary('gameover-stats');
      this.showOverlay('overlay-gameover');
    }

    populateEndSummary(containerId) {
      const box = document.getElementById(containerId);
      if (!box) return;
      box.innerHTML =
        '<div class="stat-cell"><span>FINAL SCORE</span><b>' + this.score.toLocaleString() + '</b></div>' +
        '<div class="stat-cell"><span>WAVE REACHED</span><b>' + this.wave + '</b></div>' +
        '<div class="stat-cell"><span>RUN TIME</span><b>' + this.formatTime(this.runTime) + '</b></div>' +
        '<div class="stat-cell"><span>HOSTILES PURGED</span><b>' + this.kills + '</b></div>' +
        '<div class="stat-cell"><span>CROSSFIRE OVERLOADS</span><b>' + this.crossfireCount + '</b></div>' +
        '<div class="stat-cell"><span>ECHOES / REWINDS</span><b>' + this.echoesSpawned + ' / ' + this.rewindsUsed + '</b></div>';
    }

    openUpgradeDraft() {
      this.currentChoices = CE.rollUpgrades(this.rng, this.ownedUpgrades, 3);
      if (!this.currentChoices.length) {
        // Maxed out every augment — award Hull Repair & Score Bonus
        this.player.hp = Math.min(this.stats.maxHp, this.player.hp + 30);
        this.score += 1000;
        this.startNextWave();
        return;
      }

      this.state = 'UPGRADE';
      this.upgradeLockTimer = 0.32;
      this.mouse.down = false;
      CE.Audio.setTimeWarp(0.45);

      const container = document.getElementById('upgrade-cards');
      container.innerHTML = '';
      this.currentChoices.forEach((u, idx) => {
        const stacks = this.ownedUpgrades[u.id] || 0;
        const col = CE.RARITY_COLORS[u.rarity];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'upgrade-card';
        card.style.setProperty('--card-accent', col);
        card.innerHTML =
          '<div class="up-top">' +
          '<span class="up-rarity" style="color:' + col + '">' + u.rarity + '</span>' +
          '<span class="up-key">[' + (idx + 1) + ']</span>' +
          '</div>' +
          '<div class="up-icon" style="border-color:' + col + ';color:' + col + '">' + u.icon + '</div>' +
          '<div class="up-name">' + u.name + '</div>' +
          '<div class="up-desc">' + u.desc + '</div>' +
          '<div class="up-stack">STACK: ' + stacks + ' / ' + u.maxStacks + '</div>';
        card.addEventListener('click', () => {
          if (this.upgradeLockTimer <= 0) this.pickUpgrade(idx);
        });
        container.appendChild(card);
      });

      this.showOverlay('overlay-upgrade');
    }

    pickUpgrade(idx) {
      if (this.state !== 'UPGRADE') return;
      const u = this.currentChoices[idx];
      if (!u) return;

      this.ownedUpgrades[u.id] = (this.ownedUpgrades[u.id] || 0) + 1;
      u.apply(this.stats, this);
      if (u.id === 'aegis_hull') {
        this.player.readyShields = this.stats.orbitalShields;
      }

      CE.Audio.upgradePick();
      CE.Audio.setTimeWarp(1.0);
      this.state = 'PLAYING';
      this.showOverlay(null);
      this.startNextWave();
    }

    // --- HELPERS ---

    addCombo(delta) {
      this.combo = Math.min(8.0, +(this.combo + delta).toFixed(2));
      this.comboTimer = 4.5;
    }

    addShake(mag) {
      if (!this.settings.shake) return;
      this.shakeMag = Math.min(22, Math.max(this.shakeMag, mag));
    }

    showBanner(text, color, dur) {
      this.banner.text = text;
      this.banner.color = color || '#38bdf8';
      this.banner.timer = dur || 3.0;
    }

    spawnParticle(x, y, vx, vy, life, color, size) {
      if (this.particles.length > 550) return;
      this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, color: color, size: size || 2.5 });
    }

    spawnBurst(x, y, color, count, maxSpeed) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * CE.TAU;
        const sp = 25 + Math.random() * maxSpeed;
        this.spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.22 + Math.random() * 0.28, color, 2 + Math.random() * 2.4);
      }
    }

    spawnFloatText(x, y, text, color, size) {
      if (this.floatTexts.length > 28) this.floatTexts.shift();
      this.floatTexts.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y,
        text: text,
        color: color || '#ffffff',
        size: size || 13,
        life: 0.78,
        maxLife: 0.78
      });
    }

    findNearestEnemy(x, y, maxDist) {
      let best = null;
      let bestD = maxDist || 9999;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        const d = CE.dist(x, y, e.x, e.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    }

    findNearestEnemies(x, y, maxDist, count, excludeUid) {
      const list = [];
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.uid === excludeUid) continue;
        const d = CE.dist(x, y, e.x, e.y);
        if (d <= maxDist) list.push({ e: e, d: d });
      }
      list.sort((a, b) => a.d - b.d);
      return list.slice(0, count).map((item) => item.e);
    }

    formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
    }

    // --- MAIN SIMULATION LOOP ---

    loop(now) {
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;

      if (this.state === 'MENU') {
        // Live attract-mode Spacetime Grid & orbital pulse animation
        this.simTime += rawDt;
        const orbitA = this.simTime * 1.15;
        const ox1 = CE.WIDTH * 0.5 + Math.cos(orbitA) * 370;
        const oy1 = CE.HEIGHT * 0.5 + Math.sin(orbitA * 1.5) * 230;
        const ox2 = CE.WIDTH * 0.5 + Math.cos(orbitA + Math.PI) * 370;
        const oy2 = CE.HEIGHT * 0.5 + Math.sin(orbitA * 1.5 + Math.PI) * 230;
        this.grid.applyImplosion(ox1, oy1, 145, 22);
        this.grid.applyVortex(ox2, oy2, 155, 24);
        if (Math.random() < 0.05) {
          this.grid.applyImpulse(
            CE.WIDTH * (0.15 + Math.random() * 0.7),
            CE.HEIGHT * (0.15 + Math.random() * 0.7),
            175,
            240
          );
        }
        this.grid.update(rawDt);
        this.renderMenuBackdrop(ox1, oy1, ox2, oy2, orbitA);
      } else if (this.state === 'UPGRADE') {
        if (this.upgradeLockTimer > 0) this.upgradeLockTimer -= rawDt;
        this.grid.update(rawDt * 0.25);
        this.renderScene();
      } else if (this.state === 'PAUSED' || this.state === 'GAMEOVER' || this.state === 'VICTORY') {
        this.grid.update(rawDt * 0.2);
        this.renderScene();
      } else if (this.state === 'PLAYING') {
        if (this.hitstop > 0) {
          this.hitstop -= rawDt;
        } else {
          this.accum += rawDt;
          const fixed = 1 / 60;
          let steps = 0;
          while (this.accum >= fixed && steps < 4) {
            this.accum -= fixed;
            steps++;
            this.stepSimulation(fixed);
            if (this.state !== 'PLAYING') break;
          }
        }
        this.renderScene();
      }

      requestAnimationFrame((ts) => this.loop(ts));
    }

    pollGamepad() {
      if (!navigator.getGamepads) return null;
      const pads = navigator.getGamepads();
      if (!pads) return null;
      for (let i = 0; i < pads.length; i++) {
        const gp = pads[i];
        if (gp && gp.connected) return gp;
      }
      return null;
    }

    stepSimulation(realDt) {
      this.runTime += realDt;
      if (this.banner.timer > 0) this.banner.timer -= realDt;
      if (this.rewindFlash > 0) this.rewindFlash = Math.max(0, this.rewindFlash - realDt * 2.4);
      if (this.shakeMag > 0) this.shakeMag = Math.max(0, this.shakeMag - realDt * 38);

      // Bullet-Time scaling (enemies slow down while player moves slightly faster relative to world!)
      if (this.bulletTimeTimer > 0) {
        this.bulletTimeTimer -= realDt;
        this.timeScale = CE.lerp(this.timeScale, 0.45, 0.25);
      } else {
        this.timeScale = CE.lerp(this.timeScale, 1.0, 0.18);
      }
      CE.Audio.setTimeWarp(this.timeScale);

      const worldDt = realDt * this.timeScale;
      const playerDt = realDt * CE.lerp(1.0, 0.82, 1 - this.timeScale);
      this.simTime += worldDt;

      // Combo decay
      if (this.combo > 1.0) {
        this.comboTimer -= realDt;
        if (this.comboTimer <= 0) {
          this.combo = Math.max(1.0, +(this.combo - realDt * 0.45).toFixed(2));
        }
      }

      // Dynamic music intensity
      const hasBoss = this.enemies.some((e) => e.isBoss);
      CE.Audio.setState(hasBoss ? 3 : this.combo >= 2.4 ? 2 : 1, this.sector);

      // Wave spawn director
      if (this.pendingSpawns.length > 0) {
        this.spawnClock -= worldDt;
        if (this.spawnClock <= 0 || this.enemies.length <= 1) {
          const batch = Math.min(2, this.pendingSpawns.length);
          for (let b = 0; b < batch; b++) this.spawnNextFromQueue();
          this.spawnClock = 1.65;
        }
      } else if (this.enemies.length === 0) {
        this.waveClearDelay += realDt;
        if (this.waveClearDelay >= 0.75) {
          this.openUpgradeDraft();
          return;
        }
      }

      this.updatePlayer(playerDt, realDt);
      this.updateEchoes(playerDt);
      CE.updateProjectiles(this, worldDt);
      CE.updateEnemies(this, worldDt);
      this.updatePickupsAndVfx(worldDt, realDt);
      this.grid.update(realDt);
    }

    updatePlayer(dt, realDt) {
      const p = this.player;
      const stats = this.stats;

      if (p.invulnTimer > 0) p.invulnTimer -= realDt;
      if (p.dashCd > 0) p.dashCd -= realDt;
      if (p.rewindCd > 0) p.rewindCd -= realDt;
      if (p.fireCd > 0) p.fireCd -= dt;

      // Recharge Echo Charges
      if (p.echoEnergy < stats.maxEchoCharges) {
        p.echoEnergy = Math.min(stats.maxEchoCharges, p.echoEnergy + stats.echoRechargeRate * realDt);
      }

      // Recharge Orbital Aegis Shields
      if (stats.orbitalShields > 0 && p.readyShields < stats.orbitalShields) {
        p.shieldRegenTimer -= realDt;
        if (p.shieldRegenTimer <= 0) {
          p.readyShields++;
          p.shieldRegenTimer = 5.0;
        }
      }

      // Movement + optional Gamepad
      let mx = 0;
      let my = 0;
      if (this.keys.KeyW || this.keys.ArrowUp) my -= 1;
      if (this.keys.KeyS || this.keys.ArrowDown) my += 1;
      if (this.keys.KeyA || this.keys.ArrowLeft) mx -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) mx += 1;

      const gp = this.pollGamepad();
      let gpFiring = false;
      if (gp) {
        if (Math.hypot(gp.axes[0] || 0, gp.axes[1] || 0) > 0.2) {
          mx = gp.axes[0];
          my = gp.axes[1];
        }
        if (Math.hypot(gp.axes[2] || 0, gp.axes[3] || 0) > 0.25) {
          p.aim = Math.atan2(gp.axes[3], gp.axes[2]);
          this.mouse.moved = false;
        }
        gpFiring = !!(gp.buttons[7] && gp.buttons[7].pressed) || !!(gp.buttons[5] && gp.buttons[5].pressed);
        if (gp.buttons[0] && gp.buttons[0].pressed) this.tryDash();
        if (gp.buttons[6] && gp.buttons[6].pressed && !this._gpEchoHeld) {
          this._gpEchoHeld = true;
          this.trySpawnEcho();
        } else if (!(gp.buttons[6] && gp.buttons[6].pressed)) {
          this._gpEchoHeld = false;
        }
        if (gp.buttons[3] && gp.buttons[3].pressed) this.tryRewind();
      }

      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }

      if (p.dashTimer > 0) {
        p.dashTimer -= realDt;
        p.x += p.dashVx * realDt;
        p.y += p.dashVy * realDt;
        this.afterimages.push({ x: p.x, y: p.y, aim: p.aim, life: 0.22 });

        // Phase Afterburn upgrade drops mines
        if (stats.dashMines > 0) {
          p.dashMineTick -= realDt;
          if (p.dashMineTick <= 0) {
            p.dashMineTick = 0.055;
            this.projectiles.push({
              kind: 'mine',
              isEcho: false,
              x: p.x,
              y: p.y,
              px: p.x,
              py: p.y,
              dmg: 48 * stats.damageMult,
              armTimer: 0.15,
              life: 3.5
            });
          }
        }

        // Quantum Resonance: Dashing through an active Time Echo!
        for (let i = 0; i < this.echoes.length; i++) {
          const ec = this.echoes[i];
          if (!p.resonatedIds.has(ec.id) && CE.dist(p.x, p.y, ec.x, ec.y) <= 42) {
            p.resonatedIds.add(ec.id);
            ec.timeLeft += stats.resonanceExtend;
            ec.maxTime = Math.max(ec.maxTime, ec.timeLeft);
            this.triggerResonanceNova(ec.x, ec.y);
          }
        }
      } else {
        const targetVx = mx * stats.moveSpeed;
        const targetVy = my * stats.moveSpeed;
        p.vx = CE.lerp(p.vx, targetVx, Math.min(1, dt * 16));
        p.vy = CE.lerp(p.vy, targetVy, Math.min(1, dt * 16));
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      const pad = 28;
      p.x = CE.clamp(p.x, pad, CE.WIDTH - pad);
      p.y = CE.clamp(p.y, pad, CE.HEIGHT - pad);

      // Aiming: Auto-Aim Assist or Mouse Cursor
      if (this.settings.autoAim) {
        const nearest = this.findNearestEnemy(p.x, p.y, 900);
        if (nearest) {
          p.aim = Math.atan2(nearest.y - p.y, nearest.x - p.x);
        } else if (this.mouse.moved) {
          p.aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
        }
      } else if (this.mouse.moved) {
        p.aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
      }

      // Firing
      const wantFire = this.mouse.down || this.keys.KeyJ || gpFiring || (this.settings.autoAim && this.enemies.length > 0);
      let firedThisTick = false;
      if (wantFire && p.fireCd <= 0) {
        const w = CE.WEAPONS[p.weaponId];
        const surgeMult = this.bulletTimeTimer > 0 ? stats.grazeFireBoost : 1.0;
        p.fireCd = w.cooldown / (stats.fireRateMult * surgeMult);
        CE.fireWeapon(this, p, p.weaponId, p.aim, false);
        firedThisTick = true;
      }

      // Record 60Hz snapshot for Time Echoes & Chrono Rewind
      this.history.push({
        x: p.x,
        y: p.y,
        aim: p.aim,
        firing: wantFire || firedThisTick,
        weaponId: p.weaponId,
        dashing: p.dashTimer > 0,
        hp: p.hp
      });
      if (this.history.length > 600) {
        this.history.shift();
      }
    }

    triggerResonanceNova(x, y) {
      const r = this.stats.resonanceRadius;
      CE.Audio.echoSpawn();
      this.grid.applyImpulse(x, y, r * 1.4, 420);
      this.shockwaves.push({
        x: x,
        y: y,
        r: 12,
        maxR: r,
        color: '#67e8f9',
        alpha: 0.95,
        lineWidth: 4.5
      });
      // Vaporize enemy projectiles inside Resonance radius!
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
        if (CE.dist(x, y, this.enemyBullets[i].x, this.enemyBullets[i].y) <= r) {
          this.spawnBurst(this.enemyBullets[i].x, this.enemyBullets[i].y, '#67e8f9', 3, 80);
          this.enemyBullets.splice(i, 1);
        }
      }
      CE.explodeArea(this, x, y, r, this.stats.resonanceDmg * this.stats.damageMult, true, '#67e8f9');
      this.spawnFloatText(x, y - 28, 'QUANTUM RESONANCE!', '#67e8f9', 14);
    }

    updateEchoes(dt) {
      for (let i = this.echoes.length - 1; i >= 0; i--) {
        const ec = this.echoes[i];
        ec.timeLeft -= dt;
        if (ec.fireCd > 0) ec.fireCd -= dt;

        if (ec.timeLeft <= 0 || !ec.frames.length) {
          if (this.stats.echoDetonateDmg > 0) {
            CE.explodeArea(this, ec.x, ec.y, 165, this.stats.echoDetonateDmg * this.stats.damageMult, true, '#67e8f9');
            for (let k = 0; k < this.enemies.length; k++) {
              if (CE.dist(ec.x, ec.y, this.enemies[k].x, this.enemies[k].y) <= 165) {
                this.enemies[k].freezeTimer = Math.max(this.enemies[k].freezeTimer, 1.0);
              }
            }
          } else {
            this.spawnBurst(ec.x, ec.y, '#67e8f9', 12, 140);
          }
          this.echoes.splice(i, 1);
          continue;
        }

        const idx = Math.floor(ec.cursor) % ec.frames.length;
        const snap = ec.frames[idx];
        ec.cursor += dt * 60;

        ec.x = snap.x;
        ec.y = snap.y;
        ec.aim = snap.aim;
        ec.weaponId = snap.weaponId;

        if (snap.dashing && Math.random() < 0.4) {
          this.spawnParticle(ec.x, ec.y, 0, 0, 0.16, '#67e8f9', 3);
        }

        if (snap.firing && ec.fireCd <= 0) {
          const w = CE.WEAPONS[ec.weaponId] || CE.WEAPONS[0];
          ec.fireCd = w.cooldown / this.stats.fireRateMult;
          CE.fireWeapon(this, ec, ec.weaponId, ec.aim, true);
        }
      }
    }

    updatePickupsAndVfx(worldDt, realDt) {
      const p = this.player;

      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        pk.life -= worldDt;
        pk.vx *= 0.92;
        pk.vy *= 0.92;

        const d = CE.dist(pk.x, pk.y, p.x, p.y);
        if (d < 175) {
          const pull = (1 - d / 175) * 520;
          pk.x += ((p.x - pk.x) / Math.max(1, d)) * pull * realDt;
          pk.y += ((p.y - pk.y) / Math.max(1, d)) * pull * realDt;
        } else {
          pk.x += pk.vx * worldDt;
          pk.y += pk.vy * worldDt;
        }

        if (d < p.radius + 12) {
          CE.Audio.pickup();
          if (pk.kind === 'heal') {
            p.hp = Math.min(this.stats.maxHp, p.hp + 18);
            this.spawnFloatText(p.x, p.y - 20, '+18 HULL', '#34d399', 13);
          } else {
            p.echoEnergy = Math.min(this.stats.maxEchoCharges, p.echoEnergy + 0.16);
            this.score += Math.round(15 * this.combo);
          }
          this.pickups.splice(i, 1);
          continue;
        }
        if (pk.life <= 0) this.pickups.splice(i, 1);
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.x += pt.vx * realDt;
        pt.y += pt.vy * realDt;
        pt.vx *= 0.94;
        pt.vy *= 0.94;
        pt.life -= realDt;
        if (pt.life <= 0) this.particles.splice(i, 1);
      }

      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.r = CE.lerp(sw.r, sw.maxR, Math.min(1, realDt * 9));
        sw.alpha -= realDt * 2.2;
        if (sw.alpha <= 0) this.shockwaves.splice(i, 1);
      }

      for (let i = this.lightnings.length - 1; i >= 0; i--) {
        this.lightnings[i].life -= realDt;
        if (this.lightnings[i].life <= 0) this.lightnings.splice(i, 1);
      }

      for (let i = this.afterimages.length - 1; i >= 0; i--) {
        this.afterimages[i].life -= realDt;
        if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
      }

      for (let i = this.floatTexts.length - 1; i >= 0; i--) {
        const ft = this.floatTexts[i];
        ft.y -= 28 * realDt;
        ft.life -= realDt;
        if (ft.life <= 0) this.floatTexts.splice(i, 1);
      }
    }

    // --- RENDERING ---

    renderMenuBackdrop(ox1, oy1, ox2, oy2, orbitA) {
      const ctx = this.ctx;
      this.grid.render(ctx, 0, 0.82, 0);
      if (ox1 !== undefined) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Twin holographic demo ships orbiting behind menu
        [[ox1, oy1, orbitA + 1.4, '#67e8f9'], [ox2, oy2, orbitA + Math.PI + 1.4, '#fbbf24']].forEach((s) => {
          ctx.save();
          ctx.translate(s[0], s[1]);
          ctx.rotate(s[2]);
          ctx.strokeStyle = s[3];
          ctx.fillStyle = CE.hexToRgba(s[3], 0.25);
          ctx.lineWidth = 2;
          this.traceShipPath(ctx, 15);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
        ctx.restore();
      }
    }

    renderScene() {
      const ctx = this.ctx;
      ctx.save();

      if (this.shakeMag > 0.2) {
        const sx = (Math.random() - 0.5) * this.shakeMag * 2;
        const sy = (Math.random() - 0.5) * this.shakeMag * 2;
        ctx.translate(sx, sy);
      }

      // 1. Warping Spacetime Grid & Arena
      this.grid.render(ctx, this.sector, this.timeScale, this.rewindFlash);

      // 2. Golden Rewind Timeline Ribbon & Anchor Marker!
      this.renderTimelineRibbon(ctx);

      // 3. Pickups
      this.renderPickups(ctx);

      // 4. Shockwaves & Lightning Arcs
      this.renderShockwavesAndLightning(ctx);

      // 5. Active Time Echoes + Dash Afterimages
      this.renderEchoes(ctx);

      // 6. Enemies & Enemy Projectiles
      CE.renderEnemies(ctx, this);

      // 7. Player Ship & Orbital Shields
      if (this.player && this.state !== 'GAMEOVER') {
        this.renderPlayer(ctx);
      }

      // 8. Friendly Projectiles, Mines & Gravity Vortices
      CE.renderProjectiles(ctx, this);

      // 9. Particles & Floating Combat Text
      this.renderParticlesAndText(ctx);

      ctx.restore();

      // 10. Crisp Tactical HUD & Custom Aim Reticle (unshaken)
      this.renderHUD(ctx);
    }

    renderTimelineRibbon(ctx) {
      if (!this.player || this.history.length < 8) return;
      const backFrames = Math.min(this.history.length - 1, Math.round(this.stats.rewindWindow * 60));
      const startIdx = this.history.length - 1 - backFrames;
      const ready = this.player.rewindCd <= 0;

      ctx.save();
      ctx.strokeStyle = ready ? 'rgba(251, 191, 36, 0.34)' : 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      for (let i = startIdx; i < this.history.length; i += 3) {
        const pt = this.history[i];
        if (i === startIdx) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Rewind Anchor Diamond (exact spot [E] snaps back to!)
      const anchor = this.history[startIdx];
      if (anchor && ready) {
        ctx.translate(anchor.x, anchor.y);
        ctx.rotate(this.simTime * 2.5);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(-6, -6, 12, 12);
      }
      ctx.restore();
    }

    renderPickups(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.pickups.length; i++) {
        const pk = this.pickups[i];
        const fade = pk.life < 2 ? pk.life * 0.5 : 1;
        ctx.globalAlpha = fade;
        if (pk.kind === 'heal') {
          ctx.fillStyle = '#10b981';
          ctx.fillRect(pk.x - 6, pk.y - 2, 12, 4);
          ctx.fillRect(pk.x - 2, pk.y - 6, 4, 12);
        } else {
          ctx.fillStyle = '#67e8f9';
          ctx.beginPath();
          ctx.moveTo(pk.x, pk.y - 6);
          ctx.lineTo(pk.x + 5, pk.y);
          ctx.lineTo(pk.x, pk.y + 6);
          ctx.lineTo(pk.x - 5, pk.y);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    renderShockwavesAndLightning(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < this.shockwaves.length; i++) {
        const sw = this.shockwaves[i];
        ctx.globalAlpha = CE.clamp(sw.alpha, 0, 1);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = sw.lineWidth;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, CE.TAU);
        ctx.stroke();
      }

      for (let i = 0; i < this.lightnings.length; i++) {
        const ln = this.lightnings[i];
        ctx.globalAlpha = CE.clamp(ln.life / 0.18, 0, 1);
        ctx.strokeStyle = ln.color;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(ln.x1, ln.y1);
        const segs = 5;
        for (let s = 1; s < segs; s++) {
          const t = s / segs;
          const jx = CE.lerp(ln.x1, ln.x2, t) + (Math.random() - 0.5) * 22;
          const jy = CE.lerp(ln.y1, ln.y2, t) + (Math.random() - 0.5) * 22;
          ctx.lineTo(jx, jy);
        }
        ctx.lineTo(ln.x2, ln.y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    renderEchoes(ctx) {
      // Dash afterimages
      for (let i = 0; i < this.afterimages.length; i++) {
        const af = this.afterimages[i];
        ctx.save();
        ctx.translate(af.x, af.y);
        ctx.rotate(af.aim);
        ctx.globalAlpha = (af.life / 0.22) * 0.45;
        ctx.fillStyle = '#38bdf8';
        this.traceShipPath(ctx, 14);
        ctx.fill();
        ctx.restore();
      }

      // Holographic Time Echoes
      for (let i = 0; i < this.echoes.length; i++) {
        const ec = this.echoes[i];
        const ratio = CE.clamp(ec.timeLeft / ec.maxTime, 0, 1);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(ec.x, ec.y);

        // Lifespan progress arc
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.52)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 24, -Math.PI * 0.5, -Math.PI * 0.5 + ratio * CE.TAU);
        ctx.stroke();

        ctx.rotate(ec.aim);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.34)';
        ctx.strokeStyle = '#67e8f9';
        ctx.lineWidth = 2.2;
        this.traceShipPath(ctx, 15);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }
    }

    traceShipPath(ctx, r) {
      ctx.beginPath();
      ctx.moveTo(r * 1.25, 0);
      ctx.lineTo(-r * 0.85, r * 0.9);
      ctx.lineTo(-r * 0.42, 0);
      ctx.lineTo(-r * 0.85, -r * 0.9);
      ctx.closePath();
    }

    renderPlayer(ctx) {
      const p = this.player;
      const w = CE.WEAPONS[p.weaponId];

      ctx.save();
      ctx.translate(p.x, p.y);

      // Orbital Aegis Shields
      if (p.readyShields > 0) {
        for (let s = 0; s < p.readyShields; s++) {
          const sa = this.simTime * 3.2 + (s / p.readyShields) * CE.TAU;
          const ox = Math.cos(sa) * 28;
          const oy = Math.sin(sa) * 28;
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(ox, oy, 5, 0, CE.TAU);
          ctx.fill();
        }
      }

      if (p.invulnTimer > 0 && Math.floor(this.runTime * 22) % 2 === 0) {
        ctx.globalAlpha = 0.55;
      }

      ctx.rotate(p.aim);

      // Thruster flame
      if (Math.hypot(p.vx, p.vy) > 35 || p.dashTimer > 0) {
        ctx.fillStyle = p.dashTimer > 0 ? '#67e8f9' : w.color;
        ctx.beginPath();
        ctx.moveTo(-7, -5);
        ctx.lineTo(-18 - Math.random() * 9, 0);
        ctx.lineTo(-7, 5);
        ctx.closePath();
        ctx.fill();
      }

      // Crisp Cyber Interceptor Chassis
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      this.traceShipPath(ctx, 15);
      ctx.fill();
      ctx.stroke();

      // Weapon core accent
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.arc(2, 0, 4.2, 0, CE.TAU);
      ctx.fill();

      ctx.restore();
    }

    renderParticlesAndText(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        ctx.globalAlpha = CE.clamp(pt.life / pt.maxLife, 0, 1);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, CE.TAU);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'center';
      for (let i = 0; i < this.floatTexts.length; i++) {
        const ft = this.floatTexts[i];
        ctx.globalAlpha = CE.clamp(ft.life / ft.maxLife, 0, 1);
        ctx.font = '700 ' + ft.size + 'px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#020617';
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.restore();
    }

    renderHUD(ctx) {
      const p = this.player;
      if (!p) return;

      ctx.save();

      // --- TOP LEFT: HULL HP (WITH GOLDEN REWIND-RESTORE GHOST BAR!) + ABILITIES ---
      const hx = 28;
      const hy = 24;
      const barW = 230;
      const barH = 14;

      // Compute recoverable HP if [E] Rewind pressed right now
      let rewindHp = p.hp;
      if (p.rewindCd <= 0 && this.history.length > 12) {
        const backIdx = Math.max(0, this.history.length - 1 - Math.round(this.stats.rewindWindow * 60));
        rewindHp = Math.max(p.hp, this.history[backIdx].hp);
      }

      ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.fillRect(hx, hy, barW, barH);
      ctx.strokeRect(hx, hy, barW, barH);

      if (rewindHp > p.hp) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.55)';
        ctx.fillRect(hx + 1, hy + 1, (barW - 2) * CE.clamp(rewindHp / this.stats.maxHp, 0, 1), barH - 2);
      }

      const hpFrac = CE.clamp(p.hp / this.stats.maxHp, 0, 1);
      ctx.fillStyle = hpFrac < 0.3 ? '#f43f5e' : '#10b981';
      ctx.fillRect(hx + 1, hy + 1, (barW - 2) * hpFrac, barH - 2);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 11px "Segoe UI", system-ui, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('HULL ' + Math.ceil(p.hp) + ' / ' + this.stats.maxHp, hx + 6, hy + 11);

      // Echo Charges pips [Q / Right-Click]
      const ey = hy + 24;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px "Segoe UI", system-ui, monospace';
      ctx.fillText('ECHO [RMB/Q]', hx, ey + 10);
      for (let c = 0; c < this.stats.maxEchoCharges; c++) {
        const px = hx + 92 + c * 42;
        const fill = CE.clamp(p.echoEnergy - c, 0, 1);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(px, ey + 1, 36, 10);
        ctx.fillStyle = fill >= 1 ? '#67e8f9' : 'rgba(56, 189, 248, 0.45)';
        ctx.fillRect(px, ey + 1, 36 * fill, 10);
        ctx.strokeStyle = fill >= 1 ? '#67e8f9' : '#334155';
        ctx.strokeRect(px, ey + 1, 36, 10);
      }

      // Rewind [E] & Dash [Space] status badges
      const ry = ey + 20;
      const rewReady = p.rewindCd <= 0;
      ctx.fillStyle = rewReady ? '#fbbf24' : '#64748b';
      ctx.fillText(
        rewReady ? 'REWIND [E]: READY' : 'REWIND [E]: ' + p.rewindCd.toFixed(1) + 's',
        hx,
        ry + 10
      );

      const dashReady = p.dashCd <= 0;
      ctx.fillStyle = dashReady ? '#38bdf8' : '#64748b';
      ctx.fillText(dashReady ? 'DASH [SPACE]: READY' : 'DASH: ' + p.dashCd.toFixed(1) + 's', hx + 148, ry + 10);

      // --- TOP CENTER: SECTOR, WAVE & BOSS BAR ---
      const theme = CE.SECTOR_THEMES[this.sector % CE.SECTOR_THEMES.length];
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px "Segoe UI", system-ui, monospace';
      ctx.fillText(theme.name + '  •  WAVE ' + this.wave + (this.mode === 'campaign' ? '/10' : ''), CE.WIDTH * 0.5, 28);

      const boss = this.enemies.find((e) => e.isBoss);
      if (boss) {
        const bw = 420;
        const bx = CE.WIDTH * 0.5 - bw * 0.5;
        const by = 38;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.fillRect(bx, by, bw, 14);
        ctx.fillStyle = boss.phase === 3 ? '#f43f5e' : '#fbbf24';
        ctx.fillRect(bx + 1, by + 1, (bw - 2) * CE.clamp(boss.hp / boss.maxHp, 0, 1), 12);
        ctx.strokeStyle = '#fbbf24';
        ctx.strokeRect(bx, by, bw, 14);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 10px "Segoe UI", system-ui, monospace';
        ctx.fillText(boss.name + '  (PHASE ' + boss.phase + ')', CE.WIDTH * 0.5, by + 10.5);
      } else if (this.banner.timer > 0) {
        ctx.globalAlpha = Math.min(1, this.banner.timer * 1.5);
        ctx.fillStyle = this.banner.color;
        ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(this.banner.text, CE.WIDTH * 0.5, 52);
        ctx.globalAlpha = 1;
      }

      // --- TOP RIGHT: SCORE, COMBO, TIME & SEED ---
      const rx = CE.WIDTH - 28;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 20px "Segoe UI", system-ui, monospace';
      ctx.fillText(this.score.toLocaleString(), rx, 36);

      ctx.fillStyle = this.combo >= 2.5 ? '#e879f9' : '#38bdf8';
      ctx.font = '700 13px "Segoe UI", system-ui, monospace';
      ctx.fillText('COMBO x' + this.combo.toFixed(1), rx, 54);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px "Segoe UI", system-ui, monospace';
      ctx.fillText(this.formatTime(this.runTime) + '  |  [P] PAUSE', rx, 71);

      // --- BOTTOM CENTER: WEAPON SELECTOR BAR ---
      const barY = CE.HEIGHT - 44;
      for (let i = 0; i < CE.WEAPONS.length; i++) {
        const w = CE.WEAPONS[i];
        const wx = CE.WIDTH * 0.5 - 195 + i * 132;
        const active = p.weaponId === i;
        ctx.fillStyle = active ? 'rgba(15, 23, 42, 0.92)' : 'rgba(2, 6, 23, 0.62)';
        ctx.strokeStyle = active ? w.color : 'rgba(100, 116, 139, 0.35)';
        ctx.lineWidth = active ? 2 : 1;
        ctx.fillRect(wx, barY, 124, 28);
        ctx.strokeRect(wx, barY, 124, 28);

        ctx.textAlign = 'center';
        ctx.fillStyle = active ? w.color : '#94a3b8';
        ctx.font = (active ? '700 ' : '600 ') + '11px "Segoe UI", system-ui, monospace';
        ctx.fillText('[' + w.key + '] ' + w.name, wx + 62, barY + 18);
      }

      // --- CUSTOM TACTICAL RETICLE ---
      if (this.state === 'PLAYING' && !this.settings.autoAim) {
        const mx = this.mouse.x;
        const my = this.mouse.y;
        const w = CE.WEAPONS[p.weaponId];
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mx, my, 11, 0, CE.TAU);
        ctx.moveTo(mx - 16, my);
        ctx.lineTo(mx - 7, my);
        ctx.moveTo(mx + 7, my);
        ctx.lineTo(mx + 16, my);
        ctx.moveTo(mx, my - 16);
        ctx.lineTo(mx, my - 7);
        ctx.moveTo(mx, my + 7);
        ctx.lineTo(mx, my + 16);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    CE.game = new Game();
  });
})();
