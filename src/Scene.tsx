import { memo, type ReactElement } from 'react';
import { CHOICE_LABEL, ROOMS, YOU_ID, type Choice, type Resolution } from './engine';

/* Pixel-art cross-section drawn on a 192 x 140 grid. One SVG unit is one art pixel. */

const W = 192;
const H = 140;
const GROUND = 52;

const C = {
  sky0: '#2d2a4a',
  sky1: '#3d3760',
  sky2: '#5b4a78',
  star: '#f6ead8',
  moon: '#f3e2b8',
  grass0: '#7fb04a',
  grass1: '#5e8c3a',
  soil0: '#5a3a26',
  soil1: '#4a2f20',
  soil2: '#3a2418',
  pebble: '#6e4a33',
  room: '#1a120e',
  roomWall: '#2a1d16',
  floor: '#6b4a2e',
  lamp: '#f2b544',
  rim: '#d9c4a5',
  spoke: '#9a846c',
  stand: '#7a6250',
  fur: '#e8a85c',
  furDark: '#c07f3c',
  belly: '#f6ead8',
  eye: '#1d1410',
  ear: '#e88a8a',
  wood: '#9a6b3f',
  woodDark: '#734d2c',
  sack: '#c9b07a',
  bookA: '#c75c5c',
  bookB: '#5c8fc7',
  bookC: '#8fc75c',
  metal: '#a7b0b8',
  crack: '#f6ead8',
  spark: '#ffe08a',
  hat: '#f2b544',
  rubble: '#7a5a44',
} as const;

type Px = [number, number, number, number, string];

function rects(list: Px[], keyPrefix: string): ReactElement[] {
  return list.map(([x, y, w, h, fill], i) => <rect key={`${keyPrefix}${i}`} x={x} y={y} width={w} height={h} fill={fill} />);
}

/** Pixels of a ring, computed once. */
function ring(cx: number, cy: number, r: number, thick: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r && d > r - thick) out.push([x, y]);
    }
  }
  return out;
}

function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 200; guard++) {
    out.push([x, y]);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

const WHEEL = { cx: 146, cy: 27, r: 21 };
const RIM = ring(WHEEL.cx, WHEEL.cy, WHEEL.r, 2);
const SPOKES: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    const dx = Math.cos(a) * (WHEEL.r - 2);
    const dy = Math.sin(a) * (WHEEL.r - 2);
    pts.push(...line(WHEEL.cx - dx, WHEEL.cy - dy, WHEEL.cx + dx, WHEEL.cy + dy));
  }
  return pts;
})();

const STARS: [number, number][] = [
  [8, 6], [22, 14], [37, 4], [55, 11], [70, 3], [84, 16], [101, 7], [176, 8], [186, 20], [118, 4], [63, 22], [14, 28],
];

/** Sprites: each char is a palette key; '.' is transparent. */
const SPRITE_PALETTE: Record<string, string> = {
  b: C.fur,
  d: C.furDark,
  w: C.belly,
  k: C.eye,
  p: C.ear,
  h: C.hat,
};

const SMALL_HAMSTER = ['.p..p.', 'bbbbbb', 'bkbbbk', 'bwwwwb', '.d..d.'];
const SMALL_HAMSTER_YOU = ['.hhhh.', 'bbbbbb', 'bkbbbk', 'bwwwwb', '.d..d.'];
const WHEEL_HAMSTER = ['..p....p..', '.bbbbbbbb.', 'bbbbbbbbkb', 'bwwwbbbbbw', 'bwwwwbbbb.', '.d.d..d.d.'];
const SLEEP_HAMSTER = ['..........', '..p.......', '.bbbbbbbb.', 'bbbbbbbbbb', 'bwwwwbbkkb', '.dddddddd.'];

function sprite(rows: string[], ox: number, oy: number, key: string, flip = false): ReactElement[] {
  const out: ReactElement[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = SPRITE_PALETTE[ch];
      if (!fill) return;
      const px = flip ? ox + row.length - 1 - x : ox + x;
      out.push(<rect key={`${key}-${x}-${y}`} x={px} y={oy + y} width={1} height={1} fill={fill} />);
    });
  });
  return out;
}

/** Room slots in the cross-section: index matches ROOMS order. */
const SLOTS: Record<string, { x: number; y: number }> = {
  pantry: { x: 8, y: 66 },
  library: { x: 70, y: 66 },
  lookout: { x: 132, y: 66 },
  workshop: { x: 8, y: 104 },
  nursery: { x: 70, y: 104 },
  dock: { x: 132, y: 104 },
};
const RW = 52;
const RH = 28;

const CHOICE_ROOM: Record<Choice, string> = { forage: 'pantry', fortify: 'workshop', research: 'library' };

function furniture(id: string, level: number, x: number, y: number): Px[] {
  const floorY = y + RH - 3;
  const px: Px[] = [];
  if (level <= 0) {
    for (let i = 0; i < 6; i++) px.push([x + 6 + i * 7, floorY - (i % 2) * 2 - 2, 5, 2 + (i % 2) * 2, C.rubble]);
    return px;
  }
  switch (id) {
    case 'pantry':
      for (let i = 0; i < level; i++) {
        const sx = x + 4 + i * 9;
        px.push([sx, floorY - 7, 7, 7, C.sack], [sx + 2, floorY - 9, 3, 2, C.woodDark], [sx + 1, floorY - 4, 5, 1, C.furDark]);
      }
      break;
    case 'library':
      for (let s = 0; s < Math.min(level, 3); s++) {
        const sy = floorY - 6 - s * 7;
        px.push([x + 4, sy + 5, 22, 1, C.wood]);
        const colors = [C.bookA, C.bookB, C.bookC];
        for (let b = 0; b < 6; b++) px.push([x + 5 + b * 3, sy, 2, 5, colors[(b + s) % 3]]);
      }
      if (level >= 4) px.push([x + 30, floorY - 8, 12, 2, C.wood], [x + 32, floorY - 6, 1, 6, C.woodDark], [x + 39, floorY - 6, 1, 6, C.woodDark]);
      if (level >= 5) px.push([x + 33, floorY - 11, 6, 3, C.belly]);
      break;
    case 'lookout':
      // Periscope pipe climbs to the surface; taller with each level.
      px.push([x + 40, GROUND - 2 - level * 2, 3, y - GROUND + 6 + level * 2, C.metal]);
      px.push([x + 40, GROUND - 4 - level * 2, 6, 3, C.metal], [x + 44, GROUND - 3 - level * 2, 2, 1, C.bookB]);
      px.push([x + 36, floorY - 8, 10, 8, C.wood], [x + 38, floorY - 10, 6, 2, C.metal]);
      for (let i = 0; i < level; i++) px.push([x + 4 + i * 6, y + 6, 4, 3, C.bookB]);
      break;
    case 'workshop':
      px.push([x + 4, floorY - 6, 26, 2, C.wood], [x + 5, floorY - 4, 2, 4, C.woodDark], [x + 27, floorY - 4, 2, 4, C.woodDark]);
      for (let i = 0; i < level; i++) px.push([x + 6 + i * 5, y + 5, 1, 6, C.metal], [x + 5 + i * 5, y + 5, 3, 2, C.metal]);
      break;
    case 'nursery':
      for (let i = 0; i < level; i++) {
        const bx = x + 3 + i * 9;
        px.push([bx, floorY - 3, 8, 3, C.wood], [bx + 1, floorY - 4, 6, 1, C.belly], [bx + 1, floorY - 5, 2, 1, C.ear]);
      }
      break;
    case 'dock':
      for (let i = 0; i < level; i++) {
        const stack = i % 2;
        const cx = x + 4 + Math.floor(i / 2) * 9;
        px.push([cx, floorY - 7 - stack * 7, 7, 7, C.wood], [cx + 1, floorY - 6 - stack * 7, 5, 1, C.woodDark]);
      }
      px.push([x + 34, y + 5, 12, 8, C.sack], [x + 36, y + 7, 3, 1, C.bookA], [x + 40, y + 9, 4, 1, C.bookB]);
      break;
  }
  return px;
}

interface SceneProps {
  levels: number[];
  shields: number[];
  latest: Resolution | null;
  wheelActive: boolean;
  wheelKnown: boolean;
  label: string;
}

function SceneImpl({ levels, shields, latest, wheelActive, wheelKnown, label }: SceneProps) {
  const bg: Px[] = [
    [0, 0, W, 18, C.sky0],
    [0, 18, W, 18, C.sky1],
    [0, 36, W, GROUND - 36, C.sky2],
    [0, GROUND, W, 3, C.grass0],
    [0, GROUND + 3, W, 2, C.grass1],
    [0, GROUND + 5, W, 30, C.soil0],
    [0, GROUND + 35, W, 30, C.soil1],
    [0, GROUND + 65, W, H - GROUND - 65, C.soil2],
    [24, 8, 6, 6, C.moon],
    [25, 7, 4, 1, C.moon],
    [25, 14, 4, 1, C.moon],
    [27, 9, 3, 3, C.sky0],
  ];
  for (const [sx, sy] of STARS) bg.push([sx, sy, 1, 1, C.star]);
  // Grass tufts and pebbles.
  for (let i = 0; i < 24; i++) bg.push([(i * 23) % W, GROUND - 1, 1, 1, C.grass0]);
  for (let i = 0; i < 18; i++) bg.push([(i * 37 + 11) % W, GROUND + 10 + ((i * 29) % 70), 2, 1, C.pebble]);

  // Burrow entrance shaft from the surface to the library.
  const shaft: Px[] = [
    [88, GROUND - 3, 16, 3, C.soil0],
    [92, GROUND, 8, 14, C.room],
    [91, GROUND, 1, 14, C.roomWall],
    [100, GROUND, 1, 14, C.roomWall],
  ];
  for (let ly = GROUND + 2; ly < GROUND + 14; ly += 3) shaft.push([93, ly, 6, 1, C.woodDark]);
  // Tunnels between rooms.
  const tunnels: Px[] = [
    [60, 66 + 16, 10, 8, C.room],
    [122, 66 + 16, 10, 8, C.room],
    [60, 104 + 16, 10, 8, C.room],
    [122, 104 + 16, 10, 8, C.room],
    [92, 94, 8, 10, C.room],
    [184, 104 + 16, 8, 8, C.room],
  ];

  // Wheel stand.
  const stand: Px[] = [
    ...line(WHEEL.cx, WHEEL.cy, WHEEL.cx - 12, GROUND - 1).map(([x, y]): Px => [x, y, 2, 1, C.stand]),
    ...line(WHEEL.cx, WHEEL.cy, WHEEL.cx + 12, GROUND - 1).map(([x, y]): Px => [x, y, 2, 1, C.stand]),
    [WHEEL.cx - 15, GROUND - 1, 31, 1, C.woodDark],
    [WHEEL.cx - 1, WHEEL.cy - 1, 3, 3, C.metal],
  ];

  const roomEls: ReactElement[] = [];
  const crewByRoom: Record<string, { id: string }[]> = {};
  if (latest) {
    for (const m of latest.members) {
      const room = CHOICE_ROOM[m.choice];
      (crewByRoom[room] ??= []).push({ id: m.memberId });
    }
  }

  ROOMS.forEach((room, i) => {
    const slot = SLOTS[room.id];
    const lvl = levels[i] ?? 0;
    const sh = shields[i] ?? 0;
    const ev = latest?.roomEvents.find((e) => e.roomIndex === i);
    const px: Px[] = [
      [slot.x - 1, slot.y - 1, RW + 2, RH + 2, C.roomWall],
      [slot.x, slot.y, RW, RH, C.room],
      [slot.x, slot.y + RH - 3, RW, 3, C.floor],
      [slot.x + RW - 8, slot.y + 2, 3, 3, lvl > 0 ? C.lamp : C.rubble],
      ...furniture(room.id, lvl, slot.x, slot.y),
    ];
    // Shield planks along the ceiling.
    for (let s = 0; s < Math.min(sh, 4); s++) px.push([slot.x + 2 + s * 12, slot.y - 1, 10, 2, C.wood], [slot.x + 2 + s * 12, slot.y + 1, 10, 1, C.woodDark]);
    // Level pips under the room.
    for (let p = 0; p < 5; p++) px.push([slot.x + 2 + p * 4, slot.y + RH + 2, 3, 2, p < lvl ? C.lamp : C.roomWall]);
    if (ev?.type === 'damaged') {
      px.push(...line(slot.x + 18, slot.y, slot.x + 24, slot.y + 10).map(([x, y]): Px => [x, y, 1, 1, C.crack]));
      px.push(...line(slot.x + 24, slot.y + 10, slot.x + 20, slot.y + 16).map(([x, y]): Px => [x, y, 1, 1, C.crack]));
    }
    if (ev?.type === 'upgraded') {
      for (const [sx, sy] of [[6, 4], [14, 2], [22, 5]]) px.push([slot.x + sx, slot.y + sy, 1, 3, C.spark], [slot.x + sx - 1, slot.y + sy + 1, 3, 1, C.spark]);
    }
    roomEls.push(<g key={room.id}>{rects(px, `${room.id}-`)}</g>);
    const crew = crewByRoom[room.id] ?? [];
    crew.slice(0, 6).forEach((m, k) => {
      const hx = slot.x + 22 + (k % 3) * 8 - (room.id === 'library' ? 0 : 0);
      const hy = slot.y + RH - 8 - Math.floor(k / 3) * 6;
      roomEls.push(
        <g key={`${room.id}-crew-${m.id}`} className={k % 2 ? 'bob bob-late' : 'bob'}>
          {sprite(m.id === YOU_ID ? SMALL_HAMSTER_YOU : SMALL_HAMSTER, hx, hy, `${room.id}-${m.id}`, k % 2 === 1)}
        </g>,
      );
    });
  });

  return (
    <svg
      className="scene"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
    >
      {rects(bg, 'bg')}
      {rects(shaft, 'sh')}
      {rects(tunnels, 'tn')}
      {rects(stand, 'st')}
      <g className={wheelActive ? 'wheel spinning' : 'wheel'}>
        {RIM.map(([x, y]) => (
          <rect key={`r${x}-${y}`} x={x} y={y} width={1} height={1} fill={C.rim} />
        ))}
        {SPOKES.map(([x, y], i) => (
          <rect key={`s${i}`} x={x} y={y} width={1} height={1} fill={C.spoke} />
        ))}
      </g>
      {wheelActive ? (
        <g className="bob">{sprite(WHEEL_HAMSTER, WHEEL.cx - 5, WHEEL.cy + WHEEL.r - 8, 'wh')}</g>
      ) : (
        <g>
          {sprite(SLEEP_HAMSTER, WHEEL.cx - 5, WHEEL.cy + WHEEL.r - 8, 'sl')}
          {wheelKnown &&
            rects(
              [
                [WHEEL.cx + 8, WHEEL.cy + 6, 3, 1, C.star],
                [WHEEL.cx + 10, WHEEL.cy + 7, 1, 1, C.star],
                [WHEEL.cx + 8, WHEEL.cy + 8, 3, 1, C.star],
                [WHEEL.cx + 12, WHEEL.cy + 2, 2, 1, C.star],
                [WHEEL.cx + 13, WHEEL.cy + 3, 1, 1, C.star],
                [WHEEL.cx + 12, WHEEL.cy + 4, 2, 1, C.star],
              ],
              'zz',
            )}
        </g>
      )}
      {roomEls}
    </svg>
  );
}

export const Scene = memo(SceneImpl);

export function sceneLabel(levels: number[], shields: number[], wheel: string, latest: Resolution | null): string {
  const rooms = ROOMS.map((r, i) => `${r.name} level ${levels[i]}${shields[i] ? `, ${shields[i]} shields` : ''}`).join('; ');
  const crew = latest
    ? ` After the last settlement the crew split: ${(['forage', 'fortify', 'research'] as Choice[])
        .map((c) => `${latest.members.filter((m) => m.choice === c).length} ${CHOICE_LABEL[c]}`)
        .join(', ')}.`
    : '';
  return `Colony cross-section under the hamster wheel. The wheel is ${wheel}. ${rooms}.${crew}`;
}
