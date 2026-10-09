// Authoritative deathmatch. Runs on the Node server and, for offline practice, in the browser.
// A connection is any object with send(obj) (and optionally sendRaw(string) and close()).
import {
  TICK_RATE, MAX_HUMANS, BOT_FILL, MATCH_SECONDS, END_SCREEN_SECONDS, RESPAWN_SECONDS,
  SPAWN_PROTECT_SECONDS, MAX_REWIND, OUTFITS, BOT_NAMES, PLAYER_RADIUS, eyeHeight, bodyHeight, PROTOCOL,
} from './constants.js';
import { WEAPONS, PRIMARIES, SIDEARM, KNIFE, computeDamage, fireInterval, knifeDamage } from './weapons.js';
import { SPAWNS, MAP_HALF } from './map.js';
import { rayWorld, rayPlayer, lineOfSight } from './raycast.js';
import { collides, createBody } from './physics.js';
import { rng } from './rng.js';
import { createBrain, updateBot } from './bots.js';

const MAX_MOVE_SPEED = 9; // generous ceiling for movement checks (fastest run is 6.35 m/s)
const CHAT_MAX = 120;
const VOTE_SECONDS = 20;
const VOTE_COOLDOWN = 30;

function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export class Game {
  constructor({ now, log } = {}) {
    this.now = now || (() => performance.now() / 1000);
    this.log = log || (() => {});
    this.players = new Map();
    this.nextId = 1;
    this.rand = rng(Date.now() & 0xffffffff);
    this.state = 'live';
    this.endsAt = this.now() + MATCH_SECONDS;
    this.lastStats = 0;
    this.timer = null;
    this.botNames = [...BOT_NAMES];
    this.botsEnabled = true;
    this.vote = null; // { kind, by, yes: Set, no: Set, endsAt }
  }

  start() {
    if (this.timer) return;
    let last = this.now();
    this.timer = setInterval(() => {
      const t = this.now();
      const dt = Math.min(0.1, t - last);
      last = t;
      this.update(dt);
    }, 1000 / TICK_RATE);
    this.balanceBots();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  humans() {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  // ---------------------------------------------------------------- connections

  /** Register a connection; returns { message(obj), close() } for the transport to call. */
  connect(conn) {
    const state = { player: null, msgs: 0, windowStart: this.now() };
    return {
      message: (msg) => {
        const t = this.now();
        if (t - state.windowStart > 1) {
          state.windowStart = t;
          state.msgs = 0;
        }
        if (++state.msgs > 150) return; // flood guard
        try {
          this.handle(conn, state, msg);
        } catch (err) {
          this.log('bad message', err?.message);
        }
      },
      close: () => {
        if (state.player) this.removePlayer(state.player.id);
      },
    };
  }

  handle(conn, state, msg) {
    if (!msg || typeof msg !== 'object') return;
    const p = state.player;
    if (msg.t === 'join') {
      if (p) return;
      if (this.humans() >= MAX_HUMANS) {
        conn.send({ t: 'full' });
        conn.close?.();
        return;
      }
      state.player = this.addHuman(conn, msg);
      return;
    }
    if (msg.t === 'ping') {
      conn.send({ t: 'pong', c: msg.c, s: this.now() });
      if (p && Number.isFinite(msg.rtt)) p.ping = Math.round(Math.min(999, Math.max(0, msg.rtt * 1000)));
      return;
    }
    if (!p) return;
    switch (msg.t) {
      case 'in':
        return this.onInput(p, msg);
      case 'fire':
        return this.onFire(p, msg);
      case 'melee':
        return this.onMelee(p, msg);
      case 'reload':
        return this.startReload(p);
      case 'loadout':
        return this.onLoadout(p, msg.primary);
      case 'chat':
        return this.onChat(p, msg.text);
      case 'callvote':
        return this.callVote(p, msg.kind);
      case 'vote':
        return this.castVote(p, !!msg.yes);
      default:
    }
  }

  // ---------------------------------------------------------------- players

  makePlayer(fields) {
    const p = {
      id: this.nextId++,
      name: 'Player',
      outfit: 0,
      bot: false,
      conn: null,
      body: createBody(0, 0),
      yaw: 0,
      pitch: 0,
      weapon: 'ak47',
      primary: 'ak47',
      nextPrimary: 'ak47',
      alive: false,
      hp: 100,
      respawnAt: 0,
      spawnedAt: 0,
      protectUntil: 0,
      kills: 0,
      deaths: 0,
      headshots: 0,
      ping: 0,
      ammo: {},
      reloadUntil: 0,
      drawUntil: 0,
      lastShot: -10,
      lastSlash: -10,
      scoped: false,
      history: [],
      moveBudget: 2,
      lastIn: this.now(),
      lastChat: 0,
      lastVoteCall: -100,
      brain: null,
      ...fields,
    };
    for (const w of Object.values(WEAPONS)) p.ammo[w.id] = { mag: w.mag, reserve: w.reserve };
    return p;
  }

  publicInfo(p) {
    return { id: p.id, name: p.name, outfit: p.outfit, bot: p.bot, kills: p.kills, deaths: p.deaths, hs: p.headshots, alive: p.alive, ping: p.ping };
  }

  addHuman(conn, msg) {
    const primary = PRIMARIES.includes(msg.primary) ? msg.primary : 'ak47';
    const p = this.makePlayer({
      name: cleanText(msg.name, 16) || 'Player',
      outfit: Math.max(0, Math.min(OUTFITS.length - 1, msg.outfit | 0)),
      conn,
      primary,
      nextPrimary: primary,
    });
    this.players.set(p.id, p);
    conn.send({
      t: 'welcome',
      v: PROTOCOL,
      id: p.id,
      st: this.now(),
      match: { state: this.state, endsAt: this.endsAt },
      bots: this.botsEnabled,
      vote: this.voteInfo(),
      players: [...this.players.values()].map((q) => this.publicInfo(q)),
    });
    this.broadcast({ t: 'pjoin', p: this.publicInfo(p) }, p.id);
    this.broadcast({ t: 'sys', text: `${p.name} joined` }, p.id);
    this.log(`join #${p.id} ${p.name} (${this.humans()} humans)`);
    this.respawn(p);
    this.balanceBots();
    return p;
  }

  addBot() {
    if (!this.botNames.length) this.botNames = [...BOT_NAMES];
    const i = Math.floor(this.rand() * this.botNames.length);
    const name = this.botNames.splice(i, 1)[0];
    const r = this.rand();
    const primary = r < 0.4 ? 'ak47' : r < 0.75 ? 'm4a1s' : 'awp';
    const p = this.makePlayer({
      name: `BOT ${name}`,
      outfit: Math.floor(this.rand() * OUTFITS.length),
      bot: true,
      primary,
      nextPrimary: primary,
    });
    p.brain = createBrain(this.rand);
    this.players.set(p.id, p);
    this.broadcast({ t: 'pjoin', p: this.publicInfo(p) });
    this.respawn(p);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (p.bot) this.botNames.push(p.name.replace(/^BOT /, ''));
    this.broadcast({ t: 'pleave', id });
    if (!p.bot) {
      this.broadcast({ t: 'sys', text: `${p.name} left` });
      this.log(`leave #${id} ${p.name} (${this.humans()} humans)`);
      if (this.vote) {
        this.vote.yes.delete(id);
        this.vote.no.delete(id);
        this.checkVote();
      }
      if (!this.botsEnabled && this.humans() < 2) {
        this.setBots(true, 'Bots are back — fewer than 2 real players left');
        return;
      }
    }
    this.balanceBots();
  }

  balanceBots() {
    const want = this.botsEnabled ? Math.max(0, BOT_FILL - this.humans()) : 0;
    const bots = [...this.players.values()].filter((p) => p.bot);
    if (this.humans() === 0) {
      // nobody watching: keep the server idle
      for (const b of bots) this.removePlayerQuiet(b);
      return;
    }
    for (let i = bots.length; i < want; i++) this.addBot();
    if (bots.length > want) {
      bots.sort((a, b) => Number(a.alive) - Number(b.alive));
      for (const b of bots.slice(0, bots.length - want)) this.removePlayer(b.id);
    }
  }

  removePlayerQuiet(p) {
    this.players.delete(p.id);
    if (p.bot) this.botNames.push(p.name.replace(/^BOT /, ''));
  }

  pickSpawn(p) {
    const enemies = [...this.players.values()].filter((q) => q !== p && q.alive);
    const scored = SPAWNS.map((s) => {
      let d = 1e9;
      for (const e of enemies) d = Math.min(d, Math.hypot(e.body.x - s.x, e.body.z - s.z));
      return { s, d };
    });
    scored.sort((a, b) => b.d - a.d);
    const pool = scored.slice(0, 6);
    return pool[Math.floor(this.rand() * pool.length)].s;
  }

  respawn(p) {
    const s = this.pickSpawn(p);
    p.body = createBody(s.x, s.z);
    p.yaw = Math.atan2(s.x, s.z) + (this.rand() - 0.5) * 0.6; // roughly face the centre
    p.pitch = 0;
    p.alive = true;
    p.hp = 100;
    p.primary = p.nextPrimary;
    p.weapon = p.primary;
    p.scoped = false;
    p.reloadUntil = 0;
    p.drawUntil = this.now() + 0.3;
    p.spawnedAt = this.now();
    p.protectUntil = this.now() + SPAWN_PROTECT_SECONDS;
    p.moveBudget = 2;
    p.lastIn = this.now();
    p.history = [];
    for (const w of Object.values(WEAPONS)) p.ammo[w.id] = { mag: w.mag, reserve: w.reserve };
    if (p.bot) {
      const r = this.rand();
      p.primary = p.nextPrimary = r < 0.4 ? 'ak47' : r < 0.75 ? 'm4a1s' : 'awp';
      p.weapon = p.primary;
      p.brain = createBrain(this.rand);
    }
    this.recordHistory(p);
    this.broadcast({
      t: 'spawn', id: p.id, x: p.body.x, y: p.body.y, z: p.body.z, yaw: p.yaw, w: p.weapon, primary: p.primary,
    });
  }

  recordHistory(p) {
    const t = this.now();
    p.history.push({ t, x: p.body.x, y: p.body.y, z: p.body.z, c: p.body.crouch });
    while (p.history.length && p.history[0].t < t - 1) p.history.shift();
  }

  /** Position of p at server time t (for lag compensation). */
  positionAt(p, t) {
    const h = p.history;
    if (!h.length) return { x: p.body.x, y: p.body.y, z: p.body.z, c: p.body.crouch };
    if (t >= h[h.length - 1].t) return h[h.length - 1];
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 2; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i];
        const b = h[i + 1];
        const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, c: a.c + (b.c - a.c) * f };
      }
    }
    return h[0];
  }

  // ---------------------------------------------------------------- input

  onInput(p, m) {
    const t = this.now();
    const dt = Math.min(1, t - p.lastIn);
    p.lastIn = t;
    if (Number.isFinite(m.yaw)) p.yaw = m.yaw;
    if (Number.isFinite(m.pitch)) p.pitch = Math.max(-1.55, Math.min(1.55, m.pitch));
    p.scoped = !!m.sc;
    if ((m.w === p.primary || m.w === SIDEARM || m.w === KNIFE) && m.w !== p.weapon) {
      p.weapon = m.w;
      p.drawUntil = t + WEAPONS[m.w].drawTime;
      p.reloadUntil = 0;
      p.scoped = false;
    }
    if (!p.alive) return;
    const { x, y, z } = m;
    if (![x, y, z].every(Number.isFinite)) return;
    const c = Math.max(0, Math.min(1, Number(m.c) || 0));
    p.moveBudget = Math.min(4, p.moveBudget + MAX_MOVE_SPEED * dt);
    const dist = Math.hypot(x - p.body.x, z - p.body.z);
    const lim = MAP_HALF - PLAYER_RADIUS + 0.05;
    const bad =
      dist > p.moveBudget + 0.25 ||
      y < -0.05 || y > 12 || Math.abs(x) > lim || Math.abs(z) > lim ||
      collides(x, y + 0.02, z, bodyHeight(c) - 0.04, PLAYER_RADIUS - 0.06);
    if (bad) {
      p.conn?.send({ t: 'correct', x: p.body.x, y: p.body.y, z: p.body.z });
      return;
    }
    p.moveBudget -= dist;
    if (dist > 0.02 && t < p.protectUntil && t - p.spawnedAt > 0.4) p.protectUntil = Math.min(p.protectUntil, t + 0.3);
    p.body.x = x;
    p.body.y = y;
    p.body.z = z;
    p.body.crouch = c;
    p.body.onGround = !!m.g;
    p.body.vx = Number(m.vx) || 0;
    p.body.vz = Number(m.vz) || 0;
    this.recordHistory(p);
  }

  onLoadout(p, primary) {
    if (!PRIMARIES.includes(primary)) return;
    p.nextPrimary = primary;
    // like CS deathmatch: you can still swap right after spawning
    if (p.alive && this.now() - p.spawnedAt < 4 && p.primary !== primary) {
      p.primary = primary;
      p.weapon = primary;
      p.ammo[primary] = { mag: WEAPONS[primary].mag, reserve: WEAPONS[primary].reserve };
      p.reloadUntil = 0;
      p.drawUntil = this.now() + WEAPONS[primary].drawTime;
      p.conn?.send({ t: 'equip', primary, w: primary });
    }
  }

  onChat(p, text) {
    const t = this.now();
    if (t - p.lastChat < 0.7) return;
    const clean = cleanText(text, CHAT_MAX);
    if (!clean) return;
    if (clean === '!kickbots' || clean === '!addbots') {
      p.lastChat = t;
      this.callVote(p, clean === '!kickbots' ? 'kickbots' : 'addbots');
      return;
    }
    p.lastChat = t;
    this.broadcast({ t: 'chat', id: p.id, text: clean });
  }

  // ---------------------------------------------------------------- votes (kick / bring back bots)

  voteInfo() {
    const v = this.vote;
    if (!v) return null;
    return { kind: v.kind, by: v.byName, endsAt: v.endsAt, yes: v.yes.size, no: v.no.size, need: this.votesNeeded(), voters: [...v.yes, ...v.no] };
  }

  votesNeeded() {
    return Math.floor(this.humans() / 2) + 1;
  }

  callVote(p, kind) {
    const t = this.now();
    const deny = (text) => p.conn?.send({ t: 'sys', text });
    if (kind !== 'kickbots' && kind !== 'addbots') return;
    if (this.vote) return deny('A vote is already running.');
    if (kind === 'kickbots' && !this.botsEnabled) return deny('Bots are already off.');
    if (kind === 'addbots' && this.botsEnabled) return deny('Bots are already on.');
    if (kind === 'kickbots' && this.humans() < 2) return deny('Kicking bots needs at least 2 real players.');
    if (t - p.lastVoteCall < VOTE_COOLDOWN) return deny(`Wait ${Math.ceil(VOTE_COOLDOWN - (t - p.lastVoteCall))}s before calling another vote.`);
    p.lastVoteCall = t;
    this.vote = { kind, by: p.id, byName: p.name, yes: new Set([p.id]), no: new Set(), endsAt: t + VOTE_SECONDS };
    this.broadcast({ t: 'vote', v: this.voteInfo() });
    this.checkVote();
  }

  castVote(p, yes) {
    const v = this.vote;
    if (!v || p.bot) return;
    v.yes.delete(p.id);
    v.no.delete(p.id);
    (yes ? v.yes : v.no).add(p.id);
    this.broadcast({ t: 'vote', v: this.voteInfo() });
    this.checkVote();
  }

  checkVote(expired = false) {
    const v = this.vote;
    if (!v) return;
    const need = this.votesNeeded();
    const humans = this.humans();
    let result = null;
    if (v.yes.size >= need) result = true;
    else if (expired || humans - v.no.size < need) result = false;
    if (result === null) return;
    this.vote = null;
    this.broadcast({ t: 'voteend', kind: v.kind, passed: result });
    if (!result) {
      this.broadcast({ t: 'sys', text: 'Vote failed.' });
      return;
    }
    if (v.kind === 'kickbots') this.setBots(false, 'Vote passed — bots kicked.');
    else this.setBots(true, 'Vote passed — bots are back.');
  }

  setBots(on, text) {
    this.botsEnabled = on;
    this.broadcast({ t: 'bots', on });
    this.broadcast({ t: 'sys', text });
    this.balanceBots();
  }

  startReload(p) {
    const w = WEAPONS[p.weapon];
    const a = p.ammo[p.weapon];
    const t = this.now();
    if (!p.alive || p.reloadUntil > t || a.mag >= w.mag || a.reserve <= 0) return;
    p.reloadUntil = t + w.reloadTime;
    p.scoped = false;
  }

  // ---------------------------------------------------------------- shooting

  onFire(p, m) {
    if (!p.alive || this.state !== 'live') return;
    const t = this.now();
    const w = WEAPONS[m.w];
    if (!w || w.melee || m.w !== p.weapon) return;
    const a = p.ammo[w.id];
    if (a.mag <= 0 || p.reloadUntil > t || t < p.drawUntil - 0.15) return;
    if (t - p.lastShot < fireInterval(w) * 0.75) return;
    const o = m.o;
    const d = m.d;
    if (!Array.isArray(o) || !Array.isArray(d) || ![...o, ...d].every(Number.isFinite)) return;
    const eyeY = p.body.y + eyeHeight(p.body.crouch);
    if (Math.hypot(o[0] - p.body.x, o[1] - eyeY, o[2] - p.body.z) > 1.3) return;
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 0.5) return;
    a.mag--;
    p.lastShot = t;
    p.protectUntil = 0;
    const viewTime = Number.isFinite(m.vt) ? Math.max(t - MAX_REWIND, Math.min(t, m.vt)) : t;
    this.resolveShot(p, w, o, [d[0] / len, d[1] / len, d[2] / len], viewTime, true);
  }

  /** Knife: slash (left) or stab (right). Short-range sweep in front of the player; backstabs deal more. */
  onMelee(p, m) {
    if (!p.alive || this.state !== 'live' || p.weapon !== KNIFE) return;
    const kind = m.k === 'stab' ? 'stab' : 'slash';
    const spec = WEAPONS.knife[kind];
    const t = this.now();
    if (t < p.drawUntil - 0.15 || t - p.lastShot < spec.interval * 0.8) return;
    const o = m.o;
    const d = m.d;
    if (!Array.isArray(o) || !Array.isArray(d) || ![...o, ...d].every(Number.isFinite)) return;
    const eyeY = p.body.y + eyeHeight(p.body.crouch);
    if (Math.hypot(o[0] - p.body.x, o[1] - eyeY, o[2] - p.body.z) > 1.3) return;
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 0.5) return;
    const dir = [d[0] / len, d[1] / len, d[2] / len];
    const followup = kind === 'slash' && t - p.lastSlash < spec.followupWindow;
    p.lastShot = t;
    if (kind === 'slash') p.lastSlash = t;
    p.protectUntil = 0;
    const viewTime = Number.isFinite(m.vt) ? Math.max(t - MAX_REWIND, Math.min(t, m.vt)) : t;

    // nearest victim: direct ray first, then a narrow cone (knives are forgiving in CS)
    const wall = rayWorld(o[0], o[1], o[2], dir[0], dir[1], dir[2], spec.range);
    let victim = null;
    let best = wall ? wall.t : spec.range;
    for (const q of this.players.values()) {
      if (q === p || !q.alive) continue;
      const pos = this.positionAt(q, viewTime);
      const hit = rayPlayer(o[0], o[1], o[2], dir[0], dir[1], dir[2], pos.x, pos.y, pos.z, pos.c, best);
      if (hit) {
        best = hit.t;
        victim = q;
        continue;
      }
      if (victim) continue;
      const cy = pos.y + bodyHeight(pos.c) * 0.65;
      const vx = pos.x - o[0];
      const vy = cy - o[1];
      const vz = pos.z - o[2];
      const dist = Math.hypot(vx, vy, vz);
      if (dist > spec.range + PLAYER_RADIUS) continue;
      const cos = (vx * dir[0] + vy * dir[1] + vz * dir[2]) / Math.max(dist, 1e-6);
      if (cos > 0.9 && lineOfSight(o[0], o[1], o[2], pos.x, cy, pos.z)) victim = q;
    }
    this.broadcast({ t: 'slash', id: p.id, k: kind, h: victim ? 1 : wall ? 2 : 0 }, p.id);
    if (!victim) return;
    // backstab: attacker stands behind the victim's facing direction
    const fx = -Math.sin(victim.yaw);
    const fz = -Math.cos(victim.yaw);
    const ax = p.body.x - victim.body.x;
    const az = p.body.z - victim.body.z;
    const backstab = (ax * fx + az * fz) / Math.max(Math.hypot(ax, az), 1e-6) < -0.3;
    this.applyDamage(victim, knifeDamage(kind, backstab, followup), p, WEAPONS.knife, false);
  }

  /** Raycast a bullet, apply damage, and tell everyone. */
  resolveShot(shooter, w, o, d, viewTime, skipShooter) {
    const world = rayWorld(o[0], o[1], o[2], d[0], d[1], d[2], 250);
    let maxT = world ? world.t : 250;
    let victim = null;
    let group = null;
    for (const q of this.players.values()) {
      if (q === shooter || !q.alive) continue;
      const pos = this.positionAt(q, viewTime);
      const hit = rayPlayer(o[0], o[1], o[2], d[0], d[1], d[2], pos.x, pos.y, pos.z, pos.c, maxT);
      if (hit) {
        maxT = hit.t;
        victim = q;
        group = hit.group;
      }
    }
    const end = [o[0] + d[0] * maxT, o[1] + d[1] * maxT, o[2] + d[2] * maxT];
    this.broadcast(
      { t: 'shot', id: shooter.id, w: w.id, o: round3(o), e: round3(end), p: victim ? 1 : 0, n: !victim && world ? world.normal : null },
      skipShooter ? shooter.id : undefined,
    );
    if (victim) {
      const dmg = computeDamage(w, maxT, group);
      this.applyDamage(victim, dmg, shooter, w, group === 'head');
    }
  }

  applyDamage(victim, dmg, attacker, w, headshot) {
    if (this.now() < victim.protectUntil) {
      attacker.conn?.send({ t: 'hit', v: victim.id, dmg: 0, hs: false, kill: false, prot: true });
      return;
    }
    victim.hp -= dmg;
    const kill = victim.hp <= 0;
    victim.conn?.send({ t: 'hurt', hp: Math.max(0, victim.hp), dmg, from: attacker.id, ax: attacker.body.x, az: attacker.body.z });
    attacker.conn?.send({ t: 'hit', v: victim.id, dmg, hs: headshot, kill });
    if (victim.bot && victim.brain) victim.brain.hurtBy = attacker.id;
    if (kill) this.killPlayer(victim, attacker, w, headshot);
  }

  killPlayer(victim, killer, w, headshot) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.respawnAt = this.now() + RESPAWN_SECONDS;
    if (killer && killer !== victim) {
      killer.kills++;
      if (headshot) killer.headshots++;
    }
    this.broadcast({ t: 'kill', k: killer ? killer.id : 0, v: victim.id, w: w ? w.id : '', hs: !!headshot });
  }

  // ---------------------------------------------------------------- loop

  update(dt) {
    const t = this.now();
    for (const p of this.players.values()) {
      if (p.bot) {
        if (p.alive && this.state === 'live') updateBot(this, p, dt, t);
        else if (p.alive) this.recordHistory(p);
      }
      if (p.reloadUntil && t >= p.reloadUntil) {
        p.reloadUntil = 0;
        const w = WEAPONS[p.weapon];
        const a = p.ammo[p.weapon];
        const take = Math.min(w.mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
        p.conn?.send({ t: 'ammo', w: w.id, mag: a.mag, reserve: a.reserve });
      }
      if (!p.alive && this.state === 'live' && t >= p.respawnAt && p.respawnAt > 0) this.respawn(p);
    }

    if (this.vote && t >= this.vote.endsAt) this.checkVote(true);
    if (this.state === 'live' && t >= this.endsAt) this.endMatch();
    else if (this.state === 'end' && t >= this.endsAt) this.newMatch();

    this.broadcastSnapshot(t);
    if (t - this.lastStats > 1) {
      this.lastStats = t;
      this.broadcast({ t: 'stats', s: [...this.players.values()].map((p) => [p.id, p.kills, p.deaths, p.headshots, p.bot ? -1 : p.ping]) });
    }
  }

  endMatch() {
    this.state = 'end';
    this.endsAt = this.now() + END_SCREEN_SECONDS;
    const results = [...this.players.values()]
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map((p) => this.publicInfo(p));
    this.broadcast({ t: 'match', state: 'end', endsAt: this.endsAt, results });
    this.log('match ended');
  }

  newMatch() {
    this.state = 'live';
    this.endsAt = this.now() + MATCH_SECONDS;
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.headshots = 0;
    }
    this.broadcast({ t: 'match', state: 'live', endsAt: this.endsAt });
    for (const p of this.players.values()) this.respawn(p);
  }

  broadcastSnapshot(t) {
    const ps = [];
    for (const p of this.players.values()) {
      const flags = (p.alive ? 1 : 0) | (p.body.onGround ? 2 : 0) | (p.scoped ? 4 : 0) | (p.reloadUntil > t ? 8 : 0);
      ps.push(
        p.id,
        Math.round(p.body.x * 100), Math.round(p.body.y * 100), Math.round(p.body.z * 100),
        Math.round(p.yaw * 1000), Math.round(p.pitch * 1000),
        Math.round(p.body.crouch * 100), WEAPONS[p.weapon].index, flags,
      );
    }
    this.broadcast({ t: 'snap', st: t, ps });
  }

  broadcast(obj, exceptId) {
    let raw = null;
    for (const p of this.players.values()) {
      if (!p.conn || p.id === exceptId) continue;
      if (p.conn.sendRaw) {
        raw ??= JSON.stringify(obj);
        p.conn.sendRaw(raw);
      } else {
        p.conn.send(obj);
      }
    }
  }
}

function round3(v) {
  return [Math.round(v[0] * 1000) / 1000, Math.round(v[1] * 1000) / 1000, Math.round(v[2] * 1000) / 1000];
}
