(function () {
  'use strict';
  const CE = (window.CE = window.CE || {});

  CE.TAU = Math.PI * 2;
  CE.WIDTH = 1280;
  CE.HEIGHT = 760;

  CE.clamp = function (v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  };

  CE.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  CE.smoothstep = function (a, b, t) {
    const x = CE.clamp((t - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  };

  CE.distSq = function (x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  };

  CE.dist = function (x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  };

  CE.wrapAngle = function (a) {
    a = a % CE.TAU;
    if (a > Math.PI) a -= CE.TAU;
    if (a < -Math.PI) a += CE.TAU;
    return a;
  };

  CE.angleDiff = function (from, to) {
    return CE.wrapAngle(to - from);
  };

  CE.moveAngleTowards = function (cur, target, maxStep) {
    const d = CE.angleDiff(cur, target);
    if (Math.abs(d) <= maxStep) return target;
    return CE.wrapAngle(cur + Math.sign(d) * maxStep);
  };

  // Exact line segment vs circle collision; returns { hit, x, y, t }
  CE.segCircleHit = function (x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-6) {
      t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
      t = CE.clamp(t, 0, 1);
    }
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const dSq = (cx - px) * (cx - px) + (cy - py) * (cy - py);
    return {
      hit: dSq <= r * r,
      x: px,
      y: py,
      t: t
    };
  };

  // Seeded Mulberry32 PRNG for deterministic Daily & Seeded runs
  CE.hashString = function (str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  CE.createRNG = function (seedInput) {
    let state = typeof seedInput === 'number'
      ? (seedInput >>> 0)
      : CE.hashString(seedInput || String(Date.now()));
    if (state === 0) state = 0x9e3779b9;

    function next() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    return {
      next: next,
      range: function (min, max) {
        return min + (max - min) * next();
      },
      int: function (min, max) {
        return Math.floor(min + (max - min + 1) * next());
      },
      chance: function (p) {
        return next() < p;
      },
      pick: function (arr) {
        if (!arr || !arr.length) return undefined;
        return arr[Math.floor(next() * arr.length)];
      },
      shuffle: function (arr) {
        const copy = arr.slice();
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const tmp = copy[i];
          copy[i] = copy[j];
          copy[j] = tmp;
        }
        return copy;
      }
    };
  };

  CE.hexToRgba = function (hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  };
})();
