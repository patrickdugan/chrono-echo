(function () {
  'use strict';
  const CE = (window.CE = window.CE || {});

  CE.SECTOR_THEMES = [
    {
      name: 'SECTOR I // NEON FOUNDRY',
      bgInner: '#091124',
      bgOuter: '#030611',
      gridBase: [56, 189, 248],
      gridWarp: [34, 211, 238],
      ringColor: 'rgba(56, 189, 248, 0.08)',
      borderColor: '#0ea5e9'
    },
    {
      name: 'SECTOR II // PRISM VAULT',
      bgInner: '#140c29',
      bgOuter: '#050312',
      gridBase: [168, 85, 247],
      gridWarp: [244, 114, 182],
      ringColor: 'rgba(192, 132, 252, 0.09)',
      borderColor: '#a855f7'
    },
    {
      name: 'SECTOR III // GRAVITY WELL',
      bgInner: '#081d22',
      bgOuter: '#030a0f',
      gridBase: [16, 185, 129],
      gridWarp: [45, 212, 191],
      ringColor: 'rgba(52, 211, 153, 0.08)',
      borderColor: '#10b981'
    },
    {
      name: 'SECTOR IV // PARADOX ENGINE',
      bgInner: '#21130b',
      bgOuter: '#0b0504',
      gridBase: [245, 158, 11],
      gridWarp: [251, 191, 36],
      ringColor: 'rgba(251, 191, 36, 0.09)',
      borderColor: '#f59e0b'
    },
    {
      name: 'SECTOR V // CHRONARCH SANCTUM',
      bgInner: '#230916',
      bgOuter: '#090308',
      gridBase: [244, 63, 94],
      gridWarp: [251, 191, 36],
      ringColor: 'rgba(244, 63, 94, 0.11)',
      borderColor: '#f43f5e'
    }
  ];

  class SpacetimeGrid {
    constructor(width, height, cols, rows) {
      this.width = width;
      this.height = height;
      this.cols = cols || 35;
      this.rows = rows || 21;
      this.count = this.cols * this.rows;

      this.restX = new Float32Array(this.count);
      this.restY = new Float32Array(this.count);
      this.px = new Float32Array(this.count);
      this.py = new Float32Array(this.count);
      this.vx = new Float32Array(this.count);
      this.vy = new Float32Array(this.count);
      this.pinned = new Uint8Array(this.count);

      this.clockAngle = 0;
      this.reset();
    }

    reset() {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const i = r * this.cols + c;
          const x = (c / (this.cols - 1)) * this.width;
          const y = (r / (this.rows - 1)) * this.height;
          this.restX[i] = x;
          this.restY[i] = y;
          this.px[i] = x;
          this.py[i] = y;
          this.vx[i] = 0;
          this.vy[i] = 0;
          this.pinned[i] = (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) ? 1 : 0;
        }
      }
    }

    applyImpulse(x, y, radius, force) {
      const rSq = radius * radius;
      for (let i = 0; i < this.count; i++) {
        if (this.pinned[i]) continue;
        const dx = this.px[i] - x;
        const dy = this.py[i] - y;
        const dSq = dx * dx + dy * dy;
        if (dSq < rSq && dSq > 1) {
          const d = Math.sqrt(dSq);
          const falloff = 1 - d / radius;
          const strength = (force * falloff * falloff) / d;
          this.vx[i] += dx * strength;
          this.vy[i] += dy * strength;
        }
      }
    }

    applyImplosion(x, y, radius, force) {
      const rSq = radius * radius;
      for (let i = 0; i < this.count; i++) {
        if (this.pinned[i]) continue;
        const dx = x - this.px[i];
        const dy = y - this.py[i];
        const dSq = dx * dx + dy * dy;
        if (dSq < rSq && dSq > 16) {
          const d = Math.sqrt(dSq);
          const falloff = 1 - d / radius;
          const strength = (force * falloff) / d;
          this.vx[i] += dx * strength;
          this.vy[i] += dy * strength;
        }
      }
    }

    applyVortex(x, y, radius, torque) {
      const rSq = radius * radius;
      for (let i = 0; i < this.count; i++) {
        if (this.pinned[i]) continue;
        const dx = this.px[i] - x;
        const dy = this.py[i] - y;
        const dSq = dx * dx + dy * dy;
        if (dSq < rSq && dSq > 9) {
          const d = Math.sqrt(dSq);
          const falloff = 1 - d / radius;
          const s = (torque * falloff) / d;
          this.vx[i] += -dy * s;
          this.vy[i] += dx * s;
        }
      }
    }

    update(dt) {
      const step = Math.min(dt, 0.033);
      this.clockAngle += step * 0.14;
      const springK = 34.0;
      const neighborK = 8.5;
      const damp = Math.pow(0.035, step);
      const cols = this.cols;
      const rows = this.rows;

      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          const i = r * cols + c;
          // Anchor spring back to rest lattice
          let ax = (this.restX[i] - this.px[i]) * springK;
          let ay = (this.restY[i] - this.py[i]) * springK;

          // Neighbor coupling so waves propagate across the arena
          const avgX = 0.25 * (this.px[i - 1] + this.px[i + 1] + this.px[i - cols] + this.px[i + cols]);
          const avgY = 0.25 * (this.py[i - 1] + this.py[i + 1] + this.py[i - cols] + this.py[i + cols]);
          ax += (avgX - this.px[i]) * neighborK;
          ay += (avgY - this.py[i]) * neighborK;

          this.vx[i] = (this.vx[i] + ax * step) * damp;
          this.vy[i] = (this.vy[i] + ay * step) * damp;
        }
      }

      for (let i = 0; i < this.count; i++) {
        if (this.pinned[i]) continue;
        this.px[i] += this.vx[i] * step;
        this.py[i] += this.vy[i] * step;
        // Clamp extreme displacement so mesh stays readable
        const dx = this.px[i] - this.restX[i];
        const dy = this.py[i] - this.restY[i];
        const maxD = 48;
        if (dx * dx + dy * dy > maxD * maxD) {
          const s = maxD / Math.hypot(dx, dy);
          this.px[i] = this.restX[i] + dx * s;
          this.py[i] = this.restY[i] + dy * s;
        }
      }
    }

    render(ctx, sectorIdx, timeScale, rewindFlash) {
      const theme = CE.SECTOR_THEMES[sectorIdx % CE.SECTOR_THEMES.length];
      const cx = this.width * 0.5;
      const cy = this.height * 0.5;

      // 1. Deep space radial gradient
      const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, this.width * 0.7);
      grad.addColorStop(0, theme.bgInner);
      grad.addColorStop(1, theme.bgOuter);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);

      // 2. Background Celestial Clockwork Astrolabe
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = theme.ringColor;
      ctx.lineWidth = 1.5;

      // Outer dial with 12 hour markers
      ctx.save();
      ctx.rotate(this.clockAngle);
      ctx.beginPath();
      ctx.arc(0, 0, 295, 0, CE.TAU);
      ctx.stroke();
      for (let h = 0; h < 24; h++) {
        const a = (h / 24) * CE.TAU;
        const inner = h % 2 === 0 ? 272 : 283;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * 295, Math.sin(a) * 295);
        ctx.stroke();
      }
      ctx.restore();

      // Counter-rotating inner gear ring
      ctx.save();
      ctx.rotate(-this.clockAngle * 1.7);
      ctx.setLineDash([18, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, 175, 0, CE.TAU);
      ctx.stroke();
      ctx.restore();
      ctx.restore();

      // 3. Base subtle lattice pass (batched single path for fast rendering)
      const cols = this.cols;
      const rows = this.rows;
      const gb = theme.gridBase;
      const baseAlpha = timeScale < 0.85 ? 0.20 : 0.11;
      ctx.strokeStyle = 'rgba(' + gb[0] + ',' + gb[1] + ',' + gb[2] + ',' + baseAlpha + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        const rowOff = r * cols;
        ctx.moveTo(this.px[rowOff], this.py[rowOff]);
        for (let c = 1; c < cols; c++) {
          ctx.lineTo(this.px[rowOff + c], this.py[rowOff + c]);
        }
      }
      for (let c = 0; c < cols; c++) {
        ctx.moveTo(this.px[c], this.py[c]);
        for (let r = 1; r < rows; r++) {
          ctx.lineTo(this.px[r * cols + c], this.py[r * cols + c]);
        }
      }
      ctx.stroke();

      // 4. Energized displaced segments (glow brightly where warped!)
      const gw = theme.gridWarp;
      ctx.lineWidth = 1.6;
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          const i = r * cols + c;
          const dx = this.px[i] - this.restX[i];
          const dy = this.py[i] - this.restY[i];
          const dispSq = dx * dx + dy * dy;
          if (dispSq > 10) {
            const alpha = CE.clamp((Math.sqrt(dispSq) - 3) / 26, 0.08, 0.72);
            ctx.strokeStyle = 'rgba(' + gw[0] + ',' + gw[1] + ',' + gw[2] + ',' + alpha.toFixed(2) + ')';
            ctx.beginPath();
            ctx.moveTo(this.px[i - 1], this.py[i - 1]);
            ctx.lineTo(this.px[i], this.py[i]);
            ctx.lineTo(this.px[i + 1], this.py[i + 1]);
            ctx.moveTo(this.px[i - cols], this.py[i - cols]);
            ctx.lineTo(this.px[i], this.py[i]);
            ctx.lineTo(this.px[i + cols], this.py[i + cols]);
            ctx.stroke();
          }
        }
      }

      // 5. Rewind / Bullet-Time vignette tint
      if (timeScale < 0.9 || rewindFlash > 0.01) {
        const strength = Math.max((0.9 - timeScale) * 0.35, rewindFlash * 0.28);
        const vGrad = ctx.createRadialGradient(cx, cy, this.height * 0.28, cx, cy, this.width * 0.65);
        vGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        vGrad.addColorStop(1, 'rgba(34, 211, 238, ' + CE.clamp(strength, 0, 0.35) + ')');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, this.width, this.height);
      }

      // 6. Arena Perimeter Frame
      const pad = 18;
      ctx.strokeStyle = theme.borderColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      ctx.strokeRect(pad, pad, this.width - pad * 2, this.height - pad * 2);
      ctx.globalAlpha = 1;
    }
  }

  CE.SpacetimeGrid = SpacetimeGrid;
})();
