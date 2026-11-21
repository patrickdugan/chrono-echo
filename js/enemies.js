(function () {
  'use strict';
  const CE = (window.CE = window.CE || {});

  let NEXT_UID = 1;

  CE.ENEMY_DEFS = {
    mite: {
      name: 'Swarm Mite',
      hp: 34,
      speed: 195,
      radius: 13,
      score: 60,
      color: '#f43f5e',
      mass: 0.7
    },
    mini_core: {
      name: 'Volatile Shard',
      hp: 24,
      speed: 225,
      radius: 10,
      score: 40,
      color: '#34d399',
      mass: 0.6
    },
    pylon: {
      name: 'Pulse Pylon',
      hp: 68,
      speed: 62,
      radius: 17,
      score: 120,
      color: '#fb923c',
      mass: 1.4
    },
    lancer: {
      name: 'Aegis Lancer',
      hp: 96,
      speed: 125,
      radius: 19,
      score: 175,
      color: '#38bdf8',
      hasShield: true,
      shieldHalfArc: 1.12,
      turnRate: 2.35,
      mass: 1.8
    },
    stalker: {
      name: 'Phase Stalker',
      hp: 82,
      speed: 145,
      radius: 16,
      score: 165,
      color: '#c084fc',
      mass: 1.1
    },
    splitter: {
      name: 'Splitter Core',
      hp: 125,
      speed: 105,
      radius: 21,
      score: 190,
      color: '#10b981',
      mass: 1.9
    },
    warden: {
      name: 'Chrono Warden',
      hp: 92,
      speed: 90,
      radius: 18,
      score: 210,
      color: '#eab308',
      mass: 1.3
    },
    juggernaut: {
      name: 'Bastion Juggernaut',
      hp: 290,
      speed: 72,
      radius: 28,
      score: 380,
      color: '#ef4444',
      hasShield: true,
      shieldHalfArc: 1.05,
      turnRate: 1.45,
      mass: 3.6
    },
    anchor: {
      name: 'Time Anchor',
      hp: 135,
      speed: 0,
      radius: 18,
      score: 200,
      color: '#22d3ee',
      mass: 10
    },
    chronarch: {
      name: 'THE OMEGA CHRONARCH',
      hp: 2450,
      speed: 56,
      radius: 46,
      score: 3500,
      color: '#fbbf24',
      isBoss: true,
      mass: 12
    }
  };

  CE.spawnEnemy = function (game, type, x, y, hpMult) {
    const def = CE.ENEMY_DEFS[type] || CE.ENEMY_DEFS.mite;
    const scale = hpMult || 1;
    const angleToCenter = Math.atan2(CE.HEIGHT * 0.5 - y, CE.WIDTH * 0.5 - x);

    const e = {
      uid: NEXT_UID++,
      type: type,
      name: def.name,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      hp: Math.round(def.hp * scale),
      maxHp: Math.round(def.hp * scale),
      speed: def.speed,
      radius: def.radius,
      score: def.score,
      color: def.color,
      mass: def.mass || 1,
      hasShield: !!def.hasShield,
      shieldHalfArc: def.shieldHalfArc || 0,
      turnRate: def.turnRate || 2.5,
      facing: angleToCenter,
      aggroAngle: angleToCenter,
      aggroLockTimer: 0,
      isBoss: !!def.isBoss,
      hitFlash: 0,
      shieldFlash: 0,
      freezeTimer: 0,
      spawnWarmup: type === 'mini_core' || type === 'anchor' ? 0.15 : 0.65,
      aiTimer: 0.9 + Math.random() * 1.1,
      subState: 'idle',
      subTimer: 0,
      aimAngle: angleToCenter,
      rot: Math.random() * CE.TAU,
      lastPlayerHit: -99,
      lastEchoHit: -99,
      lastCrossfireProc: -99
    };

    if (e.isBoss) {
      e.phase = 1;
      e.summonedAnchors = false;
      e.laserState = 'idle'; // 'idle' -> 'warn' -> 'fire'
      e.laserTimer = 4.5;
      e.laserAngle = Math.PI * 0.5;
      e.laserSweepDir = 1;
      e.spiralAngle = 0;
      e.volleyTimer = 1.2;
      e.minionTimer = 7.5;
      e.rings = [
        { radius: 68, angle: 0, speed: 0.95, segments: 2, arcHalf: 0.68, active: true },
        { radius: 86, angle: 1.2, speed: -0.68, segments: 2, arcHalf: 0.52, active: false }
      ];
    }

    game.enemies.push(e);
    game.spawnBurst(x, y, def.color, e.isBoss ? 32 : 10, e.isBoss ? 260 : 120);
    if (e.isBoss) {
      game.grid.applyImpulse(x, y, 320, 520);
    }
    return e;
  };

  CE.chooseTarget = function (game, e) {
    // Echoes attract nearby enemies and shielded enemies, creating true tactical decoy & flanking opportunities!
    let best = game.player;
    let bestScore = CE.dist(e.x, e.y, game.player.x, game.player.y);

    for (let i = 0; i < game.echoes.length; i++) {
      const ec = game.echoes[i];
      // Slight priority bonus to Echoes so dropping an Echo reliably pulls attention nearby
      const d = CE.dist(e.x, e.y, ec.x, ec.y) * 0.78;
      if (d < bestScore) {
        bestScore = d;
        best = ec;
      }
    }
    return best;
  };

  CE.fireEnemyBullet = function (game, x, y, angle, speed, dmg, opts) {
    const o = opts || {};
    game.enemyBullets.push({
      x: x,
      y: y,
      px: x,
      py: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: o.radius || 5.5,
      dmg: dmg,
      color: o.color || '#fb7185',
      destructible: !!o.destructible,
      homing: o.homing || 0,
      life: o.life || 5.5,
      grazed: false
    });
  };

  CE.killEnemy = function (game, e, wasCrit, wasCrossfire) {
    const idx = game.enemies.indexOf(e);
    if (idx === -1) return;
    game.enemies.splice(idx, 1);

    const mult = game.combo;
    const bonus = (wasCrit ? 1.25 : 1.0) * (wasCrossfire ? 1.35 : 1.0);
    const pts = Math.round(e.score * mult * bonus);
    game.score += pts;
    game.kills++;
    game.addCombo(e.isBoss ? 1.5 : 0.22);

    // Chrono Siphon upgrade healing & rewind shave
    if ((wasCrit || wasCrossfire) && game.stats.siphonHeal > 0) {
      game.player.hp = Math.min(game.stats.maxHp, game.player.hp + game.stats.siphonHeal);
      game.player.rewindCd = Math.max(0, game.player.rewindCd - 0.8);
    }

    // Visual & Audio explosion
    const isBig = e.isBoss || e.radius >= 21;
    CE.Audio.enemyExplode(isBig);
    game.spawnBurst(e.x, e.y, e.color, e.isBoss ? 75 : isBig ? 24 : 14, e.isBoss ? 420 : 210);
    game.grid.applyImpulse(e.x, e.y, e.isBoss ? 420 : isBig ? 170 : 105, e.isBoss ? 780 : isBig ? 310 : 160);
    game.shockwaves.push({
      x: e.x,
      y: e.y,
      r: 8,
      maxR: e.isBoss ? 340 : isBig ? 95 : 52,
      color: e.color,
      alpha: 0.85,
      lineWidth: e.isBoss ? 6 : 2.5
    });

    if (e.isBoss) {
      game.addShake(18);
      game.hitstop = 0.22;
      // Clear enemy bullets and anchors on Boss defeat!
      game.enemyBullets.length = 0;
      for (let i = game.enemies.length - 1; i >= 0; i--) {
        if (game.enemies[i].type === 'anchor') {
          game.spawnBurst(game.enemies[i].x, game.enemies[i].y, '#22d3ee', 16, 180);
          game.enemies.splice(i, 1);
        }
      }
      game.onBossDefeated();
      return;
    }

    if (isBig) {
      game.addShake(6.5);
      game.hitstop = Math.max(game.hitstop, 0.035);
    }

    // Splitter spawns 3 mini_cores
    if (e.type === 'splitter') {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * CE.TAU + Math.random() * 0.5;
        CE.spawnEnemy(
          game,
          'mini_core',
          CE.clamp(e.x + Math.cos(a) * 20, 40, CE.WIDTH - 40),
          CE.clamp(e.y + Math.sin(a) * 20, 40, CE.HEIGHT - 40),
          game.currentHpScale
        );
      }
    }

    // Drop Chrono Shards (recharge Echoes!) & occasional Hull Repair Nano-pack
    const shardCount = e.type === 'mini_core' ? 1 : isBig ? 3 : 1 + (wasCrossfire ? 1 : 0);
    for (let s = 0; s < shardCount; s++) {
      const ang = Math.random() * CE.TAU;
      const spd = 40 + Math.random() * 75;
      game.pickups.push({
        kind: 'shard',
        x: e.x,
        y: e.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 11.0
      });
    }
    if (game.player.hp < game.stats.maxHp * 0.82 && game.rng.chance(isBig ? 0.28 : 0.07)) {
      game.pickups.push({
        kind: 'heal',
        x: e.x,
        y: e.y,
        vx: 0,
        vy: 0,
        life: 14.0
      });
    }
  };

  CE.updateEnemies = function (game, dt) {
    const pad = 34;

    // Count active Time Anchors protecting the Boss
    let activeAnchors = 0;
    for (let i = 0; i < game.enemies.length; i++) {
      if (game.enemies[i].type === 'anchor') activeAnchors++;
    }

    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];
      if (!e) continue;

      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.shieldFlash > 0) e.shieldFlash -= dt;
      if (e.aggroLockTimer > 0) e.aggroLockTimer -= dt;

      if (e.spawnWarmup > 0) {
        e.spawnWarmup -= dt;
        continue;
      }

      if (e.freezeTimer > 0) {
        e.freezeTimer -= dt;
        continue;
      }

      // Check Warden haste buff
      let speedMult = 1.0;
      if (e.hastedTimer && e.hastedTimer > 0) {
        e.hastedTimer -= dt;
        speedMult = 1.32;
      }

      const target = CE.chooseTarget(game, e);
      const toTargetAngle = Math.atan2(target.y - e.y, target.x - e.x);
      const distToTarget = CE.dist(e.x, e.y, target.x, target.y);

      e.rot += dt * (e.isBoss ? 0.5 : 1.8) * speedMult;

      // --- BOSS AI: THE OMEGA CHRONARCH ---
      if (e.isBoss) {
        const hpRatio = e.hp / e.maxHp;
        if (e.phase === 1 && hpRatio <= 0.66) {
          e.phase = 2;
          e.rings[1].active = true;
          e.laserTimer = 1.6;
          CE.Audio.bossAlert();
          game.showBanner('CHRONARCH PHASE II // PENDULUM LASER & TIME ANCHORS!', '#fbbf24', 3.6);
          if (!e.summonedAnchors) {
            e.summonedAnchors = true;
            const spots = [
              [220, 170],
              [CE.WIDTH - 220, 170],
              [CE.WIDTH * 0.5, CE.HEIGHT - 145]
            ];
            spots.forEach(function (pt) {
              CE.spawnEnemy(game, 'anchor', pt[0], pt[1], game.currentHpScale);
            });
          }
        } else if (e.phase === 2 && hpRatio <= 0.33) {
          e.phase = 3;
          e.rings[0].speed = 1.35;
          e.rings[1].speed = -1.05;
          CE.Audio.bossAlert();
          game.showBanner('CHRONARCH PHASE III // PARADOX OVERDRIVE!', '#f43f5e', 3.6);
        }

        // Anchor regeneration/mitigation effect
        if (activeAnchors > 0) {
          e.hp = Math.min(e.maxHp, e.hp + activeAnchors * 6 * dt);
        }

        // Rotate shield rings
        for (let r = 0; r < e.rings.length; r++) {
          e.rings[r].angle = CE.wrapAngle(e.rings[r].angle + e.rings[r].speed * dt);
        }

        // Gentle figure-8 drift around arena center
        const cx = CE.WIDTH * 0.5 + Math.sin(game.simTime * 0.55) * 185;
        const cy = CE.HEIGHT * 0.44 + Math.sin(game.simTime * 1.1) * 75;
        e.x = CE.lerp(e.x, cx, dt * 1.1);
        e.y = CE.lerp(e.y, cy, dt * 1.1);

        // Spiral / Clock-tick Bullet Volleys
        e.volleyTimer -= dt;
        if (e.volleyTimer <= 0) {
          e.volleyTimer = e.phase === 3 ? 0.42 : e.phase === 2 ? 0.58 : 0.72;
          e.spiralAngle += 0.34;
          const arms = e.phase === 3 ? 6 : 4;
          for (let a = 0; a < arms; a++) {
            const ang = e.spiralAngle + (a / arms) * CE.TAU;
            CE.fireEnemyBullet(game, e.x + Math.cos(ang) * 44, e.y + Math.sin(ang) * 44, ang, 255 + e.phase * 22, 14, {
              color: a % 2 === 0 ? '#fb7185' : '#fbbf24',
              destructible: a % 2 === 1,
              radius: 6
            });
          }
        }

        // Sweeping Clock-Hand Laser Beam (Phase 2 & 3)
        if (e.phase >= 2) {
          e.laserTimer -= dt;
          if (e.laserState === 'idle' && e.laserTimer <= 0) {
            e.laserState = 'warn';
            e.laserTimer = 1.15; // Fair 1.15s warning sightline!
            e.laserAngle = toTargetAngle - 0.55 * e.laserSweepDir;
          } else if (e.laserState === 'warn' && e.laserTimer <= 0) {
            e.laserState = 'fire';
            e.laserTimer = 2.1;
            CE.Audio.shootSingularity(false);
          } else if (e.laserState === 'fire') {
            const sweepRate = e.phase === 3 ? 0.88 : 0.66;
            e.laserAngle = CE.wrapAngle(e.laserAngle + e.laserSweepDir * sweepRate * dt);
            const beamEndX = e.x + Math.cos(e.laserAngle) * 1400;
            const beamEndY = e.y + Math.sin(e.laserAngle) * 1400;

            // Check player hit against sweeping laser (Phase Dash invulnerability passes right through!)
            const pHit = CE.segCircleHit(e.x, e.y, beamEndX, beamEndY, game.player.x, game.player.y, game.player.radius + 5);
            if (pHit.hit) {
              game.damagePlayer(18);
            }
            if (e.laserTimer <= 0) {
              e.laserState = 'idle';
              e.laserTimer = e.phase === 3 ? 2.8 : 4.2;
              e.laserSweepDir *= -1;
            }
          }
        }

        // Summon Escort Mites periodically
        e.minionTimer -= dt;
        if (e.minionTimer <= 0 && game.enemies.length < 10) {
          e.minionTimer = e.phase === 3 ? 6.5 : 8.5;
          for (let m = 0; m < 2; m++) {
            const ma = Math.random() * CE.TAU;
            CE.spawnEnemy(
              game,
              m === 0 ? 'mite' : 'lancer',
              CE.clamp(e.x + Math.cos(ma) * 95, 60, CE.WIDTH - 60),
              CE.clamp(e.y + Math.sin(ma) * 95, 60, CE.HEIGHT - 60),
              game.currentHpScale * 0.85
            );
          }
        }
        continue;
      }

      // --- STANDARD ARCHETYPE AIs ---
      if (e.type === 'anchor') {
        continue;
      }

      if (e.type === 'mite' || e.type === 'mini_core') {
        const weave = Math.sin(game.simTime * 5 + e.uid) * 0.32;
        const moveA = toTargetAngle + weave;
        e.vx = Math.cos(moveA) * e.speed * speedMult;
        e.vy = Math.sin(moveA) * e.speed * speedMult;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      } else if (e.type === 'pylon') {
        // Orbit slowly at medium range, telegraph laser sightline, then 3-round burst
        const desiredDist = 300;
        const radial = distToTarget > desiredDist ? 1 : -0.5;
        e.x += (Math.cos(toTargetAngle) * radial - Math.sin(toTargetAngle) * 0.6) * e.speed * speedMult * dt;
        e.y += (Math.sin(toTargetAngle) * radial + Math.cos(toTargetAngle) * 0.6) * e.speed * speedMult * dt;

        e.aiTimer -= dt * speedMult;
        if (e.subState === 'idle' && e.aiTimer <= 0) {
          e.subState = 'aim';
          e.subTimer = 0.65;
          e.aimAngle = toTargetAngle;
        } else if (e.subState === 'aim') {
          e.aimAngle = CE.moveAngleTowards(e.aimAngle, toTargetAngle, 1.4 * dt);
          e.subTimer -= dt;
          if (e.subTimer <= 0) {
            for (let b = -1; b <= 1; b++) {
              CE.fireEnemyBullet(game, e.x, e.y, e.aimAngle + b * 0.14, 330, 12, { color: '#fb923c' });
            }
            e.subState = 'idle';
            e.aiTimer = 1.9 + Math.random() * 0.7;
          }
        }
      } else if (e.type === 'lancer') {
        // Shielded Front-Line Lancer: faces aggro target (Echo or Player!) and lunges periodically
        const desiredFacing = e.aggroLockTimer > 0 ? e.aggroAngle : toTargetAngle;
        e.facing = CE.moveAngleTowards(e.facing, desiredFacing, e.turnRate * speedMult * dt);

        e.aiTimer -= dt * speedMult;
        if (e.subState === 'lunge') {
          e.subTimer -= dt;
          e.x += Math.cos(e.facing) * 320 * speedMult * dt;
          e.y += Math.sin(e.facing) * 320 * speedMult * dt;
          if (e.subTimer <= 0) {
            e.subState = 'idle';
            e.aiTimer = 2.1;
          }
        } else {
          e.x += Math.cos(e.facing) * e.speed * speedMult * dt;
          e.y += Math.sin(e.facing) * e.speed * speedMult * dt;
          if (e.aiTimer <= 0 && distToTarget < 340) {
            e.subState = 'lunge';
            e.subTimer = 0.42;
            CE.fireEnemyBullet(game, e.x + Math.cos(e.facing) * 18, e.y + Math.sin(e.facing) * 18, e.facing, 360, 13, {
              color: '#38bdf8'
            });
          }
        }
      } else if (e.type === 'stalker') {
        // Blinks to flank position, then fires destructible pink orb ring
        e.aiTimer -= dt * speedMult;
        if (e.subState === 'telegraph') {
          e.subTimer -= dt;
          if (e.subTimer <= 0) {
            game.spawnBurst(e.x, e.y, '#c084fc', 8, 120);
            e.x = e.blinkX;
            e.y = e.blinkY;
            game.spawnBurst(e.x, e.y, '#e879f9', 12, 160);
            for (let k = 0; k < 6; k++) {
              const ba = toTargetAngle + (k / 6) * CE.TAU;
              CE.fireEnemyBullet(game, e.x, e.y, ba, 235, 11, {
                color: '#f472b6',
                destructible: true,
                radius: 6.5
              });
            }
            e.subState = 'idle';
            e.aiTimer = 2.5 + Math.random() * 0.7;
          }
        } else {
          e.x += Math.cos(toTargetAngle + 0.6) * e.speed * speedMult * dt;
          e.y += Math.sin(toTargetAngle + 0.6) * e.speed * speedMult * dt;
          if (e.aiTimer <= 0) {
            const sideA = Math.random() * CE.TAU;
            e.blinkX = CE.clamp(target.x + Math.cos(sideA) * 175, 65, CE.WIDTH - 65);
            e.blinkY = CE.clamp(target.y + Math.sin(sideA) * 175, 65, CE.HEIGHT - 65);
            e.subState = 'telegraph';
            e.subTimer = 0.55;
          }
        }
      } else if (e.type === 'splitter') {
        e.x += Math.cos(toTargetAngle) * e.speed * speedMult * dt;
        e.y += Math.sin(toTargetAngle) * e.speed * speedMult * dt;
        e.aiTimer -= dt * speedMult;
        if (e.aiTimer <= 0) {
          e.aiTimer = 2.3;
          CE.fireEnemyBullet(game, e.x, e.y, toTargetAngle - 0.18, 250, 12, { color: '#34d399', destructible: true });
          CE.fireEnemyBullet(game, e.x, e.y, toTargetAngle + 0.18, 250, 12, { color: '#34d399', destructible: true });
        }
      } else if (e.type === 'warden') {
        // Stays back & buffs closest non-warden ally with gold haste tether!
        const keepDist = 330;
        const dir = distToTarget < keepDist ? -0.8 : 0.7;
        e.x += Math.cos(toTargetAngle) * e.speed * dir * dt;
        e.y += Math.sin(toTargetAngle) * e.speed * dir * dt;

        let ally = null;
        let bestD = 360;
        for (let j = 0; j < game.enemies.length; j++) {
          const other = game.enemies[j];
          if (other !== e && other.type !== 'warden' && other.type !== 'anchor') {
            const d = CE.dist(e.x, e.y, other.x, other.y);
            if (d < bestD) {
              bestD = d;
              ally = other;
            }
          }
        }
        e.tetherTarget = ally;
        if (ally) {
          ally.hastedTimer = 0.25;
        }

        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiTimer = 2.4;
          CE.fireEnemyBullet(game, e.x, e.y, toTargetAngle, 220, 13, {
            color: '#facc15',
            homing: 0.75,
            destructible: true,
            radius: 7
          });
        }
      } else if (e.type === 'juggernaut') {
        const desiredFacing = e.aggroLockTimer > 0 ? e.aggroAngle : toTargetAngle;
        e.facing = CE.moveAngleTowards(e.facing, desiredFacing, e.turnRate * speedMult * dt);
        e.x += Math.cos(e.facing) * e.speed * speedMult * dt;
        e.y += Math.sin(e.facing) * e.speed * speedMult * dt;

        e.aiTimer -= dt * speedMult;
        if (e.aiTimer <= 0) {
          e.aiTimer = 2.6;
          for (let b = -2; b <= 2; b++) {
            CE.fireEnemyBullet(
              game,
              e.x + Math.cos(e.facing) * 24,
              e.y + Math.sin(e.facing) * 24,
              e.facing + b * 0.24,
              270,
              15,
              { color: '#f87171', radius: 6.5 }
            );
          }
          game.grid.applyImpulse(e.x, e.y, 140, 210);
        }
      }

      // Soft separation between enemies
      for (let j = i - 1; j >= 0; j--) {
        const o = game.enemies[j];
        if (o.type === 'anchor' || e.type === 'anchor') continue;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const minSep = e.radius + o.radius + 6;
        const dSq = dx * dx + dy * dy;
        if (dSq > 0.01 && dSq < minSep * minSep) {
          const d = Math.sqrt(dSq);
          const push = (minSep - d) * 0.45;
          const nx = dx / d;
          const ny = dy / d;
          if (!e.isBoss) {
            e.x += nx * push;
            e.y += ny * push;
          }
          if (!o.isBoss) {
            o.x -= nx * push;
            o.y -= ny * push;
          }
        }
      }

      e.x = CE.clamp(e.x, pad, CE.WIDTH - pad);
      e.y = CE.clamp(e.y, pad, CE.HEIGHT - pad);

      // Contact damage with Player
      if (CE.distSq(e.x, e.y, game.player.x, game.player.y) <= (e.radius + game.player.radius - 2) * (e.radius + game.player.radius - 2)) {
        game.damagePlayer(e.isBoss ? 22 : 14);
      }
    }

    // --- UPDATE ENEMY BULLETS + GRAZE MECHANIC ---
    const p = game.player;
    for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
      const b = game.enemyBullets[i];
      b.px = b.x;
      b.py = b.y;

      if (b.homing > 0) {
        const curA = Math.atan2(b.vy, b.vx);
        const wantA = Math.atan2(p.y - b.y, p.x - b.x);
        const spd = Math.hypot(b.vx, b.vy);
        const nextA = CE.moveAngleTowards(curA, wantA, b.homing * dt);
        b.vx = Math.cos(nextA) * spd;
        b.vy = Math.sin(nextA) * spd;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0 || b.x < 16 || b.x > CE.WIDTH - 16 || b.y < 16 || b.y > CE.HEIGHT - 16) {
        game.enemyBullets.splice(i, 1);
        continue;
      }

      // Check Orbital Aegis Shields blocking enemy bullets!
      if (p.readyShields > 0 && CE.distSq(b.x, b.y, p.x, p.y) <= 34 * 34) {
        p.readyShields--;
        p.shieldRegenTimer = 5.0;
        CE.Audio.hitEnemy(false, false, true);
        game.spawnBurst(b.x, b.y, '#38bdf8', 10, 150);
        game.spawnFloatText(p.x, p.y - 26, 'AEGIS BLOCK!', '#38bdf8', 12);
        game.enemyBullets.splice(i, 1);
        continue;
      }

      const dToP = CE.dist(b.x, b.y, p.x, p.y);
      const hitDist = b.radius + p.radius - 2;

      if (dToP <= hitDist) {
        if (p.dashTimer > 0 || p.invulnTimer > 0) {
          // Dashing through a bullet counts as a high-skill PHASE GRAZE!
          if (!b.grazed) {
            b.grazed = true;
            game.onBulletGraze(b.x, b.y, true);
          }
        } else {
          game.damagePlayer(b.dmg);
          game.enemyBullets.splice(i, 1);
          continue;
        }
      } else if (!b.grazed && dToP <= hitDist + 24) {
        b.grazed = true;
        game.onBulletGraze(b.x, b.y, p.dashTimer > 0);
      }
    }
  };

  CE.renderEnemies = function (ctx, game) {
    // 1. Tethers (Warden -> Ally, Anchor -> Boss)
    const boss = game.enemies.find(function (x) { return x.isBoss; });
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (e.type === 'warden' && e.tetherTarget && e.tetherTarget.hp > 0) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.48)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.tetherTarget.x, e.tetherTarget.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (e.type === 'anchor' && boss) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(boss.x, boss.y);
        ctx.stroke();
      }
    }

    // 2. Enemy Bodies, Telegraphs & Shields
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      const warmupAlpha = e.spawnWarmup > 0 ? 0.35 + 0.35 * Math.sin(game.simTime * 28) : 1.0;

      ctx.save();
      ctx.globalAlpha = warmupAlpha;

      // Telegraph lines (Pylon laser sight, Stalker blink line, Boss Clock-Hand Beam)
      if (e.type === 'pylon' && e.subState === 'aim') {
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(e.aimAngle) * 520, e.y + Math.sin(e.aimAngle) * 520);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (e.type === 'stalker' && e.subState === 'telegraph') {
        ctx.strokeStyle = 'rgba(232, 121, 249, 0.65)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.blinkX, e.blinkY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(e.blinkX, e.blinkY, 15, 0, CE.TAU);
        ctx.stroke();
      } else if (e.isBoss && e.laserState !== 'idle') {
        const lx = e.x + Math.cos(e.laserAngle) * 1400;
        const ly = e.y + Math.sin(e.laserAngle) * 1400;
        if (e.laserState === 'warn') {
          ctx.strokeStyle = 'rgba(251, 191, 36, ' + (0.4 + 0.35 * Math.sin(game.simTime * 24)) + ')';
          ctx.lineWidth = 3;
          ctx.setLineDash([12, 8]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(lx, ly);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
          ctx.lineWidth = 22;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(lx, ly);
          ctx.stroke();
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(lx, ly);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw Boss Concentric Shield Rings
      if (e.isBoss && e.rings) {
        for (let r = 0; r < e.rings.length; r++) {
          const ring = e.rings[r];
          if (!ring.active) continue;
          ctx.strokeStyle = e.shieldFlash > 0 ? '#ffffff' : '#38bdf8';
          ctx.lineWidth = 6;
          for (let s = 0; s < ring.segments; s++) {
            const cAng = ring.angle + (s / ring.segments) * CE.TAU;
            ctx.beginPath();
            ctx.arc(e.x, e.y, ring.radius, cAng - ring.arcHalf, cAng + ring.arcHalf);
            ctx.stroke();
          }
        }
      }

      // Draw Directional Front Energy Shield + Rear Weakpoint Glow!
      if (e.hasShield) {
        const sRad = e.radius + 8;
        ctx.strokeStyle = e.shieldFlash > 0 ? '#ffffff' : '#38bdf8';
        ctx.lineWidth = e.shieldFlash > 0 ? 6.5 : 4.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, sRad, e.facing - e.shieldHalfArc, e.facing + e.shieldHalfArc);
        ctx.stroke();

        // Exposed Backstab Arc cue (subtle amber dashed indicator so flanking is intuitive!)
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, sRad - 2, e.facing + Math.PI - 0.75, e.facing + Math.PI + 0.75);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Main Geometric Body
      ctx.translate(e.x, e.y);
      const bodyCol = e.hitFlash > 0 ? '#ffffff' : e.freezeTimer > 0 ? '#67e8f9' : e.color;
      ctx.fillStyle = CE.hexToRgba(e.color, 0.24);
      ctx.strokeStyle = bodyCol;
      ctx.lineWidth = 2.5;

      if (e.isBoss) {
        // Multi-layered Clockwork Astrolabe Core
        ctx.rotate(e.rot);
        ctx.beginPath();
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * CE.TAU;
          const rad = k % 2 === 0 ? e.radius : e.radius * 0.76;
          if (k === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner Chrono Heart
        ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#f43f5e';
        ctx.beginPath();
        ctx.arc(0, 0, 17 + Math.sin(game.simTime * 8) * 2.5, 0, CE.TAU);
        ctx.fill();
      } else if (e.hasShield) {
        ctx.rotate(e.facing);
        ctx.beginPath();
        ctx.moveTo(e.radius, 0);
        ctx.lineTo(-e.radius * 0.75, e.radius * 0.82);
        ctx.lineTo(-e.radius * 0.35, 0);
        ctx.lineTo(-e.radius * 0.75, -e.radius * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.rotate(e.rot);
        const sides = e.type === 'mite' || e.type === 'mini_core' ? 4 : e.type === 'stalker' ? 3 : 6;
        ctx.beginPath();
        for (let s = 0; s < sides; s++) {
          const a = (s / sides) * CE.TAU;
          const rad = e.type === 'stalker' && s % 2 === 1 ? e.radius * 0.5 : e.radius;
          if (s === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Freeze crystal overlay
      if (e.freezeTimer > 0) {
        ctx.strokeStyle = '#a5f3fc';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(-e.radius * 0.7, -e.radius * 0.7, e.radius * 1.4, e.radius * 1.4);
      }

      ctx.restore();

      // Compact HP bar above damaged non-boss enemies
      if (!e.isBoss && e.hp < e.maxHp) {
        const bw = e.radius * 2.1;
        const bx = e.x - bw * 0.5;
        const by = e.y - e.radius - 11;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.fillRect(bx, by, bw, 4);
        ctx.fillStyle = e.color;
        ctx.fillRect(bx, by, bw * CE.clamp(e.hp / e.maxHp, 0, 1), 4);
      }
    }

    // 3. Render Enemy Bullets
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < game.enemyBullets.length; i++) {
      const b = game.enemyBullets[i];
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 2.2, 0, CE.TAU);
      ctx.fill();

      ctx.fillStyle = b.destructible ? '#fdf4ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.55, 0, CE.TAU);
      ctx.fill();
    }
    ctx.restore();
  };
})();
