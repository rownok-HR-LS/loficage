// The in-match client: input, local prediction, weapons, remote players, effects and HUD wiring.
import * as THREE from 'three';
import {
  INPUT_RATE, INTERP_DELAY, RESPAWN_SECONDS, WALK_FACTOR, eyeHeight,
} from '../shared/constants.js';
import { WEAPONS, WEAPON_LIST, SIDEARM, KNIFE, recoilAt, inaccuracy, fireInterval } from '../shared/weapons.js';
import { createBody, stepBody } from '../shared/physics.js';
import { rayWorld, rayPlayer } from '../shared/raycast.js';
import { bulletDirection, dirFromAngles } from '../shared/rng.js';
import { buildCharacter, buildViewmodel } from './models.js';
import { flashTexture } from './materials.js';
import * as sfx from './audio.js';
import { KNIFE_ANIMS, samplePose, BladeTrail } from './knifeAnim.js';

const DEG = Math.PI / 180;
const PHYS_DT = 1 / 128;
const WEAPON_BY_INDEX = WEAPON_LIST;

function surfaceKind(box) {
  if (!box) return 'dust';
  if (box.m === 'crate' || box.m === 'door') return 'wood';
  if (box.m === 'metal' || box.m === 'cab') return 'metal';
  return 'dust';
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Vertical fov (deg) for a CS horizontal fov at 4:3. */
function csZoomToVertical(h) {
  return 2 * Math.atan(Math.tan((h * DEG) / 2) * 0.75) / DEG;
}

class Remote {
  constructor(client, info) {
    this.info = info;
    this.char = buildCharacter(info.outfit);
    this.char.setWeapon('ak47');
    client.scene.add(this.char.root);
    this.buf = [];
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.speed = 0;
    this.crouch = 0;
    this.pitch = 0;
    this.alive = false;
    this.onGround = true;
    this.stepAcc = 0;
    this.weapon = 'ak47';
    this.char.root.visible = false;
  }

  dispose(scene) {
    scene.remove(this.char.root);
  }
}

export class Client {
  constructor({ renderer, scene, camera, effects, hud, settings, net, offline, me, post }) {
    Object.assign(this, { renderer, scene, camera, effects, hud, settings, net, offline, post });
    this.meInfo = me;
    this.myId = 0;
    this.players = new Map(); // id -> info
    this.remotes = new Map(); // id -> Remote
    this.match = { state: 'live', endsAt: 0, results: [] };
    this.botsOn = true;
    this.vote = null;

    // local player
    this.body = createBody(0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.alive = false;
    this.hp = 100;
    this.deadAt = 0;
    this.killer = null;
    this.physAcc = 0;
    this.sendAcc = 0;
    this.stepDist = 0;
    this.wasOnGround = true;
    this.fallSpeed = 0;

    // weapons
    this.primary = me.primary;
    this.current = me.primary;
    this.lastWeapon = SIDEARM;
    this.ammo = {};
    this.resetAmmo();
    this.nextFire = 0;
    this.reloadEnd = 0;
    this.reloadStart = 0;
    this.drawEnd = 0;
    this.drawStart = 0;
    this.spray = 0;
    this.shotPenalty = 0;
    this.lastShot = -10;
    this.scope = 0;
    this.rescopeAt = 0;
    this.rescopeLevel = 0;
    this.triggerLatched = false;
    this.dryLatched = false;
    this.boltStart = -10;
    this.meleeStart = -10;
    this.meleeKind = 'slash';
    this.stabDown = false;
    this.knifeAnim = null; // { name, start }
    this.lastSlashAnim = 'slashB';

    // view
    this.punch = { x: 0, y: 0 };
    this.vm = { kick: 0, swayX: 0, swayY: 0, bob: 0, holder: null, flash: null, flashUntil: 0, roll: 0 };
    this.vmScene = new THREE.Scene();
    this.vmScene.environment = scene.environment;
    this.vmScene.environmentIntensity = 0.25;
    this.vmScene.add(new THREE.HemisphereLight('#e8e4dc', '#6b5a48', 0.8));
    const key = new THREE.DirectionalLight('#fff1dc', 1.7);
    key.position.set(-0.5, 1, 0.6);
    this.vmScene.add(key);
    this.vmCamera = new THREE.PerspectiveCamera(56, 1, 0.01, 10);
    this.trail = new BladeTrail(this.vmScene);
    this.flashMat = new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    // input
    this.keys = new Set();
    this.mouseDown = false;
    this.locked = false;
    this.chatOpen = false;
    this.loadoutOpen = false;
    this.scoresOpen = false;
    this.paused = false;
    this.listeners = [];
    this.aimFrame = 0;
    this.time = 0;
    this.fps = 60;
    this.statsTimer = 0;

    this.bindNet();
    this.bindInput();
    this.rebuildViewmodel();
    this.applyFov();
  }

  // ---------------------------------------------------------------- setup

  resetAmmo() {
    for (const w of WEAPON_LIST) this.ammo[w.id] = { mag: w.mag, reserve: w.reserve };
  }

  applyFov() {
    const base = this.settings.fov;
    const w = WEAPONS[this.current];
    let fov = base;
    if (w.sniper && this.scope > 0) fov = csZoomToVertical(w.zoomFov[this.scope - 1]) * (base / 73.74);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.vmCamera.fov = 56;
    this.vmCamera.updateProjectionMatrix();
    this.hud.setScope(this.scope > 0);
    if (this.vm.holder) this.vm.holder.visible = this.scope === 0;
  }

  rebuildViewmodel() {
    if (this.vm.holder) this.vmScene.remove(this.vm.holder);
    const holder = buildViewmodel(this.current, this.meInfo.outfit);
    this.vmScene.add(holder);
    const flash = new THREE.Sprite(this.flashMat);
    flash.scale.setScalar(0.16);
    flash.visible = false;
    flash.frustumCulled = false;
    holder.userData.gun.userData.muzzle.add(flash);
    this.vm.holder = holder;
    this.vm.flash = flash;
  }

  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.listeners.push(() => target.removeEventListener(type, fn, opts));
  }

  bindInput() {
    const canvas = this.renderer.domElement;
    this.on(document, 'keydown', (e) => this.onKey(e, true));
    this.on(document, 'keyup', (e) => this.onKey(e, false));
    this.on(document, 'mousemove', (e) => {
      if (!this.locked || !this.alive) return;
      const zoomScale = this.scope > 0 ? Math.tan((this.camera.fov * DEG) / 2) / Math.tan((this.settings.fov * DEG) / 2) : 1;
      const k = this.settings.sens * 0.022 * DEG * zoomScale;
      this.yaw -= e.movementX * k;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * k));
      this.vm.swayX = Math.max(-0.03, Math.min(0.03, this.vm.swayX - e.movementX * 0.00012));
      this.vm.swayY = Math.max(-0.03, Math.min(0.03, this.vm.swayY + e.movementY * 0.00012));
    });
    this.on(document, 'mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) {
        if (WEAPONS[this.current].melee) this.stabDown = true;
        else this.toggleScope();
      }
    });
    this.on(document, 'mouseup', (e) => {
      if (e.button === 2) this.stabDown = false;
      if (e.button === 0) {
        this.mouseDown = false;
        this.triggerLatched = false;
        this.dryLatched = false;
      }
    });
    this.on(document, 'wheel', (e) => {
      if (!this.locked || !this.alive) return;
      const order = [this.primary, SIDEARM, KNIFE];
      const i = order.indexOf(this.current);
      this.switchTo(order[(i + (e.deltaY > 0 ? 1 : 2)) % 3]);
      e.preventDefault();
    }, { passive: false });
    this.on(document, 'contextmenu', (e) => e.preventDefault());
    this.on(canvas, 'click', () => this.lock());
    this.on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.mouseDown = false;
        this.keys.clear();
        if (!this.loadoutOpen && !this.chatOpen) this.setPaused(true);
      } else {
        this.setPaused(false);
      }
    });
    this.on(window, 'blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    this.on(window, 'beforeunload', (e) => {
      // stops Ctrl+W from closing the tab mid-match without a prompt
      e.preventDefault();
      e.returnValue = '';
    });
    const chatInput = document.getElementById('chatInput');
    this.on(chatInput, 'keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = chatInput.value.trim();
        if (text) this.net.send({ t: 'chat', text });
        this.closeChat();
      } else if (e.key === 'Escape') {
        this.closeChat();
      }
    });
    this.on(document.getElementById('botVote'), 'click', () => {
      this.net.send({ t: 'callvote', kind: this.botsOn ? 'kickbots' : 'addbots' });
    });
    this.on(document.getElementById('voteYes'), 'click', () => this.castVote(true));
    this.on(document.getElementById('voteNo'), 'click', () => this.castVote(false));
    for (const card of document.querySelectorAll('#loadoutWeapons .weapon-card')) {
      this.on(card, 'click', () => this.chooseLoadout(card.dataset.id));
    }
  }

  lock() {
    const canvas = this.renderer.domElement;
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => canvas.requestPointerLock()?.catch?.(() => {}));
    } catch {
      canvas.requestPointerLock();
    }
  }

  setPaused(on) {
    this.paused = on;
    const pause = document.getElementById('pause');
    pause.classList.toggle('hidden', !on);
    pause.classList.remove('menu-mode');
    document.getElementById('pauseTitle').textContent = 'Paused';
    document.getElementById('resume').textContent = 'Resume';
    if (on) this.updateBotSection();
  }

  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  castVote(yes) {
    if (!this.vote || this.vote.voters.includes(this.myId)) return;
    this.net.send({ t: 'vote', yes });
  }

  /** Bots section of the pause menu. */
  updateBotSection() {
    const humans = this.humanCount();
    const status = document.getElementById('botStatus');
    const btn = document.getElementById('botVote');
    const bots = [...this.players.values()].filter((p) => p.bot).length;
    if (this.offline) {
      status.textContent = 'Offline practice always has bots.';
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      status.textContent = this.botsOn
        ? `Bots are on (${bots} in the match) · ${humans} real player${humans === 1 ? '' : 's'}.`
        : `Bots are off · ${humans} real players. They come back automatically if fewer than 2 real players remain.`;
      btn.textContent = this.botsOn ? 'Start a vote to kick all bots' : 'Start a vote to bring bots back';
      btn.disabled = !!this.vote || (this.botsOn && humans < 2);
      if (this.botsOn && humans < 2) status.textContent += ' Kicking bots needs at least 2 real players.';
    }
    const canVote = !!this.vote && !this.vote.voters.includes(this.myId);
    document.getElementById('voteButtons').classList.toggle('hidden', !canVote);
  }

  onKey(e, down) {
    if (this.chatOpen) return;
    const k = e.code;
    if (down && (k === 'F1' || k === 'F2' || k === 'Tab' || (e.ctrlKey && ['KeyS', 'KeyD', 'KeyW', 'KeyA'].includes(k)))) e.preventDefault();
    if (k === 'Tab') {
      this.scoresOpen = down;
      this.renderScoreboard();
      return;
    }
    if (!down) {
      this.keys.delete(k);
      return;
    }
    if (e.repeat) return;
    this.keys.add(k);
    if (this.loadoutOpen && ['Digit1', 'Digit2', 'Digit3'].includes(k)) {
      this.chooseLoadout(['ak47', 'm4a1s', 'awp'][Number(k.slice(-1)) - 1]);
      return;
    }
    switch (k) {
      case 'KeyY':
      case 'Enter':
        if (this.locked) {
          e.preventDefault();
          this.openChat();
        }
        break;
      case 'KeyB':
        this.toggleLoadout();
        break;
      case 'KeyF':
        if (WEAPONS[this.current].melee && !this.knifeAnim) this.playKnife('inspect');
        break;
      case 'F1':
        e.preventDefault();
        this.castVote(true);
        break;
      case 'F2':
        e.preventDefault();
        this.castVote(false);
        break;
      case 'KeyR':
        this.startReload();
        break;
      case 'Digit1':
        this.switchTo(this.primary);
        break;
      case 'Digit2':
        this.switchTo(SIDEARM);
        break;
      case 'Digit3':
        this.switchTo(KNIFE);
        break;
      case 'KeyQ':
        this.switchTo(this.lastWeapon === this.current ? SIDEARM : this.lastWeapon);
        break;
      default:
    }
  }

  openChat() {
    this.chatOpen = true;
    this.keys.clear();
    this.mouseDown = false;
    this.hud.openChat(true);
  }

  closeChat() {
    this.chatOpen = false;
    this.hud.openChat(false);
    if (!this.locked) this.lock();
  }

  toggleLoadout() {
    this.loadoutOpen = !this.loadoutOpen;
    this.hud.loadout(this.loadoutOpen);
  }

  chooseLoadout(id) {
    if (!WEAPONS[id] || id === SIDEARM) return;
    this.meInfo.primary = id;
    this.settings.save({ primary: id });
    this.net.send({ t: 'loadout', primary: id });
    document.querySelectorAll('.weapon-card').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
    this.loadoutOpen = false;
    this.hud.loadout(false);
    this.hud.toast(`${WEAPONS[id].name} selected`);
    if (!this.locked) this.lock();
  }

  // ---------------------------------------------------------------- network

  bindNet() {
    const n = this.net;
    n.on('welcome', (m) => {
      this.myId = m.id;
      this.match.state = m.match.state;
      this.match.endsAt = m.match.endsAt;
      this.botsOn = m.bots !== false;
      this.vote = m.vote || null;
      for (const p of m.players) this.addPlayer(p);
    });
    n.on('vote', (m) => {
      this.vote = m.v;
      if (this.paused) this.updateBotSection();
      sfx.playUi('chat');
    });
    n.on('voteend', () => {
      this.vote = null;
      if (this.paused) this.updateBotSection();
    });
    n.on('bots', (m) => {
      this.botsOn = m.on;
      if (this.paused) this.updateBotSection();
    });
    n.on('pjoin', (m) => this.addPlayer(m.p));
    n.on('pleave', (m) => {
      this.players.delete(m.id);
      const r = this.remotes.get(m.id);
      if (r) {
        r.dispose(this.scene);
        this.remotes.delete(m.id);
      }
    });
    n.on('snap', (m) => this.onSnapshot(m));
    n.on('spawn', (m) => this.onSpawn(m));
    n.on('shot', (m) => this.onRemoteShot(m));
    n.on('slash', (m) => {
      const r = this.remotes.get(m.id);
      if (!r) return;
      r.char.swing(m.k);
      const dist = this.camera.position.distanceTo(r.pos);
      sfx.playKnife(m.h, r.pos, dist);
    });
    n.on('hit', (m) => {
      if (m.prot) return;
      this.hud.hitmarker(m.hs, m.kill);
      sfx.playHit(m.hs, m.kill);
    });
    n.on('hurt', (m) => {
      this.hp = m.hp;
      this.hud.setHp(m.hp);
      const ang = Math.atan2(m.ax - this.body.x, m.az - this.body.z);
      // arc points toward the attacker relative to where we look
      this.hud.damageFrom(-(ang - this.yaw - Math.PI));
      sfx.playHurt(false);
      this.punch.x += 1.2; // flinch
    });
    n.on('kill', (m) => this.onKill(m));
    n.on('ammo', (m) => {
      this.ammo[m.w] = { mag: m.mag, reserve: m.reserve };
      if (m.w === this.current) this.reloadEnd = 0;
    });
    n.on('equip', (m) => {
      this.primary = m.primary;
      this.ammo[m.primary] = { mag: WEAPONS[m.primary].mag, reserve: WEAPONS[m.primary].reserve };
      this.switchTo(m.primary, true);
    });
    n.on('correct', (m) => {
      this.body.x = m.x;
      this.body.y = m.y;
      this.body.z = m.z;
      this.body.vx = this.body.vz = this.body.vy = 0;
    });
    n.on('chat', (m) => {
      const p = this.players.get(m.id);
      this.hud.chat(p ? p.name : '?', m.text);
      sfx.playUi('chat');
    });
    n.on('sys', (m) => this.hud.chat(null, m.text, true));
    n.on('stats', (m) => {
      for (const [id, k, d, hs, ping] of m.s) {
        const p = this.players.get(id);
        if (p) Object.assign(p, { kills: k, deaths: d, hs, ping: ping < 0 ? 0 : ping });
      }
      this.updateScores();
    });
    n.on('match', (m) => {
      this.match.state = m.state;
      this.match.endsAt = m.endsAt;
      if (m.state === 'end') {
        this.match.results = m.results;
        this.mouseDown = false;
        sfx.playUi('end');
      } else {
        this.hud.matchEnd(false);
        this.effects.clearDecals();
        this.hud.toast('NEW MATCH — GO!');
        sfx.playUi('start');
        for (const p of this.players.values()) Object.assign(p, { kills: 0, deaths: 0, hs: 0 });
      }
    });
  }

  addPlayer(p) {
    this.players.set(p.id, { ...p });
    if (p.id !== this.myId && this.myId && !this.remotes.has(p.id)) this.remotes.set(p.id, new Remote(this, p));
  }

  ensureRemote(id) {
    let r = this.remotes.get(id);
    if (!r && id !== this.myId) {
      const info = this.players.get(id) || { id, name: '…', outfit: 0 };
      r = new Remote(this, info);
      this.remotes.set(id, r);
    }
    return r;
  }

  onSnapshot(m) {
    const ps = m.ps;
    for (let i = 0; i < ps.length; i += 9) {
      const id = ps[i];
      if (id === this.myId) continue;
      const r = this.ensureRemote(id);
      if (!r) continue;
      r.buf.push({
        t: m.st,
        x: ps[i + 1] / 100, y: ps[i + 2] / 100, z: ps[i + 3] / 100,
        yaw: ps[i + 4] / 1000, pitch: ps[i + 5] / 1000, c: ps[i + 6] / 100,
        w: WEAPON_BY_INDEX[ps[i + 7]]?.id || 'ak47', f: ps[i + 8],
      });
      while (r.buf.length > 2 && r.buf[1].t < m.st - 1.5) r.buf.shift();
    }
  }

  onSpawn(m) {
    if (m.id === this.myId) {
      this.body = createBody(m.x, m.z);
      this.body.y = m.y;
      this.yaw = m.yaw;
      this.pitch = 0;
      this.alive = true;
      this.hp = 100;
      this.hud.setHp(100);
      this.resetAmmo();
      this.primary = m.primary;
      this.lastWeapon = SIDEARM;
      this.scope = 0;
      this.switchTo(m.w, true);
      this.hud.death(false);
      this.spray = 0;
      this.shotPenalty = 0;
      this.reloadEnd = 0;
      const p = this.players.get(this.myId);
      if (p) p.alive = true;
      return;
    }
    const r = this.ensureRemote(m.id);
    if (!r) return;
    r.buf = [];
    r.alive = true;
    r.pos.set(m.x, m.y, m.z);
    r.prevPos.copy(r.pos);
    r.char.root.position.copy(r.pos);
    r.char.root.rotation.set(0, m.yaw, 0);
    const p = this.players.get(m.id);
    if (p) p.alive = true;
  }

  onKill(m) {
    const killer = this.players.get(m.k);
    const victim = this.players.get(m.v);
    if (victim) {
      victim.alive = false;
      victim.deaths = (victim.deaths || 0) + 1;
    }
    if (killer && m.k !== m.v) {
      killer.kills = (killer.kills || 0) + 1;
      if (m.hs) killer.hs = (killer.hs || 0) + 1;
    }
    const mine = m.k === this.myId || m.v === this.myId;
    this.hud.killfeed(killer?.name || '', victim?.name || '?', m.w, m.hs, mine);
    if (m.v === this.myId) {
      this.alive = false;
      this.deadAt = this.time;
      this.killer = m.k;
      this.mouseDown = false;
      this.scope = 0;
      this.applyFov();
      this.hud.death(true, killer && m.k !== this.myId ? killer.name : '', m.w, m.hs);
      this.hud.reload(null);
    } else if (m.k === this.myId) {
      this.hud.toast(m.hs ? `HEADSHOT · ${victim?.name || ''}` : `KILLED ${victim?.name || ''}`, m.hs ? 'hs' : 'kill');
    }
    this.updateScores();
  }

  onRemoteShot(m) {
    const w = WEAPONS[m.w];
    const r = this.remotes.get(m.id);
    const o = new THREE.Vector3().fromArray(m.o);
    const e = new THREE.Vector3().fromArray(m.e);
    let from = o;
    if (r && r.char.state.gun) {
      from = new THREE.Vector3();
      r.char.state.gun.userData.muzzle.getWorldPosition(from);
      if (!w.silenced) {
        this.effects.remoteFlash(from, w.sniper ? 1.6 : 1);
        this.effects.muzzleLight(from, 0.6);
      }
    }
    const dist = this.camera.position.distanceTo(o);
    sfx.playShot(w.sound, o, dist);
    if (Math.random() < (w.sniper ? 1 : 0.5)) this.effects.tracer(from, e);
    const dir = e.clone().sub(o).normalize();
    if (m.p) {
      this.effects.blood(e, dir.clone().negate().toArray(), false);
    } else if (m.n) {
      const hit = rayWorld(o.x, o.y, o.z, dir.x, dir.y, dir.z, o.distanceTo(e) + 0.5);
      const kind = surfaceKind(hit?.box);
      this.effects.impact(e, m.n, kind);
      sfx.playImpact(e, this.camera.position.distanceTo(e), kind);
    }
  }

  // ---------------------------------------------------------------- weapons

  switchTo(id, force = false) {
    if (!force && (id === this.current || !this.alive)) return;
    if (id !== this.current) this.lastWeapon = this.current;
    this.current = id;
    const w = WEAPONS[id];
    this.drawStart = this.time;
    this.drawEnd = this.time + (force ? 0.35 : w.drawTime);
    this.reloadEnd = 0;
    this.scope = 0;
    this.rescopeAt = 0;
    this.spray = 0;
    this.rebuildViewmodel();
    this.applyFov();
    this.hud.reload(null);
    sfx.playDraw();
    this.knifeAnim = null;
    this.trail.clear();
    if (w.melee) this.playKnife('draw');
  }

  playKnife(name) {
    this.knifeAnim = { name, start: this.time };
  }

  toggleScope() {
    const w = WEAPONS[this.current];
    if (!w.sniper || !this.alive || this.reloadEnd > this.time) return;
    this.scope = (this.scope + 1) % 3;
    this.rescopeAt = 0;
    sfx.playZoom();
    this.applyFov();
  }

  startReload() {
    const w = WEAPONS[this.current];
    const a = this.ammo[this.current];
    if (!this.alive || this.reloadEnd > this.time || a.mag >= w.mag || a.reserve <= 0 || this.time < this.drawEnd) return;
    this.reloadStart = this.time;
    this.reloadEnd = this.time + w.reloadTime;
    this.scope = 0;
    this.rescopeAt = 0;
    this.applyFov();
    this.net.send({ t: 'reload' });
    sfx.playReload(w.reloadTime, w.sniper);
  }

  tryFire() {
    const w = WEAPONS[this.current];
    const a = this.ammo[this.current];
    const t = this.time;
    if (this.match.state !== 'live') return;
    if (t < this.drawEnd || this.reloadEnd > t) return;
    if (!w.auto && this.triggerLatched) return;
    if (t < this.nextFire) return;
    if (a.mag <= 0) {
      if (!this.dryLatched) {
        sfx.playDry();
        this.dryLatched = true;
        this.startReload();
      }
      return;
    }
    this.triggerLatched = true;
    this.nextFire = t + fireInterval(w);
    a.mag--;

    const speed = Math.hypot(this.body.vx, this.body.vz);
    const recoil = recoilAt(w, this.spray);
    const inacc = inaccuracy(w, {
      speed, crouch: this.body.crouch, airborne: !this.body.onGround, scoped: this.scope > 0, shotPenalty: this.shotPenalty,
    });
    const eye = this.eyePosition();
    const d = bulletDirection(this.yaw, this.pitch, recoil, inacc, Math.random);
    this.net.send({
      t: 'fire', w: w.id,
      o: [eye.x, eye.y, eye.z].map((v) => Math.round(v * 1000) / 1000),
      d: d.map((v) => Math.round(v * 100000) / 100000),
      vt: this.net.serverNow() - INTERP_DELAY,
    });
    this.spray += 1;
    this.shotPenalty = Math.min(w.inacc.maxShot, this.shotPenalty + w.inacc.perShot);
    this.lastShot = t;

    // feedback
    sfx.playShot(w.sound, null);
    this.vm.kick = Math.min(1.4, this.vm.kick + (w.sniper ? 1.3 : w.id === 'deagle' ? 1.1 : 0.6));
    if (!w.silenced) {
      this.vm.flash.visible = this.scope === 0;
      this.vm.flash.material.rotation = Math.random() * Math.PI;
      this.vm.flashUntil = t + 0.04;
      this.effects.muzzleLight(eye.clone().add(this.forward().multiplyScalar(0.8)), 1);
    }
    this.predictImpact(eye, d, w);
    if (w.sniper) {
      this.boltStart = t + 0.12;
      sfx.playBolt();
      if (this.scope > 0) {
        this.rescopeLevel = this.scope;
        this.scope = 0;
        this.rescopeAt = t + fireInterval(w) * 0.85;
        this.applyFov();
      }
    }
    if (a.mag === 0) setTimeout(() => this.startReload(), 250);
  }

  /** Knife attack. The server decides hits and backstabs; we animate and play sounds right away. */
  tryMelee(kind) {
    const spec = WEAPONS.knife[kind];
    const t = this.time;
    if (this.match.state !== 'live' || t < this.drawEnd || t < this.nextFire) return;
    this.nextFire = t + spec.interval;
    this.meleeStart = t;
    this.meleeKind = kind;
    if (kind === 'stab') this.playKnife('stab');
    else {
      // quick follow-up slashes alternate forehand / backhand, like CS
      const chain = this.knifeAnim && this.knifeAnim.name.startsWith('slash') && t - this.knifeAnim.start < 0.9;
      this.lastSlashAnim = chain && this.lastSlashAnim === 'slashA' ? 'slashB' : 'slashA';
      this.playKnife(this.lastSlashAnim);
    }
    const eye = this.eyePosition();
    const d = dirFromAngles(this.yaw, this.pitch);
    this.net.send({
      t: 'melee', k: kind,
      o: [eye.x, eye.y, eye.z].map((v) => Math.round(v * 1000) / 1000),
      d: d.map((v) => Math.round(v * 100000) / 100000),
      vt: this.net.serverNow() - INTERP_DELAY,
    });
    // predicted feedback after the blade travels
    setTimeout(() => {
      if (!this.alive) return;
      const world = rayWorld(eye.x, eye.y, eye.z, d[0], d[1], d[2], spec.range);
      let hitRemote = null;
      for (const r of this.remotes.values()) {
        if (!r.alive) continue;
        const p = r.char.root.position;
        const hit = rayPlayer(eye.x, eye.y, eye.z, d[0], d[1], d[2], p.x, p.y, p.z, r.crouch, world ? world.t : spec.range);
        if (hit) hitRemote = hit;
      }
      if (hitRemote) {
        const at = eye.clone().add(new THREE.Vector3(...d).multiplyScalar(hitRemote.t));
        this.effects.blood(at, [-d[0], -d[1], -d[2]], false);
        sfx.playKnife(1, null);
        this.punch.y += 0.8;
        this.vm.kick = 0.6;
      } else if (world) {
        const at = eye.clone().add(new THREE.Vector3(...d).multiplyScalar(world.t));
        this.effects.puff(at, { color: '#cbb79a', count: 3, size: 0.12, speed: 0.6, life: 0.4 });
        sfx.playKnife(2, null);
      } else {
        sfx.playKnife(0, null);
      }
    }, kind === 'stab' ? 180 : 90);
  }

  /** Client-side impact so shots feel instant; damage is decided by the server. */
  predictImpact(eye, d, w) {
    const world = rayWorld(eye.x, eye.y, eye.z, d[0], d[1], d[2], 250);
    let maxT = world ? world.t : 250;
    let hitRemote = null;
    for (const r of this.remotes.values()) {
      if (!r.alive) continue;
      const p = r.char.root.position;
      const hit = rayPlayer(eye.x, eye.y, eye.z, d[0], d[1], d[2], p.x, p.y, p.z, r.crouch, maxT);
      if (hit) {
        maxT = hit.t;
        hitRemote = hit;
      }
    }
    const end = eye.clone().add(new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(maxT));
    const muzzle = this.muzzleWorld();
    if (w.sniper || Math.random() < 0.6) this.effects.tracer(muzzle, end);
    if (hitRemote) {
      this.effects.blood(end, [-d[0], -d[1], -d[2]], hitRemote.group === 'head');
    } else if (world) {
      const kind = surfaceKind(world.box);
      this.effects.impact(end, world.normal, kind);
      sfx.playImpact(end, maxT, kind);
    }
  }

  forward() {
    return new THREE.Vector3(...dirFromAngles(this.yaw, this.pitch));
  }

  eyePosition() {
    return new THREE.Vector3(this.body.x, this.body.y + eyeHeight(this.body.crouch), this.body.z);
  }

  muzzleWorld() {
    const f = this.forward();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return this.eyePosition().addScaledVector(f, 0.7).addScaledVector(right, 0.12).add(new THREE.Vector3(0, -0.1, 0));
  }

  // ---------------------------------------------------------------- per-frame

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    const w = WEAPONS[this.current];

    // local movement (fixed steps)
    const canMove = this.alive && !this.chatOpen && this.match.state === 'live';
    const k = this.keys;
    const input = {
      fwd: canMove ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0,
      side: canMove ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0,
      yaw: this.yaw,
      jump: canMove && k.has('Space'),
      crouch: canMove && (k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight')),
      walk: canMove && (k.has('ShiftLeft') || k.has('ShiftRight')),
      maxSpeed: w.maxSpeed,
      scoped: this.scope > 0,
    };
    if (this.alive) {
      this.physAcc += dt;
      let steps = 0;
      while (this.physAcc >= PHYS_DT && steps < 16) {
        this.fallSpeed = Math.min(this.fallSpeed, this.body.vy);
        stepBody(this.body, input, PHYS_DT);
        this.physAcc -= PHYS_DT;
        steps++;
      }
      if (this.body.onGround && !this.wasOnGround) {
        if (this.fallSpeed < -4) sfx.playLand();
        this.fallSpeed = 0;
      }
      this.wasOnGround = this.body.onGround;
      // own footsteps (walking with shift is silent, like CS)
      const speed = Math.hypot(this.body.vx, this.body.vz);
      if (this.body.onGround && speed > w.maxSpeed * WALK_FACTOR + 0.2) {
        this.stepDist += speed * dt;
        if (this.stepDist > 2.1) {
          this.stepDist = 0;
          sfx.playFootstep(null);
        }
      }
    }

    // weapon timers
    if (this.reloadEnd && t >= this.reloadEnd) {
      const a = this.ammo[this.current];
      const take = Math.min(w.mag - a.mag, a.reserve);
      a.mag += take;
      a.reserve -= take;
      this.reloadEnd = 0;
    }
    if (this.rescopeAt && t >= this.rescopeAt) {
      this.rescopeAt = 0;
      if (this.mouseDown === false && this.alive && this.current === 'awp') {
        this.scope = this.rescopeLevel;
        this.applyFov();
      }
    }
    if (t - this.lastShot > fireInterval(w) * 1.15) this.spray = Math.max(0, this.spray - dt * (7.5 / w.recoilReset));
    this.shotPenalty = Math.max(0, this.shotPenalty - dt * (w.inacc.maxShot / w.recovery || 0));
    if (this.alive && this.locked && !this.chatOpen) {
      if (w.melee) {
        if (this.mouseDown) this.tryMelee('slash');
        else if (this.stabDown) this.tryMelee('stab');
      } else if (this.mouseDown) {
        this.tryFire();
      }
    }

    // send state
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / INPUT_RATE) {
      this.sendAcc = 0;
      const b = this.body;
      this.net.send({
        t: 'in',
        x: +b.x.toFixed(3), y: +b.y.toFixed(3), z: +b.z.toFixed(3),
        yaw: +this.yaw.toFixed(4), pitch: +this.pitch.toFixed(4),
        c: +b.crouch.toFixed(2), w: this.current, g: b.onGround ? 1 : 0, sc: this.scope > 0 ? 1 : 0,
        vx: +b.vx.toFixed(2), vz: +b.vz.toFixed(2),
      });
    }

    this.updateRemotes(dt);
    this.updateCamera(dt);
    this.updateViewmodel(dt);
    this.effects.update(dt);
    this.updateHud(dt);
  }

  updateRemotes(dt) {
    const rt = this.net.serverNow() - INTERP_DELAY;
    for (const r of this.remotes.values()) {
      const b = r.buf;
      if (!b.length) continue;
      let s;
      if (rt <= b[0].t) s = b[0];
      else if (rt >= b[b.length - 1].t) s = b[b.length - 1];
      else {
        let i = b.length - 2;
        while (i > 0 && b[i].t > rt) i--;
        const a = b[i];
        const c = b[i + 1];
        const f = (rt - a.t) / Math.max(1e-6, c.t - a.t);
        s = {
          x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f, z: a.z + (c.z - a.z) * f,
          yaw: a.yaw + wrapAngle(c.yaw - a.yaw) * f, pitch: a.pitch + (c.pitch - a.pitch) * f,
          c: a.c + (c.c - a.c) * f, w: c.w, f: c.f,
        };
      }
      const alive = (s.f & 1) === 1;
      r.prevPos.copy(r.pos);
      r.pos.set(s.x, s.y, s.z);
      if (r.prevPos.distanceTo(r.pos) > 4) r.prevPos.copy(r.pos);
      const moved = Math.hypot(r.pos.x - r.prevPos.x, r.pos.z - r.prevPos.z) / Math.max(dt, 1e-3);
      r.speed = r.speed * 0.8 + moved * 0.2;
      r.crouch = s.c;
      r.alive = alive;
      r.onGround = (s.f & 2) === 2;
      if (s.w !== r.weapon) {
        r.weapon = s.w;
        r.char.setWeapon(s.w);
        r.far = undefined;
      }
      const root = r.char.root;
      root.visible = true;
      // distant soldiers skip the shadow pass
      const far = this.camera.position.distanceTo(r.pos) > 35;
      if (far !== r.far) {
        r.far = far;
        root.traverse((o) => {
          if (o.isMesh) o.castShadow = !far;
        });
      }
      if (alive) {
        root.position.copy(r.pos);
        root.rotation.y = s.yaw;
      }
      r.char.animate(dt, { speed: alive ? r.speed : 0, crouch: s.c, pitch: s.pitch, dead: !alive });

      // footsteps you can hear (running only)
      if (alive && r.onGround && r.speed > 3.6) {
        r.stepAcc += r.speed * dt;
        if (r.stepAcc > 2.2) {
          r.stepAcc = 0;
          const dist = this.camera.position.distanceTo(r.pos);
          if (dist < 38) sfx.playFootstep(r.pos, dist, 1);
        }
      }
    }
  }

  updateCamera(dt) {
    const w = WEAPONS[this.current];
    // view punch follows the recoil pattern, then settles
    const target = recoilAt(w, this.spray);
    const kick = w.viewKick;
    const ease = 1 - Math.exp(-dt * 22);
    this.punch.y += (target[1] * kick - this.punch.y) * ease;
    this.punch.x += (-target[0] * kick - this.punch.x) * ease;
    if (this.punch.x > 0.6) this.punch.x *= 1 - dt * 6;

    const cam = this.camera;
    if (this.alive) {
      cam.position.set(this.body.x, this.body.y + eyeHeight(this.body.crouch), this.body.z);
      cam.rotation.order = 'YXZ';
      cam.rotation.y = this.yaw + this.punch.x * DEG;
      cam.rotation.x = this.pitch + this.punch.y * DEG;
      cam.rotation.z = this.vm.roll;
    } else {
      // death cam: sink down and turn toward the killer
      const k = this.remotes.get(this.killer);
      const sinceDeath = this.time - this.deadAt;
      cam.position.y += (this.body.y + 0.45 - cam.position.y) * Math.min(1, dt * 4);
      if (k) {
        const want = Math.atan2(-(k.pos.x - cam.position.x), -(k.pos.z - cam.position.z));
        cam.rotation.y += wrapAngle(want - cam.rotation.y) * Math.min(1, dt * 3);
        cam.rotation.x += (-0.05 - cam.rotation.x) * Math.min(1, dt * 3);
      }
      cam.rotation.z = Math.min(0.25, sinceDeath * 0.5);
      this.hud.deathTimer(Math.max(0, RESPAWN_SECONDS - sinceDeath));
    }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    sfx.setListener(cam.position, fwd, up);
  }

  updateViewmodel(dt) {
    const vm = this.vm;
    const h = vm.holder;
    if (!h) return;
    const t = this.time;
    const w = WEAPONS[this.current];
    h.visible = this.alive && this.scope === 0;
    if (vm.flash.visible && t > vm.flashUntil) vm.flash.visible = false;
    vm.kick *= Math.exp(-dt * 14);
    vm.swayX *= Math.exp(-dt * 7);
    vm.swayY *= Math.exp(-dt * 7);
    const speed = Math.hypot(this.body.vx, this.body.vz);
    const moving = this.body.onGround ? Math.min(1, speed / 5) : 0;
    vm.bob += dt * speed * 1.7;
    const base = h.userData.base;
    const gun = h.userData.gun;
    let px = base.x + vm.swayX + Math.sin(vm.bob) * 0.008 * moving;
    let py = base.y + vm.swayY - Math.abs(Math.cos(vm.bob)) * 0.01 * moving - this.body.crouch * 0.01;
    let pz = base.z + vm.kick * 0.04;
    let rx = vm.kick * 0.07;
    let rz = 0;
    // draw
    const drawT = Math.min(1, (t - this.drawStart) / Math.max(0.01, this.drawEnd - this.drawStart));
    const de = w.melee ? 1 : 1 - Math.pow(1 - drawT, 3);
    py -= (1 - de) * 0.22;
    rx -= (1 - de) * 0.9;
    // reload
    if (this.reloadEnd > t) {
      const p = (t - this.reloadStart) / (this.reloadEnd - this.reloadStart);
      const dip = Math.sin(Math.min(1, p) * Math.PI);
      py -= dip * 0.07;
      rx += dip * 0.35;
      rz += dip * 0.45;
      const mag = gun.userData.mag;
      const home = gun.userData.magHome;
      const out = p < 0.15 ? 0 : p < 0.35 ? (p - 0.15) / 0.2 : p < 0.5 ? 1 : p < 0.68 ? 1 - (p - 0.5) / 0.18 : 0;
      mag.position.set(home.x, home.y - out * 0.25, home.z + out * 0.04);
      mag.visible = !(p > 0.35 && p < 0.5);
      this.hud.reload(Math.min(1, p));
    } else {
      gun.userData.mag.position.copy(gun.userData.magHome);
      gun.userData.mag.visible = true;
      this.hud.reload(null);
    }
    // knife: keyframed draw / slash / stab / inspect, idle breathing, blade trail and camera roll
    let ry = 0;
    vm.roll *= Math.exp(-dt * 10);
    if (w.melee) {
      py += Math.sin(t * 1.7) * 0.003;
      rz += Math.sin(t * 1.1) * 0.012;
      let striking = false;
      const ka = this.knifeAnim;
      if (ka) {
        const anim = KNIFE_ANIMS[ka.name];
        const u = (t - ka.start) / anim.dur;
        if (u >= 1) {
          this.knifeAnim = null;
        } else {
          const pose = samplePose(anim, Math.max(0, u));
          px += pose.p[0];
          py += pose.p[1];
          pz += pose.p[2];
          rx += pose.r[0];
          ry += pose.r[1];
          rz += pose.r[2];
          striking = !!anim.strike && u >= anim.strike[0] && u <= anim.strike[1];
          if (anim.roll) vm.roll = Math.sin(Math.min(1, u / 0.6) * Math.PI) * anim.roll;
        }
      }
      this.trail.update(gun.userData.muzzle, gun.userData.bladeBase, striking && h.visible);
    } else if (this.trail.hist.length) {
      this.trail.clear();
    }
    // AWP bolt cycle
    const bt = (t - this.boltStart) / 0.7;
    if (w.sniper && bt > 0 && bt < 1) {
      rz += Math.sin(bt * Math.PI) * 0.35;
      py -= Math.sin(bt * Math.PI) * 0.02;
      const bolt = gun.userData.bolt;
      if (bolt) bolt.position.z = 0.09 + Math.sin(bt * Math.PI) * 0.08;
    }
    h.position.set(px, py, pz);
    h.rotation.set(rx, ry, rz);
  }

  updateHud(dt) {
    const w = WEAPONS[this.current];
    const a = this.ammo[this.current];
    this.hud.setAmmo(this.current, a.mag, a.reserve, w.melee ? 3 : this.current === SIDEARM ? 2 : 1);
    this.hud.setHp(this.alive ? this.hp : 0);
    const now = this.net.serverNow();
    if (this.match.state === 'live') {
      this.hud.setTimer(this.match.endsAt - now);
      this.hud.matchEnd(false);
    } else {
      this.hud.setTimer(0);
      this.hud.matchEnd(true, this.match.results, this.myId, this.match.endsAt - now);
    }
    // crosshair gap from current inaccuracy
    const speed = Math.hypot(this.body.vx, this.body.vz);
    const inacc = inaccuracy(w, {
      speed, crouch: this.body.crouch, airborne: !this.body.onGround, scoped: this.scope > 0, shotPenalty: this.shotPenalty,
    }) + recoilAt(w, this.spray)[1] * 0.25;
    const px = (Math.tan(((inacc / 2) * DEG)) / Math.tan(((this.camera.fov / 2) * DEG))) * (innerHeight / 2);
    this.hud.setCrosshair(w.melee ? 0 : px, !!w.sniper);
    this.hud.vote(this.vote, !!this.vote && this.vote.voters.includes(this.myId), this.vote ? this.vote.endsAt - now : 0);

    // name of the player under the crosshair
    if (++this.aimFrame % 4 === 0) this.hud.aimName(this.alive ? this.aimedName() : null);
    this.statsTimer += dt;
    if (this.statsTimer > 0.5) {
      this.statsTimer = 0;
      this.hud.ping(this.net.rtt * 1000, this.offline);
      if (this.scoresOpen) this.renderScoreboard();
    }
  }

  aimedName() {
    const eye = this.eyePosition();
    const d = dirFromAngles(this.yaw, this.pitch);
    const world = rayWorld(eye.x, eye.y, eye.z, d[0], d[1], d[2], 120);
    let maxT = world ? world.t : 120;
    let name = null;
    for (const [id, r] of this.remotes) {
      if (!r.alive) continue;
      const p = r.char.root.position;
      const hit = rayPlayer(eye.x, eye.y, eye.z, d[0], d[1], d[2], p.x, p.y, p.z, r.crouch, maxT);
      if (hit) {
        maxT = hit.t;
        name = this.players.get(id)?.name || null;
      }
    }
    return name;
  }

  sortedPlayers() {
    return [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  updateScores() {
    const me = this.players.get(this.myId);
    const top = this.sortedPlayers()[0];
    this.hud.setScores(me ? me.kills : 0, top?.name, top?.kills ?? 0);
  }

  renderScoreboard() {
    this.hud.scoreboard(this.scoresOpen, this.sortedPlayers(), this.myId);
  }

  render() {
    const r = this.renderer;
    this.post.render();
    if (this.alive && this.scope === 0) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  }

  dispose() {
    for (const off of this.listeners) off();
    for (const r of this.remotes.values()) r.dispose(this.scene);
    this.remotes.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.show(false);
    this.setPaused(false);
  }
}
