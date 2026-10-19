// Traces the visible (non-transparent) part of each scene sprite into an SVG outline, for use as
// tap areas. Writes one SVG per sprite plus scene.svg with every sprite as a <g> layer, all in
// the sprites' own pixel space (viewBox 0 0 2160 2160), so they line up with the art on the stage.
//
// Run from the game folder:  node tools/trace-colliders.mjs
// Needs ImageMagick (`magick`) to read the images.
//
// How: each image's alpha is scaled down by SCALE, thresholded into a mask and made coarser
// (gaps filled, edges padded: see CLOSE_GAP and PAD); the boundary
// between filled and empty pixels is followed into closed loops (outer edges clockwise, holes
// counter-clockwise, so the default nonzero fill keeps the holes open), then simplified. With
// FILL_HOLES the hole loops are dropped, so each shape is solid.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const SPRITES = 'assets/sprites';
const OUT = 'assets/colliders';
const SIZE = 2160; // the sprites' canvas
const SCALE = 2; // trace at 1/SCALE resolution: plenty for tap areas, and keeps the paths small
const ALPHA_MIN = 128; // a pixel counts as content from 50% opacity up
const TOLERANCE = 1; // simplification, in traced pixels (= SCALE sprite pixels)
const MIN_AREA = 4; // drop specks smaller than this many traced pixels
// Fill enclosed holes, so an outlined shape (a mushroom cap, a ring) can be tapped anywhere inside,
// not just on its lines. Set to false for the exact visible shape, holes included.
const FILL_HOLES = true;
// Tap areas are coarser than the art, so a fingertip doesn't slip through: gaps narrower than
// CLOSE_GAP (between leaves, flowers and stems) are filled in, then the outline is padded out by
// PAD all round. In sprite pixels; set both to 0 to trace the art exactly.
const CLOSE_GAP = 80;
const PAD = 12;
// Then each separate piece (a plant, the character…) is wrapped in its convex hull: the tightest
// outline with no dents, like a rubber band round it, so the gaps between fronds, stems and
// flowers can be tapped too. Set to false to keep the padded outline's shape.
const HULL = true;

// The sprites used in the scene (index.html), in stacking order.
const LAYERS = [
  'floor.png',
  'particles.png',
  'particular.webp',
  'particular_aura.png',
  'aura.webp',
  'shrooms.png',
  'shrooms_light.png',
  'plants_sides.png',
  'plants_sides_light.png',
  'plants_corner.png',
  'plants_corners_light.png',
  'sun.webp',
];

// Tap areas that also take in other images: a corner plant's area covers its glow too
// (plants_corners_light.png), so it reaches a little past the flower.
const ALSO = {
  'plants_corner.png': ['plants_corners_light.png'],
};

const N = SIZE / SCALE;

// Closing (grow, then shrink back) fills the gaps; growing again pads. Disk radii in traced pixels.
function readMask(file) {
  const radius = (px) => Math.round(px / 2 / SCALE);
  const shape = [
    ...(CLOSE_GAP ? ['-morphology', 'Close', `Disk:${radius(CLOSE_GAP)}`] : []),
    ...(PAD ? ['-morphology', 'Dilate', `Disk:${radius(PAD * 2)}`] : []),
  ];
  const alpha = execFileSync('magick', [
    `${SPRITES}/${file}`, '-alpha', 'extract', '-resize', `${N}x${N}!`,
    '-threshold', `${(ALPHA_MIN / 255) * 100}%`, ...shape, '-depth', '8', 'gray:-',
  ], { maxBuffer: N * N * 2 });
  return Uint8Array.from(alpha, (a) => (a >= ALPHA_MIN ? 1 : 0));
}

// Follows the filled/empty boundary into closed loops of grid corners.
function traceLoops(mask) {
  const filled = (x, y) => x >= 0 && y >= 0 && x < N && y < N && mask[y * N + x] === 1;
  const key = (x, y) => y * (N + 1) + x;
  const out = new Map(); // corner → outgoing edges [dx, dy], filled side on the right
  const add = (x, y, dx, dy) => {
    const k = key(x, y);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push([dx, dy]);
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) add(x, y, 1, 0); // top, going right
      if (!filled(x + 1, y)) add(x + 1, y, 0, 1); // right side, going down
      if (!filled(x, y + 1)) add(x + 1, y + 1, -1, 0); // bottom, going left
      if (!filled(x - 1, y)) add(x, y + 1, 0, -1); // left side, going up
    }
  }

  const loops = [];
  for (const [startKey, edges] of out) {
    while (edges.length) {
      let x = startKey % (N + 1);
      let y = Math.floor(startKey / (N + 1));
      let [dx, dy] = edges.pop();
      const pts = [[x, y]];
      for (;;) {
        x += dx; y += dy;
        const next = out.get(key(x, y));
        if (!next.length) break; // back at the start
        // At a corner where two pixels touch diagonally there are two ways on: turn right, so
        // each pixel's outline stays separate (the right turn of (dx, dy) is (-dy, dx)).
        let i = next.findIndex(([ex, ey]) => ex === -dy && ey === dx);
        if (i < 0) i = 0;
        const [ndx, ndy] = next.splice(i, 1)[0];
        if (ndx !== dx || ndy !== dy) pts.push([x, y]); // keep only the corners
        dx = ndx; dy = ndy;
      }
      loops.push(pts);
    }
  }
  return loops;
}

const area = (pts) => pts.reduce((s, [x, y], i) => {
  const [nx, ny] = pts[(i + 1) % pts.length];
  return s + x * ny - nx * y;
}, 0) / 2;

// Douglas–Peucker on an open polyline.
function simplifyLine(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let far = 0;
  let farIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
    if (d > far) { far = d; farIdx = i; }
  }
  if (far <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplifyLine(pts.slice(0, farIdx + 1), tol).slice(0, -1), ...simplifyLine(pts.slice(farIdx), tol)];
}

// A closed loop is split at its two most distant points (roughly) and each half simplified.
function simplifyLoop(pts, tol) {
  let farIdx = 0;
  let far = 0;
  pts.forEach(([x, y], i) => {
    const d = Math.hypot(x - pts[0][0], y - pts[0][1]);
    if (d > far) { far = d; farIdx = i; }
  });
  const a = simplifyLine(pts.slice(0, farIdx + 1), tol);
  const b = simplifyLine([...pts.slice(farIdx), pts[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function pathData(loops) {
  return loops.map((pts) => 'M' + pts.map(([x, y]) => `${x * SCALE} ${y * SCALE}`).join('L') + 'Z').join('');
}

// Convex hull of a loop's points (Andrew's monotone chain), clockwise like an outer loop.
function hull(pts) {
  const p = [...pts].sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  const cross = ([ox, oy], [ax, ay], [bx, by]) => (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
  const half = (list) => list.reduce((h, q) => {
    while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
    h.push(q);
    return h;
  }, []);
  const lower = half(p);
  const upper = half([...p].reverse());
  const h = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return area(h) < 0 ? h.reverse() : h;
}

function trace(file) {
  const mask = readMask(file);
  for (const other of ALSO[file] ?? []) readMask(other).forEach((on, i) => { if (on) mask[i] = 1; });
  const loops = traceLoops(mask)
    .filter((pts) => Math.abs(area(pts)) >= MIN_AREA)
    .filter((pts) => !FILL_HOLES || area(pts) > 0) // holes run the other way round: negative area
    .map((pts) => (HULL && area(pts) > 0 ? hull(pts) : simplifyLoop(pts, TOLERANCE)))
    .filter((pts) => pts.length >= 3);
  return pathData(loops);
}

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">\n${body}\n</svg>\n`;

mkdirSync(OUT, { recursive: true });
const groups = [];
for (const file of LAYERS) {
  const id = file.replace(/\.\w+$/, '');
  const d = trace(file);
  writeFileSync(`${OUT}/${id}.svg`, svg(`<path id="${id}" d="${d}"/>`));
  groups.push(`<g id="${id}"><path d="${d}"/></g>`);
  console.log(`${id}: ${(d.length / 1024).toFixed(1)} KB`);
}
writeFileSync(`${OUT}/scene.svg`, svg(groups.join('\n')));
