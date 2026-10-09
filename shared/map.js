// "Sandline" — the LOFICAGE desert town. Original layout, about 92 x 92 m.
// Every solid thing is an axis-aligned box so the client, server and bots share one collision world.
// Roads run along x = -22, 0, 22 and z = -22, 0, 22 (8 m wide); buildings and courtyards fill the blocks.

export const MAP_HALF = 46; // playable area is [-46, 46] on x and z

const boxes = [];
const decor = [];

function box(x1, z1, x2, z2, h, m, kind = 'building', y0 = 0) {
  boxes.push({
    min: [Math.min(x1, x2), y0, Math.min(z1, z2)],
    max: [Math.max(x1, x2), y0 + h, Math.max(z1, z2)],
    m,
    kind,
  });
}

/** A wooden crate centred on (x, z); stack > 1 piles more on top. */
function crate(x, z, s = 1.1, stack = 1, y0 = 0) {
  for (let i = 0; i < stack; i++) {
    const h = s;
    boxes.push({
      min: [x - s / 2, y0 + i * h, z - s / 2],
      max: [x + s / 2, y0 + (i + 1) * h, z + s / 2],
      m: 'crate',
      kind: 'crate',
    });
  }
}

function lowWall(x1, z1, x2, z2, h = 1.1, m = 'sandstone') {
  box(x1, z1, x2, z2, h, m, 'lowwall');
}

function barrel(x, z) {
  boxes.push({ min: [x - 0.32, 0, z - 0.32], max: [x + 0.32, 0.95, z + 0.32], m: 'metal', kind: 'barrel' });
}

/** Raised platform with a staircase; dir is the side the stairs come down: 'x+', 'x-', 'z+', 'z-'. */
function platform(x1, z1, x2, z2, h, dir, stairWidthFrom, stairWidthTo) {
  box(x1, z1, x2, z2, h, 'concrete', 'platform');
  const steps = Math.ceil(h / 0.3);
  const rise = h / steps;
  for (let k = 0; k < steps - 1; k++) {
    const sh = h - rise * (k + 1);
    const a = 0.5 * k;
    const b = 0.5 * (k + 1);
    if (dir === 'x+') box(x2 + a, stairWidthFrom, x2 + b, stairWidthTo, sh, 'concrete', 'stairs');
    if (dir === 'x-') box(x1 - b, stairWidthFrom, x1 - a, stairWidthTo, sh, 'concrete', 'stairs');
    if (dir === 'z+') box(stairWidthFrom, z2 + a, stairWidthTo, z2 + b, sh, 'concrete', 'stairs');
    if (dir === 'z-') box(stairWidthFrom, z1 - b, stairWidthTo, z1 - a, sh, 'concrete', 'stairs');
  }
}

function truck(x, z, alongZ = true) {
  // cargo bed + cab; wheels are decoration on the client
  if (alongZ) {
    box(x - 1.2, z - 3, x + 1.2, z + 2, 2.7, 'metal', 'truck');
    box(x - 1.15, z + 2, x + 1.15, z + 4.1, 2.3, 'cab', 'truckcab');
  } else {
    box(x - 3, z - 1.2, x + 2, z + 1.2, 2.7, 'metal', 'truck');
    box(x + 2, z - 1.15, x + 4.1, z + 1.15, 2.3, 'cab', 'truckcab');
  }
  decor.push({ type: 'truck', x, z, alongZ });
}

// ---- perimeter -----------------------------------------------------------
box(-48, -48, 48, -46, 10, 'concrete', 'perimeter');
box(-48, 46, 48, 48, 10, 'concrete', 'perimeter');
box(-48, -46, -46, 46, 10, 'concrete', 'perimeter');
box(46, -46, 48, 46, 10, 'concrete', 'perimeter');

// ---- row 1 (north, z -46..-26) -------------------------------------------
box(-46, -46, -37, -26, 8, 'sandstone');
box(-34, -46, -26, -31, 6, 'plaster');
crate(-30, -28.5, 1.1, 2);
crate(-28.6, -28.2);

box(-18, -46, -4, -35, 7, 'clay');
crate(-14.5, -31.5, 1.1, 2);
crate(-13.2, -31.8);
lowWall(-9, -29, -5, -28.4);
barrel(-16.8, -27.6);

box(4, -46, 18, -31, 9, 'white');
crate(8, -28.5);
crate(9.3, -28.3, 1.1, 2);
barrel(15.5, -29.5);
barrel(16.3, -28.8);

box(26, -46, 46, -39, 7, 'plaster');
box(35, -39, 46, -26, 6, 'sandstone');
truck(30, -33, true);

// ---- row 2 (z -18..-4) ---------------------------------------------------
// market square
box(-46, -18, -40, -4, 6, 'clay');
lowWall(-38, -17.6, -33, -17, 1.0, 'sandstone');
lowWall(-31, -17.6, -26.5, -17, 1.0, 'sandstone');
crate(-36, -12, 1.1);
crate(-34.8, -12.2, 1.1, 2);
crate(-30, -7.5);
barrel(-28.6, -13);
barrel(-28, -12.3);
decor.push({ type: 'stall', x: -36, z: -7, rot: 0, color: '#b5452f' });
decor.push({ type: 'stall', x: -30.5, z: -14, rot: Math.PI, color: '#2f6d8a' });
box(-37.4, -7.6, -34.6, -6.4, 0.95, 'crate', 'stalltable');
box(-31.9, -14.6, -29.1, -13.4, 0.95, 'crate', 'stalltable');

// building with an east-west tunnel
box(-18, -18, -4, -12.5, 7, 'plaster');
box(-18, -9.5, -4, -4, 7, 'plaster');
box(-18, -12.5, -4, -9.5, 4, 'plaster', 'lintel', 3);

// building with a north-south tunnel
box(4, -18, 9.5, -4, 8, 'sandstone');
box(12.5, -18, 18, -4, 8, 'sandstone');
box(9.5, -18, 12.5, -4, 5, 'sandstone', 'lintel', 3);

// east courtyard with a raised platform
box(40, -18, 46, -4, 7, 'white');
platform(28, -16, 34, -9, 2.1, 'x+', -13, -9);
lowWall(28, -7, 33, -6.4, 1.1, 'concrete');
crate(37.5, -6.5, 1.1, 2);
crate(38, -15.5);

// ---- centre plaza ---------------------------------------------------------
box(-1.3, -1.3, 1.3, 1.3, 1.0, 'sandstone', 'well');
decor.push({ type: 'palm', x: -3, z: 3 });
decor.push({ type: 'palm', x: 3, z: -3 });

// ---- row 3 (z 4..18) -----------------------------------------------------
box(-46, 4, -38, 18, 7, 'white');
box(-35, 4, -26, 18, 7, 'white');
box(-38, 4, -35, 18, 4, 'white', 'lintel', 3);

box(-18, 12, -4, 18, 6, 'sandstone');
crate(-15, 7.5, 1.1, 2);
crate(-13.8, 7.2);
barrel(-7, 9.8);
barrel(-6.2, 10.4);
lowWall(-11, 5, -10.4, 9, 1.1);

box(4, 4, 18, 10, 6, 'clay');
box(4, 13, 18, 18, 6, 'clay');
box(4, 10, 18, 13, 3, 'clay', 'lintel', 3);

box(26, 4, 46, 11, 8, 'plaster');
box(26, 14, 36, 18, 5, 'sandstone');
crate(40, 14.5, 1.1, 2);
crate(42.5, 15.5);
decor.push({ type: 'palm', x: 44, z: 16.5 });

// ---- row 4 (south, z 26..46) ---------------------------------------------
box(-46, 31, -26, 46, 7, 'clay');
crate(-40, 28.5, 1.1, 2);
crate(-31, 28);
barrel(-35.5, 28.2);

box(-18, 26, -10, 46, 8, 'plaster');
box(-7, 26, -4, 46, 6, 'white');
crate(-8.5, 40);

platform(6, 28, 12, 32, 2.1, 'z+', 6, 9);
box(4, 37, 18, 46, 6, 'sandstone');
truck(15.5, 30, true);
crate(5, 35.5);

box(26, 26, 46, 34, 9, 'sandstone');
box(26, 37, 46, 46, 7, 'white');
crate(41, 35.5);

// ---- road cover ------------------------------------------------------------
crate(-20, -40, 1.1, 2);
crate(-24.5, -21);
crate(-23.4, -20.6, 1.1, 2);
lowWall(-21, 3.5, -19, 6, 1.1, 'concrete');
crate(-24, 38);
crate(-1.5, -38, 1.1, 2);
crate(-0.3, -38.3);
crate(2, -20.5);
lowWall(-2, 21, 2.5, 21.6, 1.1, 'concrete');
crate(1.5, 40.5, 1.1, 2);
crate(23, -40);
crate(20, -23.4, 1.1, 2);
crate(24.5, 9);
lowWall(19.5, 38, 22, 38.6, 1.1, 'concrete');
crate(-40, -23, 1.1);
crate(-38.8, -23.3, 1.1, 2);
crate(-11, -21, 1.1);
crate(11, 23.5, 1.1, 2);
crate(39, 21, 1.1);
barrel(-33, 21);
barrel(33, -20.6);
crate(-10, 0.8);
crate(10.5, -1.2, 1.1, 2);

decor.push({ type: 'palm', x: -24.8, z: -24.8 });
decor.push({ type: 'palm', x: 25, z: 25 });
decor.push({ type: 'palm', x: -25, z: 25.2 });
decor.push({ type: 'palm', x: 24.8, z: -25 });
for (const [x, z] of [[-19, -30], [19, 30], [-30, 19], [30, -19], [-19, 30], [19, -30]]) {
  decor.push({ type: 'pole', x, z });
}
decor.push({ type: 'awning', x: -11, z: -18, w: 6, side: 'z-' });
decor.push({ type: 'awning', x: 11, z: 18, w: 6, side: 'z+' });
decor.push({ type: 'awning', x: -26, z: 11, w: 5, side: 'x+' });
decor.push({ type: 'awning', x: 26, z: -32, w: 5, side: 'x-' });

// thin colliders for palm trunks and utility poles (drawn as models on the client)
for (const d of decor) {
  if (d.type === 'palm') boxes.push({ min: [d.x - 0.22, 0, d.z - 0.22], max: [d.x + 0.22, 6.5, d.z + 0.22], m: 'none', kind: 'palm' });
  if (d.type === 'pole') boxes.push({ min: [d.x - 0.14, 0, d.z - 0.14], max: [d.x + 0.14, 7.5, d.z + 0.14], m: 'none', kind: 'pole' });
}

export const MAP_BOXES = boxes;
export const MAP_DECOR = decor;

// Road strips (paved) for the client ground: [x1, z1, x2, z2]
export const ROADS = [
  [-26, -46, -18, 46], [-4, -46, 4, 46], [18, -46, 26, 46],
  [-46, -26, 46, -18], [-46, -4, 46, 4], [-46, 18, 46, 26],
];

export const SPAWNS = [
  [-22, -42], [-22, -10], [-22, 12], [-22, 42], [0, -42], [0, -10], [0, 12], [0, 42],
  [22, -42], [22, -10], [22, 12], [22, 42], [-42, -22], [-10, -22], [12, -22], [42, -22],
  [-42, 22], [-12, 22], [10, 22], [42, 22], [-12, -29], [-33, -9], [-8.5, 7], [38.6, -11],
  [31, -24.5], [41, 12.5], [-37.5, 27.5], [7, 25], [-42, 0], [42, 0], [-11, -2], [12, 2],
].map(([x, z]) => ({ x, z }));
