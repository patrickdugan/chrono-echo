(function () {
  'use strict';
  const CE = (window.CE = window.CE || {});

  CE.WEAPONS = [
    {
      id: 0,
      key: '1',
      name: 'PULSE RAIL',
      short: 'RAIL',
      color: '#38bdf8',
      echoColor: '#67e8f9',
      cooldown: 0.155,
      speed: 1160,
      damage: 23,
      desc: 'High-velocity precision lance. Pierces on Crit.'
    },
    {
      id: 1,
      key: '2',
      name: 'SCATTER PRISM',
      short: 'PRISM',
      color: '#fbbf24',
      echoColor: '#fde68a',
      cooldown: 0.39,
      speed: 860,
      damage: 12.5,
      pellets: 6,
      spread: 0.44,
      desc: '6-shard spread burst. Cancels pink orbs at close range.'
    },
    {
      id: 2,
      key: '3',
      name: 'GRAVITON ORB',
      short: 'VORTEX',
      color: '#c084fc',
      echoColor: '#e879f9',
      cooldown: 0.88,
      speed: 430,
      damage: 16,
      implodeDamage: 82,
      desc: 'Deploys a gravity vortex that clusters enemies for Crossfire.'
    }
  ];

  CE.fireWeapon = function (game, shooter, weaponId, angle, isEcho) {
    const w = CE.WEAPONS[weaponId] || CE.WEAPONS[0];
    const stats = game.stats;
    const baseMult = stats.damageMult * (isEcho ? stats.echoDamageMult : 1.0);

    shooter.shotCounter = (shooter.shotCounter || 0) + 1;
    const doSplit = stats.splitEvery > 0 && shooter.shotCounter % stats.splitEvery === 0;

    const spawnBolt = function (ang, dmgScale, speedScale) {
      const spd = w.speed * (speedScale || 1);
      const muzzleDist = 18;
      const sx = shooter.x + Math.cos(ang) * muzzleDist;
      const sy = shooter.y + Math.sin(ang) * muzzleDist;

      if (weaponId === 2) {
        game.projectiles.push({
          kind: 'orb',
          isEcho: isEcho,
          ownerId: shooter.id || 'player',
          x: sx,
          y: sy,
          px: sx,
          py: sy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: 10,
          dmg: w.damage * baseMult * (dmgScale || 1),
          implodeDmg: w.implodeDamage * baseMult * (dmgScale || 1),
          travelTime: 0.62,
          vortexTime: 2.15,
          tickTimer: 0,
          boltTimer: 0.35,
          state: 'travel',
          color: isEcho ? w.echoColor : w.color
        });
      } else {
        game.projectiles.push({
          kind: weaponId === 0 ? 'rail' : 'shard',
          isEcho: isEcho,
          ownerId: shooter.id || 'player',
          x: sx,
          y: sy,
          px: sx,
          py: sy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: weaponId === 0 ? 5 : 4.5,
          dmg: w.damage * baseMult * (dmgScale || 1),
          life: weaponId === 0 ? 1.15 : 0.62,
          pierce: stats.bonusPierce,
          bounces: stats.bounces,
          hitIds: new Set(),
          color: isEcho ? w.echoColor : w.color
        });
      }
    };

    if (weaponId === 1) {
      const n = w.pellets;
      for (let i = 0; i < n; i++) {
        const frac = (i / (n - 1)) - 0.5;
        const jitter = (Math.random() - 0.5) * 0.04;
        spawnBolt(angle + frac * w.spread + jitter, 1.0, 0.92 + Math.random() * 0.16);
      }
      if (doSplit) {
        spawnBolt(angle - 0.32, 0.85, 1.0);
        spawnBolt(angle + 0.32, 0.85, 1.0);
      }
      CE.Audio.shootScatter(isEcho);
    } else if (weaponId === 2) {
      spawnBolt(angle, 1.0, 1.0);
      if (doSplit) {
        spawnBolt(angle - 0.25, 0.55, 1.05);
        spawnBolt(angle + 0.25, 0.55, 1.05);
      }
      CE.Audio.shootSingularity(isEcho);
    } else {
      spawnBolt(angle, 1.0, 1.0);
      if (doSplit) {
        spawnBolt(angle - 0.16, 0.78, 1.0);
        spawnBolt(angle + 0.16, 0.78, 1.0);
      }
      CE.Audio.shootRail(isEcho);
    }

    // Muzzle flash particles
    const mColor = isEcho ? '#67e8f9' : w.color;
    for (let i = 0; i < (isEcho ? 3 : 5); i++) {
      const sp = 90 + Math.random() * 140;
      const a = angle + (Math.random() - 0.5) * 0.6;
      game.spawnParticle(
        shooter.x + Math.cos(angle) * 18,
        shooter.y + Math.sin(angle) * 18,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        0.16 + Math.random() * 0.1,
        mColor,
        2.6
      );
    }
  };

  CE.updateProjectiles = function (game, dt) {
    const pad = 20;
    const minX = pad;
    const maxX = CE.WIDTH - pad;
    const minY = pad;
    const maxY = CE.HEIGHT - pad;
    const stats = game.stats;

    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const p = game.projectiles[i];
      p.px = p.x;
      p.py = p.y;

      if (p.kind === 'mine') {
        p.armTimer -= dt;
        p.life -= dt;
        let triggered = p.life <= 0;
        if (p.armTimer <= 0 && !triggered) {
          for (let eIdx = 0; eIdx < game.enemies.length; eIdx++) {
            const e = game.enemies[eIdx];
            if (CE.distSq(p.x, p.y, e.x, e.y) <= (e.radius + 38) * (e.radius + 38)) {
              triggered = true;
              break;
            }
          }
        }
        if (triggered) {
          CE.explodeArea(game, p.x, p.y, 88, p.dmg, p.isEcho, '#38bdf8');
          game.projectiles.splice(i, 1);
        }
        continue;
      }

      if (p.kind === 'orb') {
        if (p.state === 'travel') {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.travelTime -= dt;
          game.grid.applyImplosion(p.x, p.y, 95, 110 * dt * 60 * 0.02);

          let hitSolid = p.x <= minX + 10 || p.x >= maxX - 10 || p.y <= minY + 10 || p.y >= maxY - 10;
          if (!hitSolid) {
            for (let eIdx = 0; eIdx < game.enemies.length; eIdx++) {
              const e = game.enemies[eIdx];
              if (CE.distSq(p.x, p.y, e.x, e.y) <= (e.radius + p.radius + 4) * (e.radius + p.radius + 4)) {
                hitSolid = true;
                break;
              }
            }
          }
          if (hitSolid || p.travelTime <= 0) {
            p.x = CE.clamp(p.x, minX + 24, maxX - 24);
            p.y = CE.clamp(p.y, minY + 24, maxY - 24);
            p.state = 'vortex';
          }
        } else {
          // Active Gravity Vortex!
          p.vortexTime -= dt;
          p.tickTimer -= dt;
          const pullR = 175 * stats.singularityRadiusMult;

          game.grid.applyImplosion(p.x, p.y, pullR * 1.1, 18);
          game.grid.applyVortex(p.x, p.y, pullR * 0.9, 14);

          // Pull enemies inward
          for (let eIdx = 0; eIdx < game.enemies.length; eIdx++) {
            const e = game.enemies[eIdx];
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const d = Math.hypot(dx, dy);
            if (d < pullR && d > 6) {
              const resist = e.isBoss ? 0.16 : e.mass ? 1 / e.mass : 1.0;
              const pullStrength = (240 * (1 - d / pullR * 0.55)) * resist;
              e.x += (dx / d) * pullStrength * dt;
              e.y += (dy / d) * pullStrength * dt;
            }
          }

          if (p.tickTimer <= 0) {
            p.tickTimer = 0.28;
            for (let eIdx = game.enemies.length - 1; eIdx >= 0; eIdx--) {
              const e = game.enemies[eIdx];
              if (CE.dist(p.x, p.y, e.x, e.y) <= pullR * 0.78 + e.radius) {
                CE.damageEnemy(game, e, p.dmg, p.isEcho, Math.atan2(e.y - p.y, e.x - p.x), true);
              }
            }
          }

          // Event Horizon upgrade fires mini-bolts at nearest enemy
          if (stats.singularityBolts > 0) {
            p.boltTimer -= dt;
            if (p.boltTimer <= 0) {
              p.boltTimer = 0.42;
              const target = game.findNearestEnemy(p.x, p.y, pullR * 1.5);
              if (target) {
                const ba = Math.atan2(target.y - p.y, target.x - p.x);
                game.projectiles.push({
                  kind: 'rail',
                  isEcho: p.isEcho,
                  ownerId: p.ownerId,
                  x: p.x,
                  y: p.y,
                  px: p.x,
                  py: p.y,
                  vx: Math.cos(ba) * 820,
                  vy: Math.sin(ba) * 820,
                  radius: 4,
                  dmg: p.dmg * 0.9,
                  life: 0.45,
                  pierce: 0,
                  bounces: 0,
                  hitIds: new Set(),
                  color: '#e879f9'
                });
              }
            }
          }

          if (p.vortexTime <= 0) {
            // Final Implosion!
            CE.Audio.singularityImplode();
            CE.explodeArea(game, p.x, p.y, 125 * stats.singularityRadiusMult, p.implodeDmg, p.isEcho, '#c084fc');
            game.projectiles.splice(i, 1);
          }
        }
        continue;
      }

      // Standard kinetic/rail/shard projectile
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      // Scatter shards can shatter soft destructible pink enemy orbs!
      if (p.kind === 'shard') {
        for (let bIdx = game.enemyBullets.length - 1; bIdx >= 0; bIdx--) {
          const eb = game.enemyBullets[bIdx];
          if (eb.destructible && CE.distSq(p.x, p.y, eb.x, eb.y) <= (p.radius + eb.radius + 4) * (p.radius + eb.radius + 4)) {
            game.enemyBullets.splice(bIdx, 1);
            game.spawnBurst(eb.x, eb.y, '#fbbf24', 5, 110);
            p.life = 0;
            break;
          }
        }
        if (p.life <= 0) {
          game.projectiles.splice(i, 1);
          continue;
        }
      }

      // Wall bounce or expire
      let bouncedWall = false;
      if (p.x <= minX || p.x >= maxX) {
        if (p.bounces > 0) {
          p.bounces--;
          p.vx = -p.vx * 1.1;
          p.x = CE.clamp(p.x, minX + 1, maxX - 1);
          p.hitIds.clear();
          bouncedWall = true;
        } else {
          p.life = 0;
        }
      }
      if (p.y <= minY || p.y >= maxY) {
        if (p.bounces > 0) {
          p.bounces--;
          p.vy = -p.vy * 1.1;
          p.y = CE.clamp(p.y, minY + 1, maxY - 1);
          p.hitIds.clear();
          bouncedWall = true;
        } else {
          p.life = 0;
        }
      }
      if (bouncedWall) {
        game.spawnBurst(p.x, p.y, p.color, 4, 90);
      }

      if (p.life <= 0) {
        game.spawnBurst(p.x, p.y, p.color, 3, 70);
        game.projectiles.splice(i, 1);
        continue;
      }

      // Swept segment collision against enemies & Boss Time Anchors
      let consumed = false;
      for (let eIdx = game.enemies.length - 1; eIdx >= 0; eIdx--) {
        const e = game.enemies[eIdx];
        if (p.hitIds.has(e.uid)) continue;

        const seg = CE.segCircleHit(p.px, p.py, p.x, p.y, e.x, e.y, e.radius + p.radius);
        if (seg.hit) {
          p.hitIds.add(e.uid);
          const shotAngle = Math.atan2(p.vy, p.vx);
          const outcome = CE.damageEnemy(game, e, p.dmg, p.isEcho, shotAngle, false);

          if (outcome.shieldBlocked) {
            if (p.bounces > 0) {
              p.bounces--;
              const nx = Math.cos(outcome.reflectAngle);
              const ny = Math.sin(outcome.reflectAngle);
              const spd = Math.hypot(p.vx, p.vy) * 1.1;
              p.vx = nx * spd;
              p.vy = ny * spd;
              p.x = seg.x + nx * 6;
              p.y = seg.y + ny * 6;
              p.hitIds.clear();
            } else {
              consumed = true;
            }
          } else {
            // Crit on Pulse Rail grants +1 free pierce!
            const freePierce = (p.kind === 'rail' && outcome.crit) ? 1 : 0;
            if (p.pierce + freePierce > 0) {
              if (!freePierce) p.pierce--;
            } else {
              consumed = true;
            }
          }
          if (consumed) break;
        }
      }

      if (consumed) {
        game.projectiles.splice(i, 1);
      }
    }
  };

  CE.explodeArea = function (game, x, y, radius, dmg, isEcho, color) {
    game.grid.applyImpulse(x, y, radius * 1.35, 380);
    game.addShake(7);
    game.shockwaves.push({
      x: x,
      y: y,
      r: 10,
      maxR: radius,
      color: color || '#c084fc',
      alpha: 0.9,
      lineWidth: 4
    });
    game.spawnBurst(x, y, color || '#c084fc', 20, 260);

    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];
      const d = CE.dist(x, y, e.x, e.y);
      if (d <= radius + e.radius) {
        const falloff = CE.clamp(1.15 - (d / (radius + e.radius)) * 0.45, 0.55, 1.0);
        CE.damageEnemy(game, e, dmg * falloff, isEcho, Math.atan2(e.y - y, e.x - x), true);
      }
    }
  };

  // Central combat damage resolver: Directional Shields, Backstab Crits, Crossfire Overload & Chain Lightning!
  CE.damageEnemy = function (game, e, rawDmg, isEcho, shotAngle, bypassShield) {
    const stats = game.stats;
    let dmg = rawDmg;
    let crit = false;
    let crossfire = false;
    let shieldBlocked = false;
    let reflectAngle = shotAngle + Math.PI;

    // 1. Boss Rotating Concentric Shield Rings check!
    if (!bypassShield && e.isBoss && e.rings) {
      const incomingFrom = Math.atan2(-Math.sin(shotAngle), -Math.cos(shotAngle));
      for (let rIdx = 0; rIdx < e.rings.length; rIdx++) {
        const ring = e.rings[rIdx];
        if (!ring.active) continue;
        // Check if incoming angle hits any solid arc segment on this ring
        for (let s = 0; s < ring.segments; s++) {
          const segCenter = ring.angle + (s / ring.segments) * CE.TAU;
          if (Math.abs(CE.angleDiff(segCenter, incomingFrom)) < ring.arcHalf) {
            shieldBlocked = true;
            reflectAngle = incomingFrom;
            break;
          }
        }
        if (shieldBlocked) break;
      }
    }

    // 2. Directional Front Shield check (Aegis Lancer & Bastion Juggernaut)
    if (!bypassShield && !shieldBlocked && e.hasShield) {
      // Shot comes from direction `shotAngle + PI` relative to enemy center
      const hitDir = CE.wrapAngle(shotAngle + Math.PI);
      const diff = Math.abs(CE.angleDiff(e.facing, hitDir));
      if (diff <= e.shieldHalfArc) {
        shieldBlocked = true;
        reflectAngle = e.facing + (Math.random() - 0.5) * 0.4;
      } else if (diff >= Math.PI * 0.56) {
        // Flanking / Rear hit!
        crit = true;
      }
    }

    // Aggro reaction: enemy turns subtly toward high-threat attacker
    if (!e.isBoss && e.hasShield) {
      const threatDir = CE.wrapAngle(shotAngle + Math.PI);
      // Echoes pull aggro strongly so player can flank!
      if (isEcho) {
        e.aggroAngle = threatDir;
        e.aggroLockTimer = 1.25;
      } else if ((e.aggroLockTimer || 0) <= 0) {
        e.aggroAngle = threatDir;
      }
    }

    if (shieldBlocked) {
      dmg *= 0.14;
      e.hp -= dmg;
      e.shieldFlash = 0.18;
      CE.Audio.hitEnemy(false, false, true);
      const sx = e.x + Math.cos(reflectAngle) * (e.radius + 4);
      const sy = e.y + Math.sin(reflectAngle) * (e.radius + 4);
      game.spawnBurst(sx, sy, '#38bdf8', 5, 130);
      if (game.wave <= 2 && !game.coachShownShield) {
        game.coachShownShield = true;
        game.showBanner('FRONT SHIELD BLOCKED! Right-Click [Q] to drop an Echo & flank behind!', '#38bdf8', 3.8);
      }
      if (e.hp <= 0) {
        CE.killEnemy(game, e, false, false);
      }
      return { shieldBlocked: true, reflectAngle: reflectAngle, crit: false, crossfire: false };
    }

    // 3. Backstab / Weakpoint Crit
    if (crit) {
      dmg *= stats.critMult;
    }

    // 4. Crossfire Overload! (Player + Echo hitting same target within crossfireWindow)
    const now = game.simTime;
    if (isEcho) {
      e.lastEchoHit = now;
      if (now - (e.lastPlayerHit || -99) <= stats.crossfireWindow) {
        crossfire = true;
      }
    } else {
      e.lastPlayerHit = now;
      if (now - (e.lastEchoHit || -99) <= stats.crossfireWindow) {
        crossfire = true;
      }
    }

    if (crossfire && now - (e.lastCrossfireProc || -99) >= 0.22) {
      e.lastCrossfireProc = now;
      dmg *= stats.crossfireMult;
      game.crossfireCount++;
      game.addCombo(0.18);
      game.grid.applyImpulse(e.x, e.y, 110, 140);

      // Visual lightning arc to active echo or player
      const partner = isEcho ? game.player : (game.echoes[0] || game.player);
      if (partner) {
        game.lightnings.push({
          x1: e.x,
          y1: e.y,
          x2: partner.x,
          y2: partner.y,
          color: '#67e8f9',
          life: 0.16
        });
      }

      // Crossfire Matrix Chain Lightning
      if (stats.chainCount > 0) {
        const nearby = game.findNearestEnemies(e.x, e.y, 230, stats.chainCount, e.uid);
        nearby.forEach(function (ne) {
          ne.hp -= dmg * 0.42;
          ne.hitFlash = 0.12;
          game.lightnings.push({
            x1: e.x,
            y1: e.y,
            x2: ne.x,
            y2: ne.y,
            color: '#e879f9',
            life: 0.20
          });
          if (ne.hp <= 0) {
            CE.killEnemy(game, ne, false, true);
          }
        });
      }
    } else {
      crossfire = false;
    }

    e.hp -= dmg;
    e.hitFlash = 0.11;
    CE.Audio.hitEnemy(crit, crossfire, false);
    game.spawnBurst(e.x, e.y, crossfire ? '#e879f9' : crit ? '#fbbf24' : '#f8fafc', crit || crossfire ? 8 : 4, 140);

    // Floating combat text on meaningful hits
    if (crossfire || crit || dmg >= 42) {
      const label = crossfire && crit
        ? 'PARADOX CRIT ' + Math.round(dmg) + '!'
        : crossfire
          ? 'CROSSFIRE ' + Math.round(dmg)
          : crit
            ? 'BACKSTAB ' + Math.round(dmg) + '!'
            : String(Math.round(dmg));
      const col = crossfire ? '#e879f9' : crit ? '#fbbf24' : '#e2e8f0';
      game.spawnFloatText(e.x, e.y - e.radius - 6, label, col, crossfire || crit ? 15 : 12);
    }

    if (e.hp <= 0) {
      CE.killEnemy(game, e, crit, crossfire);
    }

    return { shieldBlocked: false, reflectAngle: reflectAngle, crit: crit, crossfire: crossfire };
  };

  CE.renderProjectiles = function (ctx, game) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < game.projectiles.length; i++) {
      const p = game.projectiles[i];
      if (p.kind === 'mine') {
        const pulse = 0.7 + 0.3 * Math.sin(game.simTime * 14);
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9 * pulse, 0, CE.TAU);
        ctx.fill();
        ctx.stroke();
        continue;
      }

      if (p.kind === 'orb') {
        const pullR = p.state === 'vortex' ? 175 * game.stats.singularityRadiusMult : 36;
        if (p.state === 'vortex') {
          const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, pullR * 0.85);
          grad.addColorStop(0, 'rgba(232, 121, 249, 0.55)');
          grad.addColorStop(0.35, 'rgba(168, 85, 247, 0.20)');
          grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, pullR * 0.85, 0, CE.TAU);
          ctx.fill();

          // Swirling accretion arcs
          ctx.strokeStyle = 'rgba(232, 121, 249, 0.55)';
          ctx.lineWidth = 1.8;
          for (let a = 0; a < 3; a++) {
            const baseA = game.simTime * 5.5 + (a * CE.TAU) / 3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 26 + a * 16, baseA, baseA + 1.5);
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7.5, 0, CE.TAU);
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, CE.TAU);
        ctx.stroke();
        continue;
      }

      // Rail or Shard
      const ang = Math.atan2(p.vy, p.vx);
      const tailLen = p.kind === 'rail' ? 28 : 14;
      const tx = p.x - Math.cos(ang) * tailLen;
      const ty = p.y - Math.sin(ang) * tailLen;

      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.kind === 'rail' ? 4.2 : 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(ang) * (tailLen * 0.45), p.y - Math.sin(ang) * (tailLen * 0.45));
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    ctx.restore();
  };
})();
