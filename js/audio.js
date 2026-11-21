(function () {
  'use strict';
  const CE = (window.CE = window.CE || {});

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.timeFilter = null;
      this.sfxGain = null;
      this.musicGain = null;
      this.delayNode = null;
      this.noiseBuf = null;

      this.musicEnabled = true;
      this.sfxEnabled = true;
      this.intensity = 0; // 0: menu, 1: wave, 2: high combo, 3: boss
      this.sectorIndex = 0;
      this.bpm = 126;
      this.stepIndex = 0;
      this.nextNoteTime = 0;
      this.schedulerId = null;
      this.lastSfxTimes = {};
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(function () {});
        }
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      try {
        this.ctx = new AudioCtx();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 18;
        comp.ratio.value = 6;
        comp.attack.value = 0.004;
        comp.release.value = 0.16;
        comp.connect(this.ctx.destination);

        this.master = this.ctx.createGain();
        this.master.gain.value = 0.78;
        this.master.connect(comp);

        this.timeFilter = this.ctx.createBiquadFilter();
        this.timeFilter.type = 'lowpass';
        this.timeFilter.frequency.value = 19500;
        this.timeFilter.Q.value = 0.8;
        this.timeFilter.connect(this.master);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxEnabled ? 0.85 : 0;
        this.sfxGain.connect(this.timeFilter);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicEnabled ? 0.36 : 0;
        this.musicGain.connect(this.timeFilter);

        // Spacey feedback delay bus for echoes & synth leads
        this.delayNode = this.ctx.createDelay(1.0);
        this.delayNode.delayTime.value = 0.238; // dotted 16th feel
        const fb = this.ctx.createGain();
        fb.gain.value = 0.32;
        const dFilter = this.ctx.createBiquadFilter();
        dFilter.type = 'bandpass';
        dFilter.frequency.value = 1500;
        dFilter.Q.value = 0.9;

        this.delayNode.connect(dFilter);
        dFilter.connect(fb);
        fb.connect(this.delayNode);
        dFilter.connect(this.timeFilter);

        // White noise buffer for snares, explosions, dashes
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * 1.2);
        this.noiseBuf = this.ctx.createBuffer(1, length, sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        this.nextNoteTime = this.ctx.currentTime + 0.06;
        this.startSequencer();
      } catch (e) {
        this.ctx = null;
      }
    }

    canPlay(key, minGapSec) {
      if (!this.ctx || !this.sfxEnabled) return false;
      const now = this.ctx.currentTime;
      const prev = this.lastSfxTimes[key] || 0;
      if (now - prev < minGapSec) return false;
      this.lastSfxTimes[key] = now;
      return true;
    }

    setMusicEnabled(on) {
      this.musicEnabled = !!on;
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setTargetAtTime(this.musicEnabled ? 0.36 : 0, this.ctx.currentTime, 0.04);
      }
    }

    setSfxEnabled(on) {
      this.sfxEnabled = !!on;
      if (this.sfxGain && this.ctx) {
        this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? 0.85 : 0, this.ctx.currentTime, 0.03);
      }
    }

    setTimeWarp(timeScale) {
      if (!this.timeFilter || !this.ctx) return;
      const targetFreq = timeScale < 0.85
        ? CE.clamp(450 + timeScale * 2400, 420, 4500)
        : 19500;
      this.timeFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
    }

    setState(intensity, sectorIndex) {
      this.intensity = intensity;
      this.sectorIndex = sectorIndex || 0;
      this.bpm = intensity >= 3 ? 136 : intensity >= 2 ? 130 : 124;
    }

    // --- PROCEDURAL SFX ---

    tone(type, fStart, fEnd, dur, vol, sendDelay, detune) {
      if (!this.ctx || !this.sfxEnabled) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(24, fStart), t);
      if (fEnd && fEnd !== fStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(24, fEnd), t + dur);
      }
      if (detune) osc.detune.value = detune;

      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(g);
      g.connect(this.sfxGain);
      if (sendDelay && this.delayNode) {
        const dg = this.ctx.createGain();
        dg.gain.value = sendDelay;
        g.connect(dg);
        dg.connect(this.delayNode);
      }
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    noise(dur, vol, filterType, fStart, fEnd, q) {
      if (!this.ctx || !this.sfxEnabled || !this.noiseBuf) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = filterType || 'bandpass';
      flt.frequency.setValueAtTime(fStart || 1200, t);
      if (fEnd) {
        flt.frequency.exponentialRampToValueAtTime(Math.max(60, fEnd), t + dur);
      }
      flt.Q.value = q || 1.2;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      src.connect(flt);
      flt.connect(g);
      g.connect(this.sfxGain);
      src.start(t);
      src.stop(t + dur + 0.02);
    }

    shootRail(isEcho) {
      if (!this.canPlay(isEcho ? 'eRail' : 'pRail', 0.045)) return;
      if (isEcho) {
        this.tone('triangle', 1240, 340, 0.09, 0.11, 0.35, 12);
      } else {
        this.tone('sawtooth', 980, 210, 0.11, 0.17, 0.12, 0);
        this.tone('sine', 1650, 480, 0.07, 0.12, 0, 0);
      }
    }

    shootScatter(isEcho) {
      if (!this.canPlay(isEcho ? 'eScat' : 'pScat', 0.07)) return;
      const v = isEcho ? 0.10 : 0.19;
      this.noise(0.11, v, 'bandpass', 2400, 580, 1.4);
      this.tone('triangle', isEcho ? 780 : 620, 130, 0.12, v * 0.9, isEcho ? 0.3 : 0.1);
    }

    shootSingularity(isEcho) {
      if (!this.canPlay('sing', 0.1)) return;
      const v = isEcho ? 0.14 : 0.24;
      this.tone('sine', 260, 58, 0.32, v, 0.35);
      this.tone('sawtooth', 520, 115, 0.24, v * 0.45, 0.25);
    }

    singularityImplode() {
      if (!this.canPlay('implode', 0.09)) return;
      this.tone('sine', 150, 34, 0.42, 0.38, 0.25);
      this.tone('triangle', 680, 120, 0.26, 0.22, 0.4);
      this.noise(0.28, 0.24, 'lowpass', 1400, 180, 2.2);
    }

    dash(grazed) {
      if (!this.canPlay('dash', 0.08)) return;
      this.noise(0.14, 0.20, 'bandpass', 700, 3200, 1.8);
      this.tone('sine', 320, grazed ? 1320 : 840, 0.14, 0.16, 0.25);
    }

    echoSpawn() {
      this.init();
      if (!this.canPlay('echo', 0.08)) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, idx) => {
        setTimeout(() => {
          this.tone('triangle', f, f * 1.01, 0.22, 0.15, 0.48);
        }, idx * 32);
      });
    }

    rewind() {
      if (!this.canPlay('rewind', 0.15)) return;
      this.noise(0.34, 0.24, 'bandpass', 400, 4200, 2.5);
      this.tone('sawtooth', 190, 960, 0.30, 0.20, 0.5);
      this.tone('sine', 440, 1760, 0.32, 0.22, 0.45);
    }

    hitEnemy(crit, crossfire, shielded) {
      if (shielded) {
        if (!this.canPlay('shieldHit', 0.04)) return;
        this.tone('square', 920, 460, 0.07, 0.11, 0.15);
        return;
      }
      if (crossfire) {
        if (!this.canPlay('xfire', 0.045)) return;
        this.tone('triangle', 880, 1320, 0.13, 0.20, 0.35);
        this.tone('sawtooth', 440, 660, 0.11, 0.14, 0.25);
        return;
      }
      if (crit) {
        if (!this.canPlay('crit', 0.04)) return;
        this.tone('sawtooth', 620, 980, 0.09, 0.17, 0.2);
        this.noise(0.06, 0.12, 'highpass', 1800, 900, 1.0);
        return;
      }
      if (!this.canPlay('hit', 0.03)) return;
      this.tone('triangle', 340, 170, 0.055, 0.12, 0);
    }

    enemyExplode(big) {
      if (!this.canPlay(big ? 'expBig' : 'expSm', big ? 0.07 : 0.04)) return;
      if (big) {
        this.tone('sine', 140, 32, 0.42, 0.36, 0.2);
        this.noise(0.36, 0.30, 'lowpass', 1600, 140, 1.5);
      } else {
        this.tone('sine', 190, 46, 0.18, 0.22, 0);
        this.noise(0.16, 0.18, 'lowpass', 2100, 240, 1.2);
      }
    }

    playerHit() {
      if (!this.canPlay('pHit', 0.1)) return;
      this.tone('sawtooth', 180, 48, 0.28, 0.34, 0.15);
      this.noise(0.24, 0.28, 'bandpass', 900, 180, 1.4);
    }

    graze() {
      if (!this.canPlay('graze', 0.06)) return;
      this.tone('sine', 1480, 2120, 0.06, 0.09, 0.2);
    }

    pickup() {
      if (!this.canPlay('pick', 0.04)) return;
      this.tone('sine', 740, 1180, 0.075, 0.09, 0.2);
    }

    upgradePick() {
      const chord = [440, 554.37, 659.25, 880];
      chord.forEach((f, i) => {
        setTimeout(() => this.tone('triangle', f, f * 1.005, 0.3, 0.16, 0.4), i * 45);
      });
    }

    bossAlert() {
      [146.83, 138.59, 130.81].forEach((f, i) => {
        setTimeout(() => {
          this.tone('sawtooth', f, f * 0.96, 0.45, 0.26, 0.35);
          this.tone('sine', f * 0.5, f * 0.48, 0.48, 0.28, 0);
        }, i * 320);
      });
    }

    victory() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => {
        setTimeout(() => this.tone('triangle', f, f, 0.42, 0.18, 0.45), i * 85);
      });
    }

    // --- ADAPTIVE CYBER-CLOCKWORK SEQUENCER ---

    midiToFreq(m) {
      return 440 * Math.pow(2, (m - 69) / 12);
    }

    startSequencer() {
      if (this.schedulerId) clearInterval(this.schedulerId);
      this.schedulerId = setInterval(() => this.scheduleSteps(), 40);
    }

    scheduleSteps() {
      if (!this.ctx || !this.musicEnabled) return;
      if (this.ctx.state !== 'running') return;

      const lookahead = 0.12;
      while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
        this.playStep(this.stepIndex, this.nextNoteTime);
        const stepDur = (60 / this.bpm) * 0.25; // 16th note
        this.nextNoteTime += stepDur;
        this.stepIndex = (this.stepIndex + 1) % 64;
      }
    }

    playStep(step, t) {
      const sub = step % 16;
      const bar = Math.floor(step / 16);
      // Root shift by sector (Dm, Em, Fm, F#m, Gm)
      const sectorShift = [0, 2, 3, 4, 5][this.sectorIndex % 5];
      const roots = [38, 34, 31, 33]; // D2, Bb1, G1, A1
      const root = roots[bar] + sectorShift;

      // Subtle mechanical clockwork tick-tock on 8th notes
      if (sub % 2 === 0) {
        const isTick = sub % 4 === 0;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isTick ? 2450 : 1820, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.018);
        g.gain.setValueAtTime(this.intensity === 0 ? 0.05 : 0.035, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(t);
        osc.stop(t + 0.025);
      }

      // Warm minor pad on bar start
      if (sub === 0) {
        const padNotes = [root + 24, root + 27, root + 31];
        const barDur = (60 / this.bpm) * 3.8;
        padNotes.forEach((m) => {
          const osc = this.ctx.createOscillator();
          const flt = this.ctx.createBiquadFilter();
          const g = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(this.midiToFreq(m), t);
          flt.type = 'lowpass';
          flt.frequency.setValueAtTime(this.intensity === 0 ? 680 : 950, t);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.055, t + 0.25);
          g.gain.exponentialRampToValueAtTime(0.0001, t + barDur);
          osc.connect(flt);
          flt.connect(g);
          g.connect(this.musicGain);
          osc.start(t);
          osc.stop(t + barDur + 0.05);
        });
      }

      if (this.intensity <= 0) return;

      // Four-on-the-floor punchy synth kick (plus syncopation in boss mode)
      if (sub % 4 === 0 || (this.intensity >= 3 && sub === 14)) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(138, t);
        osc.frequency.exponentialRampToValueAtTime(36, t + 0.13);
        g.gain.setValueAtTime(0.42, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(t);
        osc.stop(t + 0.16);
      }

      // Snare on 4 & 12 when intensity >= 1
      if ((sub === 4 || sub === 12) && this.noiseBuf) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'bandpass';
        flt.frequency.setValueAtTime(1650, t);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(this.intensity >= 2 ? 0.22 : 0.13, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        src.connect(flt);
        flt.connect(g);
        g.connect(this.musicGain);
        src.start(t);
        src.stop(t + 0.12);
      }

      // Rolling 16th darksynth bassline
      if (sub % 4 !== 0) {
        const oct = (sub === 2 || sub === 6 || sub === 10 || sub === 14) ? 12 : 0;
        const osc = this.ctx.createOscillator();
        const flt = this.ctx.createBiquadFilter();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(this.midiToFreq(root + oct), t);
        flt.type = 'lowpass';
        const cutoff = this.intensity >= 3 ? 1350 : this.intensity >= 2 ? 980 : 680;
        flt.frequency.setValueAtTime(cutoff, t);
        flt.frequency.exponentialRampToValueAtTime(190, t + 0.10);
        flt.Q.value = 3.2;
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        osc.connect(flt);
        flt.connect(g);
        g.connect(this.musicGain);
        osc.start(t);
        osc.stop(t + 0.12);
      }

      // Cyber arpeggiator at intensity >= 2
      if (this.intensity >= 2 && (sub % 2 === 1 || this.intensity >= 3)) {
        const scale = [0, 3, 7, 10, 12, 15, 19, 15];
        const note = root + 24 + scale[(step + bar * 3) % scale.length];
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(this.midiToFreq(note), t);
        g.gain.setValueAtTime(0.085, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        osc.connect(g);
        g.connect(this.musicGain);
        if (this.delayNode) {
          const dg = this.ctx.createGain();
          dg.gain.value = 0.25;
          g.connect(dg);
          dg.connect(this.delayNode);
        }
        osc.start(t);
        osc.stop(t + 0.12);
      }
    }
  }

  CE.Audio = new SoundEngine();
})();
