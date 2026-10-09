// Shared tuning for client, server and offline practice. Units are metres and seconds.
// Movement numbers are CS values converted from inches (1 unit = 0.0254 m).

export const GAME_NAME = 'LOFICAGE';
export const PROTOCOL = 1;

export const TICK_RATE = 20; // server simulation + snapshots per second
export const INPUT_RATE = 30; // client state messages per second
export const INTERP_DELAY = 0.1; // remote players are drawn this far in the past
export const MAX_REWIND = 0.3; // lag compensation cap

export const MAX_HUMANS = 20;
export const BOT_FILL = 10; // bots top the match up to this many players
export const MATCH_SECONDS = 600;
export const END_SCREEN_SECONDS = 12;
export const RESPAWN_SECONDS = 2;
export const SPAWN_PROTECT_SECONDS = 1.5;

export const PLAYER_RADIUS = 0.3; // half-width of the collision box
export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.3;
export const EYE_RATIO = 0.91; // eye height as a share of body height
export const STEP_HEIGHT = 0.42;

export const GRAVITY = 20.3; // sv_gravity 800
export const JUMP_SPEED = 7.0;
export const ACCELERATE = 5.5; // sv_accelerate
export const AIR_ACCELERATE = 12;
export const AIR_WISH_CAP = 0.76; // 30 units/s, Quake-style air control
export const FRICTION = 5.2;
export const STOP_SPEED = 2.03; // 80 units/s
export const WALK_FACTOR = 0.52; // shift-walk
export const CROUCH_FACTOR = 0.34;
export const SCOPED_FACTOR = 0.5; // AWP scoped move speed

export const ARMOR = 100; // deathmatch spawns everyone with kevlar + helmet

export const OUTFITS = [
  { id: 'desert', name: 'Desert', shirt: '#b49a6e', pants: '#8f7a55', vest: '#6b5a3c', helmet: '#7d6a48', accent: '#4a3f2c' },
  { id: 'urban', name: 'Urban', shirt: '#3b3f45', pants: '#2b2e33', vest: '#1c1e21', helmet: '#26292d', accent: '#5a6068' },
  { id: 'forest', name: 'Forest', shirt: '#5d6b45', pants: '#4a5537', vest: '#39412a', helmet: '#46502f', accent: '#2c321f' },
  { id: 'arctic', name: 'Arctic', shirt: '#d9dde0', pants: '#b9bfc4', vest: '#8e979e', helmet: '#c9ced2', accent: '#5f676d' },
];

export const BOT_NAMES = [
  'Rafi', 'Tanvir', 'Mitu', 'Sakib', 'Nadia', 'Arif', 'Jui', 'Fahim', 'Riya', 'Imran',
  'Shuvo', 'Tania', 'Rakib', 'Lamia', 'Ovi', 'Sumon', 'Priya', 'Hasan', 'Nila', 'Zubair',
];

export function eyeHeight(crouch) {
  return bodyHeight(crouch) * EYE_RATIO;
}

export function bodyHeight(crouch) {
  return STAND_HEIGHT + (CROUCH_HEIGHT - STAND_HEIGHT) * crouch;
}
