(function () {
  'use strict';
  const CE = (window.CE = window.CE || {});

  CE.createBaseStats = function () {
    return {
      maxHp: 100,
      moveSpeed: 315,
      fireRateMult: 1.0,
      damageMult: 1.0,
      echoDamageMult: 0.85,
      maxEchoCharges: 2,
      echoRechargeRate: 0.135,
      echoDuration: 5.0,
      echoDetonateDmg: 0,
      rewindCooldown: 9.5,
      rewindWindow: 2.6,
      rewindFreezeRadius: 240,
      rewindFreezeDur: 1.25,
      dashCooldown: 1.30,
      dashMines: 0,
      critMult: 2.4,
      bonusPierce: 0,
      bounces: 0,
      crossfireWindow: 0.95,
      crossfireMult: 1.65,
      chainCount: 0,
      siphonHeal: 0,
      grazeSlowDur: 0.55,
      grazeFireBoost: 1.15,
      singularityRadiusMult: 1.0,
      singularityBolts: 0,
      orbitalShields: 0,
      splitEvery: 0,
      resonanceRadius: 155,
      resonanceDmg: 65,
      resonanceExtend: 0.75
    };
  };

  CE.RARITY_COLORS = {
    COMMON: '#38bdf8',
    RARE: '#c084fc',
    MYTHIC: '#fbbf24'
  };

  CE.UPGRADES = [
    {
      id: 'temporal_twin',
      name: 'Temporal Twin',
      rarity: 'MYTHIC',
      icon: 'II',
      maxStacks: 2,
      desc: '+1 Max Echo Charge and +30% Echo recharge speed.',
      apply: function (s) {
        s.maxEchoCharges += 1;
        s.echoRechargeRate *= 1.30;
      }
    },
    {
      id: 'extended_memory',
      name: 'Extended Memory',
      rarity: 'RARE',
      icon: '>>',
      maxStacks: 3,
      desc: 'Time Echoes replay +2.0s longer and deal +25% weapon damage.',
      apply: function (s) {
        s.echoDuration += 2.0;
        s.echoDamageMult += 0.25;
      }
    },
    {
      id: 'crossfire_matrix',
      name: 'Crossfire Matrix',
      rarity: 'RARE',
      icon: 'X+',
      maxStacks: 3,
      desc: 'Crossfire Overload chains lightning to +2 nearby foes and deals +25% bonus burst.',
      apply: function (s) {
        s.chainCount += 2;
        s.crossfireMult += 0.25;
        s.crossfireWindow += 0.35;
      }
    },
    {
      id: 'backstab_optics',
      name: 'Backstab Optics',
      rarity: 'COMMON',
      icon: '<>',
      maxStacks: 3,
      desc: 'Flanking attacks deal +50% Crit Damage and all shots pierce +1 target.',
      apply: function (s) {
        s.critMult += 0.50;
        s.bonusPierce += 1;
      }
    },
    {
      id: 'chrono_siphon',
      name: 'Chrono Siphon',
      rarity: 'RARE',
      icon: '+V',
      maxStacks: 3,
      desc: 'Crit or Crossfire kills restore +4 Hull HP and shave 0.8s off Chrono Rewind.',
      apply: function (s) {
        s.siphonHeal += 4;
      }
    },
    {
      id: 'phase_afterburn',
      name: 'Phase Afterburn',
      rarity: 'COMMON',
      icon: '** ',
      maxStacks: 3,
      desc: 'Phase Dash drops 3 volatile plasma mines (48 DMG) and recharges 18% faster.',
      apply: function (s) {
        s.dashMines += 3;
        s.dashCooldown *= 0.82;
      }
    },
    {
      id: 'bullet_time_graze',
      name: 'Bullet-Time Surge',
      rarity: 'RARE',
      icon: '0.5',
      maxStacks: 2,
      desc: 'Grazing enemy fire slows spacetime for +1.0s and grants +35% Overclocked Fire Rate.',
      apply: function (s) {
        s.grazeSlowDur += 1.0;
        s.grazeFireBoost += 0.35;
      }
    },
    {
      id: 'ricochet_geometry',
      name: 'Ricochet Geometry',
      rarity: 'COMMON',
      icon: '/\\',
      maxStacks: 3,
      desc: 'Pulse Rail & Scatter shards ricochet +1 time off walls & armor shields (+15% DMG).',
      apply: function (s) {
        s.bounces += 1;
        s.damageMult += 0.12;
      }
    },
    {
      id: 'event_horizon',
      name: 'Event Horizon',
      rarity: 'MYTHIC',
      icon: '(@)',
      maxStacks: 2,
      desc: 'Graviton Orbs pull 45% wider, fire arc bolts while active, and implode harder.',
      apply: function (s) {
        s.singularityRadiusMult += 0.45;
        s.singularityBolts += 1;
      }
    },
    {
      id: 'paradox_detonation',
      name: 'Paradox Finale',
      rarity: 'RARE',
      icon: '(!)',
      maxStacks: 3,
      desc: 'Echoes detonate in a 165px Temporal Nova (95 DMG + Stun) when their replay finishes.',
      apply: function (s) {
        s.echoDetonateDmg += 95;
      }
    },
    {
      id: 'overclock_cap',
      name: 'Overclocked Drive',
      rarity: 'COMMON',
      icon: '^^',
      maxStacks: 4,
      desc: '+20% Attack Speed and +12% Thruster Move Speed.',
      apply: function (s) {
        s.fireRateMult += 0.20;
        s.moveSpeed += 36;
      }
    },
    {
      id: 'aegis_hull',
      name: 'Aegis Chrono-Plating',
      rarity: 'COMMON',
      icon: '[+]',
      maxStacks: 3,
      desc: '+35 Max Hull HP, heal 35 HP now, and gain +1 recharging Orbital Projectile Shield.',
      apply: function (s, game) {
        s.maxHp += 35;
        s.orbitalShields += 1;
        if (game && game.player) {
          game.player.hp = Math.min(s.maxHp, game.player.hp + 35);
        }
      }
    },
    {
      id: 'prismatic_split',
      name: 'Prismatic Bifurcation',
      rarity: 'MYTHIC',
      icon: 'Y*',
      maxStacks: 2,
      desc: 'Every 3rd attack (yours AND your Echoes!) fires twin extra angled projectiles.',
      apply: function (s) {
        s.splitEvery = s.splitEvery === 0 ? 3 : Math.max(2, s.splitEvery - 1);
      }
    },
    {
      id: 'rewind_shockwave',
      name: 'Grand Rewind Freeze',
      rarity: 'RARE',
      icon: '<<',
      maxStacks: 2,
      desc: 'Chrono Rewind [E] freezes ALL enemies arena-wide for +0.8s and cools down 2.2s faster.',
      apply: function (s) {
        s.rewindFreezeRadius = 1500;
        s.rewindFreezeDur += 0.8;
        s.rewindCooldown = Math.max(4.0, s.rewindCooldown - 2.2);
      }
    },
    {
      id: 'quantum_resonance',
      name: 'Quantum Resonance',
      rarity: 'COMMON',
      icon: '<*>',
      maxStacks: 3,
      desc: 'Dashing through an active Echo unleashes a +75 DMG bullet-clearing Nova & adds +1.8s to Echo.',
      apply: function (s) {
        s.resonanceDmg += 75;
        s.resonanceRadius += 55;
        s.resonanceExtend += 1.8;
      }
    }
  ];

  CE.rollUpgrades = function (rng, ownedCounts, count) {
    const pool = CE.UPGRADES.filter(function (u) {
      return (ownedCounts[u.id] || 0) < u.maxStacks;
    });
    const weighted = [];
    pool.forEach(function (u) {
      const w = u.rarity === 'MYTHIC' ? 2 : u.rarity === 'RARE' ? 4 : 6;
      for (let i = 0; i < w; i++) weighted.push(u);
    });

    const chosen = [];
    let guard = 0;
    while (chosen.length < count && chosen.length < pool.length && guard < 120) {
      guard++;
      const pick = rng.pick(weighted);
      if (pick && chosen.indexOf(pick) === -1) {
        chosen.push(pick);
      }
    }
    return chosen;
  };
})();
