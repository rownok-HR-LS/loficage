import './style.css';
import * as THREE from 'three';
import { OUTFITS } from '../shared/constants.js';
import { WEAPONS, PRIMARIES } from '../shared/weapons.js';
import { createRenderer, createWorld, applyQuality } from './world.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { Net, serverUrl, checkServer } from './net.js';
import { Client } from './client.js';
import { Post } from './post.js';
import { buildCharacter, RIM } from './models.js';
import { initAudio, setVolume } from './audio.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- settings

const XH_DEFAULT = { style: 'dynamic', color: '#6cff6c', len: 7, th: 2, gap: 4, alpha: 1, outline: true, dot: false };
const DEFAULTS = { nick: '', outfit: 0, primary: 'ak47', sens: 2.0, vol: 0.7, quality: 'high', fov: 74, rim: 'subtle', xh: { ...XH_DEFAULT } };
const settings = {
  ...DEFAULTS,
  save(patch) {
    Object.assign(this, patch);
    try {
      const { save, ...data } = this;
      localStorage.setItem('loficage', JSON.stringify(data));
    } catch {
      /* storage unavailable: keep in memory */
    }
  },
};
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('loficage') || '{}'));
} catch {
  /* ignore */
}
if (!PRIMARIES.includes(settings.primary)) settings.primary = 'ak47';
settings.xh = { ...XH_DEFAULT, ...(settings.xh || {}) };

// ---------------------------------------------------------------- renderer + world

const canvas = $('game');
const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 1200);
const { sun } = createWorld(scene, renderer);
applyQuality(renderer, sun, settings.quality);
renderer.setSize(innerWidth, innerHeight, false);
const post = new Post(renderer, scene, camera);
post.setQuality(settings.quality);
const effects = new Effects(scene);
const hud = new Hud();
setVolume(settings.vol);

let client = null;
let net = null;

// ---------------------------------------------------------------- menu

const STAT = {
  ak47: { Damage: 0.72, Rate: 0.8, Control: 0.45, Mobility: 0.55 },
  m4a1s: { Damage: 0.66, Rate: 0.8, Control: 0.72, Mobility: 0.65 },
  awp: { Damage: 1, Rate: 0.12, Control: 0.9, Mobility: 0.3 },
};

function weaponCards(container, keyHints) {
  container.innerHTML = '';
  PRIMARIES.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = `weapon-card${settings.primary === id ? ' active' : ''}`;
    b.dataset.id = id;
    b.type = 'button';
    b.setAttribute('aria-label', WEAPONS[id].name);
    const stats = Object.entries(STAT[id])
      .map(([k, v]) => `<div class="stat"><span>${k}</span><i style="--v:${Math.round(v * 100)}%"></i></div>`)
      .join('');
    b.innerHTML = `<b>${keyHints ? `${i + 1} · ` : ''}${WEAPONS[id].name}</b>${stats}`;
    container.appendChild(b);
  });
}

function buildMenu() {
  const nick = $('nick');
  nick.value = settings.nick;
  const outfits = $('outfits');
  OUTFITS.forEach((o, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `outfit${settings.outfit === i ? ' active' : ''}`;
    b.innerHTML = `<span class="swatch" style="background:linear-gradient(135deg, ${o.shirt} 0 40%, ${o.vest} 40% 70%, ${o.helmet} 70%)"></span>${o.name}`;
    b.addEventListener('click', () => {
      settings.save({ outfit: i });
      outfits.querySelectorAll('.outfit').forEach((el, k) => el.classList.toggle('active', k === i));
      updatePreview();
    });
    outfits.appendChild(b);
  });
  weaponCards($('weapons'), false);
  weaponCards($('loadoutWeapons'), true);
  $('weapons').addEventListener('click', (e) => {
    const card = e.target.closest('.weapon-card');
    if (!card) return;
    settings.save({ primary: card.dataset.id });
    document.querySelectorAll('.weapon-card').forEach((c) => c.classList.toggle('active', c.dataset.id === card.dataset.id));
    updatePreview();
  });
  $('play').addEventListener('click', () => startGame(false));
  $('offline').addEventListener('click', () => startGame(true));
  $('connectCancel').addEventListener('click', () => leaveGame());
  nick.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame(false);
  });
}

// character preview on the join screen
const preview = (() => {
  const c = $('preview');
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  const s = new THREE.Scene();
  s.environment = scene.environment;
  s.add(new THREE.HemisphereLight('#ffe9cf', '#3a2f25', 1.2));
  const key = new THREE.DirectionalLight('#fff0dc', 2.4);
  key.position.set(2, 3, 2);
  s.add(key);
  const rim = new THREE.DirectionalLight('#ff9a50', 1.6);
  rim.position.set(-2, 2, -3);
  s.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0, 1.15, 4.2);
  cam.lookAt(0, 0.95, 0);
  return { r, s, cam, char: null, c };
})();

function updatePreview() {
  if (preview.char) preview.s.remove(preview.char.root);
  preview.char = buildCharacter(settings.outfit);
  preview.char.setWeapon(settings.primary);
  preview.char.root.rotation.y = Math.PI * 0.85; // start facing the camera
  preview.s.add(preview.char.root);
  $('previewName').textContent = `${OUTFITS[settings.outfit].name} · ${WEAPONS[settings.primary].name}`;
}

function renderPreview(dt) {
  const { r, s, cam, c } = preview;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  if (c.width !== Math.floor(w * r.getPixelRatio())) {
    r.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
  if (preview.char) {
    preview.char.root.rotation.y += dt * 0.6;
    preview.char.animate(dt, { speed: 0, crouch: 0, pitch: 0, dead: false });
  }
  r.render(s, cam);
}

async function refreshServerStatus() {
  const el = $('serverStatus');
  const txt = el.querySelector('.txt');
  el.className = 'server-status';
  txt.textContent = 'Checking server…';
  const s = await checkServer(5000);
  if (s.ok) {
    el.classList.add('ok');
    txt.textContent = `Server online · ${s.players}/${s.max} players`;
  } else {
    el.classList.add('waking');
    txt.textContent = 'Server is sleeping — it wakes up when you press Play';
  }
}

// ---------------------------------------------------------------- game flow

function showScreen(id) {
  for (const s of ['menu', 'connecting']) $(s).classList.toggle('hidden', s !== id);
}

async function startGame(offline) {
  if (client || net) return;
  const typed = $('nick').value.trim().slice(0, 16);
  const name = typed || `Player${Math.floor(Math.random() * 900 + 100)}`;
  if (typed) settings.save({ nick: typed });
  initAudio();
  setVolume(settings.vol);
  showScreen('connecting');
  $('connectTitle').textContent = offline ? 'Starting practice…' : 'Connecting…';
  $('connectText').textContent = offline ? 'Loading bots.' : 'Joining the match.';
  const slow = offline ? null : setTimeout(() => {
    $('connectTitle').textContent = 'Waking up the server…';
    $('connectText').textContent = 'The free server sleeps when nobody is playing. This can take up to a minute — hang tight.';
  }, 3000);

  net = new Net();
  const me = { name, outfit: settings.outfit, primary: settings.primary };
  const welcomed = new Promise((resolve, reject) => {
    net.on('welcome', resolve);
    net.on('full', () => reject(new Error('full')));
  });
  try {
    if (offline) await net.connectLocal();
    else await net.connect(serverUrl());
    net.send({ t: 'join', name, outfit: me.outfit, primary: me.primary });
    const welcome = await Promise.race([welcomed, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
    clearTimeout(slow);
    beginMatch(welcome, me, offline);
  } catch (err) {
    clearTimeout(slow);
    net?.close();
    net = null;
    $('connectTitle').textContent = err.message === 'full' ? 'Match is full' : 'Could not reach the server';
    $('connectText').textContent = err.message === 'full'
      ? 'All 20 slots are taken. Try again in a minute, or practise offline with bots.'
      : 'The game server did not answer. Try again, or practise offline with bots.';
    document.querySelector('.connect-box .spinner').style.visibility = 'hidden';
  }
}

function beginMatch(welcome, me, offline) {
  document.querySelector('.connect-box .spinner').style.visibility = 'visible';
  camera.fov = settings.fov;
  client = new Client({ renderer, scene, camera, effects, hud, settings, net, offline, me, post });
  // replay the welcome now that the client is listening, then everything that arrived after it
  net.handlers.get('welcome')?.(welcome);
  net.flush();
  net.on('disconnect', () => {
    leaveGame();
    showScreen('connecting');
    $('connectTitle').textContent = 'Disconnected';
    $('connectText').textContent = 'Lost connection to the server.';
    document.querySelector('.connect-box .spinner').style.visibility = 'hidden';
  });
  client.resize(innerWidth, innerHeight);
  showScreen(null);
  hud.show(true);
  hud.chat(null, offline ? 'Offline practice — bots only.' : 'Press Tab for scores, B to change weapon, Y to chat.', true);
  client.lock();
  // browsers only allow mouse capture right after a click; if it didn't take, ask for one
  setTimeout(() => {
    if (client && !client.locked) client.setPaused(true);
  }, 400);
}

function leaveGame() {
  if (client) client.dispose();
  client = null;
  net?.close();
  net = null;
  effects.clearDecals();
  hud.show(false);
  showScreen('menu');
  refreshServerStatus();
}

// ---------------------------------------------------------------- pause menu

function bindPause() {
  const sens = $('sens');
  const vol = $('vol');
  const fov = $('fov');
  const quality = $('quality');
  sens.value = settings.sens;
  vol.value = settings.vol;
  fov.min = 60;
  fov.max = 90;
  fov.value = settings.fov;
  quality.value = settings.quality;
  const rim = $('rim');
  rim.value = settings.rim;
  const applyRim = () => {
    RIM.strength.value = { off: 0, subtle: 0.55, strong: 1.4 }[settings.rim] ?? 0.55;
  };
  applyRim();
  rim.addEventListener('change', () => {
    settings.save({ rim: rim.value });
    applyRim();
  });
  const label = () => {
    $('sensVal').textContent = Number(settings.sens).toFixed(2);
    $('volVal').textContent = `${Math.round(settings.vol * 100)}%`;
    $('fovVal').textContent = `${settings.fov}°`;
  };
  label();
  sens.addEventListener('input', () => {
    settings.save({ sens: Number(sens.value) });
    label();
  });
  vol.addEventListener('input', () => {
    settings.save({ vol: Number(vol.value) });
    setVolume(settings.vol);
    label();
  });
  fov.addEventListener('input', () => {
    settings.save({ fov: Number(fov.value) });
    client?.applyFov();
    label();
  });
  quality.addEventListener('change', () => {
    settings.save({ quality: quality.value });
    applyQuality(renderer, sun, settings.quality);
    post.setQuality(settings.quality);
    onResize();
  });
  $('resume').addEventListener('click', () => {
    if (client) client.lock();
    else $('pause').classList.add('hidden'); // opened from the main menu
  });
  $('menuSettings').addEventListener('click', () => {
    const pause = $('pause');
    pause.classList.remove('hidden');
    pause.classList.add('menu-mode');
    $('pauseTitle').textContent = 'Settings';
    $('resume').textContent = 'Done';
  });
  bindCrosshair();
  $('leave').addEventListener('click', () => leaveGame());
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        // with keyboard lock, Ctrl+W and Esc reach the game instead of the browser
        await navigator.keyboard?.lock?.(['KeyW', 'Escape']);
      }
    } catch {
      /* not supported */
    }
    client?.lock();
  });
}

// ---------------------------------------------------------------- crosshair editor

const XH_COLORS = ['#6cff6c', '#ffe14d', '#3de0ff', '#ff4d6d', '#ffffff', '#ff7af0'];

function bindCrosshair() {
  const ranges = { xhLen: 'len', xhTh: 'th', xhGap: 'gap', xhOp: 'alpha' };
  const colors = $('xhColors');
  const swatches = XH_COLORS.map((col) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = col;
    b.setAttribute('aria-label', `Crosshair colour ${col}`);
    b.addEventListener('click', () => update({ color: col }));
    colors.appendChild(b);
    return b;
  });
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.title = 'Custom colour';
  picker.addEventListener('input', () => update({ color: picker.value }));
  colors.appendChild(picker);

  function render() {
    const c = settings.xh;
    for (const [id, key] of Object.entries(ranges)) $(id).value = c[key];
    $('xhStyle').value = c.style;
    $('xhOutline').checked = c.outline;
    $('xhDot').checked = c.dot;
    $('xhLenVal').textContent = c.len === 0 ? 'dot only' : `${c.len}px`;
    $('xhThVal').textContent = `${c.th}px`;
    $('xhGapVal').textContent = `${c.gap}px`;
    $('xhOpVal').textContent = `${Math.round(c.alpha * 100)}%`;
    picker.value = c.color;
    swatches.forEach((b, i) => b.classList.toggle('on', XH_COLORS[i] === c.color));
    hud.applyCrosshair(c);
  }
  function update(patch) {
    settings.save({ xh: { ...settings.xh, ...patch } });
    render();
  }
  for (const [id, key] of Object.entries(ranges)) $(id).addEventListener('input', () => update({ [key]: Number($(id).value) }));
  $('xhStyle').addEventListener('change', () => update({ style: $('xhStyle').value }));
  $('xhOutline').addEventListener('change', () => update({ outline: $('xhOutline').checked }));
  $('xhDot').addEventListener('change', () => update({ dot: $('xhDot').checked }));
  $('xhReset').addEventListener('click', () => update({ ...XH_DEFAULT }));
  render();
}

// ---------------------------------------------------------------- loop

function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  client?.resize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

let last = performance.now();
let fly = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (client) {
    client.update(dt);
    client.render();
  } else {
    // slow flyover of the town behind the menu
    fly += dt * 0.035;
    const fixed = import.meta.env.DEV && window.__cam; // dev: pin the camera for screenshots
    if (fixed) {
      camera.position.fromArray(fixed.pos);
      camera.lookAt(...fixed.at);
    } else {
      camera.position.set(Math.sin(fly) * 30, 9 + Math.sin(fly * 0.7) * 2, Math.cos(fly) * 30);
      camera.lookAt(Math.sin(fly + 1.2) * 6, 2.5, Math.cos(fly + 1.2) * 6);
    }
    effects.update(dt);
    post.render();
    if (!$('menu').classList.contains('hidden')) renderPreview(dt);
  }
  requestAnimationFrame(frame);
}

buildMenu();
bindPause();
updatePreview();
refreshServerStatus();
requestAnimationFrame(frame);

// debug handle for automated checks in development
if (import.meta.env.DEV) window.__loficage = { get client() { return client; }, scene, camera, renderer, post };
