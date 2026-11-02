/*
 * Squeek Colony resolution engine.
 *
 * Pure and deterministic: the same settlements and the same choices always
 * produce the same colony. Nothing here reads the clock, the network or storage.
 */

export type Choice = 'forage' | 'fortify' | 'research';
export type Kind = 'nap' | 'jog' | 'zoomies';

export const CHOICES: Choice[] = ['forage', 'fortify', 'research'];
export const ROUND_SECONDS = 600;
/** One season is 432 rounds: three days of ten-minute rounds. */
export const SEASON_ROUNDS = 432;
export const MAX_LEVEL = 5;
export const ZOOMIES_AT = 500;
export const RULES_VERSION = 'v1';

/** One official settlement, as published by the Squeekchain API. */
export interface Settlement {
  /** First round settled (previousSettledThroughRound + 1). */
  fromRound: number;
  /** Last round settled (settledThroughRound). Also the settlement's key. */
  toRound: number;
  /** Accepted wheel passages (work units) added by this settlement. */
  passes: number;
  activeRounds: number;
  txHash: string;
  ethBlock: string;
  occurredAt: string;
  blockHeight: string;
}

export interface Room {
  id: RoomId;
  name: string;
  effect: string;
}

export type RoomId = 'pantry' | 'workshop' | 'library' | 'nursery' | 'dock' | 'lookout';

export const ROOMS: Room[] = [
  { id: 'pantry', name: 'Pantry', effect: '+1 seed on every Forage per level' },
  { id: 'workshop', name: 'Workshop', effect: '+1 shield per Fortify for every 2 levels' },
  { id: 'library', name: 'Library', effect: '+1 idea on every Research per level' },
  { id: 'nursery', name: 'Nursery', effect: '+1 to every yield for every 2 levels' },
  { id: 'dock', name: 'Expedition dock', effect: 'Bigger Zoomies expeditions and more relics' },
  { id: 'lookout', name: 'Lookout', effect: 'Each level cuts the Zoomies damage chance by 5 points' },
];

export interface Member {
  id: string;
  name: string;
  /** Weights for forage, fortify, research. Only used for neighbour burrows. */
  leaning: [number, number, number];
}

export const YOU_ID = 'you';

/** Neighbour burrows: seeded colonists whose choices come from the round ID alone. */
export const NEIGHBOURS: Member[] = [
  { id: 'pip', name: "Pip's Den", leaning: [5, 2, 2] },
  { id: 'bramble', name: 'Bramble Hollow', leaning: [2, 5, 2] },
  { id: 'clover', name: 'Clover Nook', leaning: [2, 2, 5] },
  { id: 'acorn', name: 'Acorn Row', leaning: [3, 3, 3] },
  { id: 'thistle', name: 'Thistle Burrow', leaning: [4, 1, 3] },
  { id: 'moss', name: 'Mossy Hollow', leaning: [1, 4, 3] },
  { id: 'sunny', name: 'Sunflower Loft', leaning: [3, 2, 4] },
];

export const MEMBERS: Member[] = [{ id: YOU_ID, name: 'Your burrow', leaning: [1, 1, 1] }, ...NEIGHBOURS];

/* ---------- deterministic randomness ---------- */

/** FNV-1a 32-bit hash of a string. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, well-known 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed text for a settlement: public round range plus its official passes. */
export function seedText(s: Pick<Settlement, 'fromRound' | 'toRound' | 'passes'>): string {
  return `squeek-colony:${RULES_VERSION}:rounds:${s.fromRound}-${s.toRound}:passes:${s.passes}`;
}

/** Seed for neighbour choices. Uses only the round, so it is fixed before the result exists. */
export function crewSeedText(round: number): string {
  return `squeek-colony:${RULES_VERSION}:crew:${round}`;
}

export function classify(passes: number): Kind {
  if (passes <= 0) return 'nap';
  if (passes < ZOOMIES_AT) return 'jog';
  return 'zoomies';
}

export const KIND_LABEL: Record<Kind, string> = { nap: 'Nap', jog: 'Jog', zoomies: 'Zoomies' };
export const CHOICE_LABEL: Record<Choice, string> = { forage: 'Forage', fortify: 'Fortify', research: 'Research' };

/** Which choice a result favours. Zoomies favour Forage too: foragers go on expeditions. */
export const FAVOURED: Record<Kind, Choice> = { nap: 'research', jog: 'forage', zoomies: 'forage' };

export function seasonOf(round: number): number {
  return Math.floor((Math.max(1, round) - 1) / SEASON_ROUNDS) + 1;
}

export function seasonRange(season: number): { first: number; last: number } {
  const first = (season - 1) * SEASON_ROUNDS + 1;
  return { first, last: first + SEASON_ROUNDS - 1 };
}

export function upgradeCost(level: number): { seeds: number; ideas: number } {
  const step = (level + 1) * (level + 1);
  return { seeds: 30 * step, ideas: 60 * step };
}

export function neighbourChoice(member: Member, round: number): Choice {
  const rng = mulberry32(hash32(`${crewSeedText(round)}:${member.id}`));
  const total = member.leaning[0] + member.leaning[1] + member.leaning[2];
  let roll = rng() * total;
  for (let i = 0; i < 3; i++) {
    roll -= member.leaning[i];
    if (roll < 0) return CHOICES[i];
  }
  return 'research';
}

/* ---------- state ---------- */

export interface ColonyState {
  season: number;
  seeds: number;
  ideas: number;
  levels: number[];
  shields: number[];
  points: Record<string, number>;
  favouredPicks: Record<string, number>;
  played: Record<string, number>;
  expeditions: number;
  relics: number;
  settledThrough: number | null;
}

export function initialState(season: number): ColonyState {
  const zero = () => Object.fromEntries(MEMBERS.map((m) => [m.id, 0]));
  return {
    season,
    seeds: 0,
    ideas: 0,
    levels: ROOMS.map(() => 1),
    shields: ROOMS.map(() => 0),
    points: zero(),
    favouredPicks: zero(),
    played: zero(),
    expeditions: 0,
    relics: 0,
    settledThrough: null,
  };
}

export interface MemberOutcome {
  memberId: string;
  choice: Choice;
  /** The round this choice was made for. */
  round: number;
  favoured: boolean;
  seeds: number;
  ideas: number;
  shields: number;
  points: number;
  relic: boolean;
}

export interface RoomEvent {
  roomIndex: number;
  type: 'held' | 'damaged' | 'upgraded';
  level: number;
}

export interface Resolution {
  settlement: Settlement;
  kind: Kind;
  seed: string;
  seedHash: number;
  members: MemberOutcome[];
  roomEvents: RoomEvent[];
  seedsAfter: number;
  ideasAfter: number;
  levelsAfter: number[];
  shieldsAfter: number[];
}

/** The player's choice that applies to a settlement: their latest pick inside its round range. */
export function choiceForSettlement(
  choices: Record<number, Choice>,
  s: Pick<Settlement, 'fromRound' | 'toRound'>,
): { round: number; choice: Choice } | null {
  for (let r = s.toRound; r >= s.fromRound; r--) {
    const c = choices[r];
    if (c) return { round: r, choice: c };
  }
  return null;
}

function cloneState(s: ColonyState): ColonyState {
  return {
    ...s,
    levels: [...s.levels],
    shields: [...s.shields],
    points: { ...s.points },
    favouredPicks: { ...s.favouredPicks },
    played: { ...s.played },
  };
}

const idx = (id: RoomId) => ROOMS.findIndex((r) => r.id === id);
const PANTRY = idx('pantry');
const WORKSHOP = idx('workshop');
const LIBRARY = idx('library');
const NURSERY = idx('nursery');
const DOCK = idx('dock');
const LOOKOUT = idx('lookout');

/** Resolve one official settlement against the colony. Returns the new state and a full record. */
export function resolveSettlement(
  prev: ColonyState,
  settlement: Settlement,
  yourChoice: { round: number; choice: Choice } | null,
): { state: ColonyState; resolution: Resolution } {
  const state = cloneState(prev);
  state.shields = state.shields.map(() => 0);
  const kind = classify(settlement.passes);
  const seed = seedText(settlement);
  const seedHash = hash32(seed);
  const rng = mulberry32(seedHash);
  const favouredChoice = FAVOURED[kind];
  const nurseryBonus = Math.floor(state.levels[NURSERY] / 2);

  const crew: { memberId: string; choice: Choice; round: number }[] = [];
  if (yourChoice) crew.push({ memberId: YOU_ID, ...yourChoice });
  for (const n of NEIGHBOURS) {
    crew.push({ memberId: n.id, choice: neighbourChoice(n, settlement.toRound), round: settlement.toRound });
  }

  const members: MemberOutcome[] = [];
  for (const c of crew) {
    const out: MemberOutcome = {
      memberId: c.memberId,
      choice: c.choice,
      round: c.round,
      favoured: c.choice === favouredChoice,
      seeds: 0,
      ideas: 0,
      shields: 0,
      points: 0,
      relic: false,
    };
    if (c.choice === 'forage') {
      const base = 2 + state.levels[PANTRY] + nurseryBonus;
      if (kind === 'jog') {
        out.seeds = base * 3;
      } else if (kind === 'zoomies') {
        // Expedition: a big haul that grows with the dock and with the official passes.
        out.seeds = base * 2 + 2 * state.levels[DOCK] + Math.floor(Math.min(settlement.passes, 5000) / 250);
        if (rng() < 0.2 + 0.08 * state.levels[DOCK]) {
          out.relic = true;
          out.ideas = 4;
        }
      } else {
        out.seeds = base;
      }
    } else if (c.choice === 'fortify') {
      out.shields = 1 + Math.floor(state.levels[WORKSHOP] / 2);
    } else {
      const base = 2 + state.levels[LIBRARY] + nurseryBonus;
      out.ideas = kind === 'nap' ? base * 3 : base;
    }
    out.points = out.seeds + out.ideas + out.shields * 3 + (out.favoured ? 5 : 0) + (out.relic ? 5 : 0);
    members.push(out);
  }

  // Add yields to the shared stores.
  for (const m of members) {
    state.seeds += m.seeds;
    state.ideas += m.ideas;
    state.points[m.memberId] = (state.points[m.memberId] ?? 0) + m.points;
    state.played[m.memberId] = (state.played[m.memberId] ?? 0) + 1;
    if (m.favoured) state.favouredPicks[m.memberId] = (state.favouredPicks[m.memberId] ?? 0) + 1;
    if (m.relic) state.relics += 1;
    // Shields last for this settlement only. Each goes to the highest-level unshielded room, lowest index first.
    for (let i = 0; i < m.shields; i++) {
      let target = -1;
      for (let r = 0; r < state.shields.length; r++) {
        if (state.shields[r] > 0) continue;
        if (target === -1 || state.levels[r] > state.levels[target]) target = r;
      }
      if (target === -1) break;
      state.shields[target] = 1;
    }
  }
  if (kind === 'zoomies' && members.some((m) => m.choice === 'forage')) state.expeditions += 1;

  const roomEvents: RoomEvent[] = [];
  // Zoomies shake the burrow: a shield absorbs the shake, otherwise the room may lose a level.
  if (kind === 'zoomies') {
    const damageChance = Math.max(0.05, 0.3 - 0.05 * state.levels[LOOKOUT]);
    for (let r = 0; r < ROOMS.length; r++) {
      if (state.shields[r] > 0) {
        roomEvents.push({ roomIndex: r, type: 'held', level: state.levels[r] });
      } else if (state.levels[r] > 0 && rng() < damageChance) {
        state.levels[r] -= 1;
        roomEvents.push({ roomIndex: r, type: 'damaged', level: state.levels[r] });
      }
    }
  }

  // Build: at most one upgrade per settlement, lowest level first, seeded tie-break.
  const affordable = ROOMS.map((_, r) => r).filter((r) => {
    if (state.levels[r] >= MAX_LEVEL) return false;
    const cost = upgradeCost(state.levels[r]);
    return state.seeds >= cost.seeds && state.ideas >= cost.ideas;
  });
  if (affordable.length > 0) {
    const lowest = Math.min(...affordable.map((r) => state.levels[r]));
    const pool = affordable.filter((r) => state.levels[r] === lowest);
    const pick = pool[Math.floor(rng() * pool.length)];
    const cost = upgradeCost(state.levels[pick]);
    state.seeds -= cost.seeds;
    state.ideas -= cost.ideas;
    state.levels[pick] += 1;
    roomEvents.push({ roomIndex: pick, type: 'upgraded', level: state.levels[pick] });
  }

  state.settledThrough = settlement.toRound;
  return {
    state,
    resolution: {
      settlement,
      kind,
      seed,
      seedHash,
      members,
      roomEvents,
      seedsAfter: state.seeds,
      ideasAfter: state.ideas,
      levelsAfter: [...state.levels],
      shieldsAfter: [...state.shields],
    },
  };
}

/**
 * Replay a season from its first round. Settlements outside the season are ignored;
 * a settlement that starts before the season but ends inside it belongs to the season.
 */
export function replaySeason(
  season: number,
  settlements: Settlement[],
  choices: Record<number, Choice>,
): { state: ColonyState; resolutions: Resolution[] } {
  const { first, last } = seasonRange(season);
  const ordered = settlements
    .filter((s) => s.toRound >= first && s.toRound <= last)
    .sort((a, b) => a.toRound - b.toRound);
  let state = initialState(season);
  const resolutions: Resolution[] = [];
  for (const s of ordered) {
    const r = resolveSettlement(state, s, choiceForSettlement(choices, s));
    state = r.state;
    resolutions.push(r.resolution);
  }
  return { state, resolutions };
}

export function roundAt(timeMs: number, genesisSeconds: number): number {
  return Math.floor((timeMs / 1000 - genesisSeconds) / ROUND_SECONDS) + 1;
}

export function roundEndsAt(round: number, genesisSeconds: number): number {
  return (genesisSeconds + round * ROUND_SECONDS) * 1000;
}
