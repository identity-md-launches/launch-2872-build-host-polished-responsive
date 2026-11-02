import type { Settlement } from './engine';

/** Public, keyless Squeekchain API. Documented at https://docs.squeekchain.com/developers/api/ */
export const API_BASE = 'https://api.squeekchain.com';
export const DOCS_URL = 'https://docs.squeekchain.com/developers/api/';
export const ROUNDS_DOCS_URL = 'https://docs.squeekchain.com/system/rounds-and-blocks/';
export const EXPLORER_TX = 'https://sepolia.etherscan.io/tx/';
export const SETTLEMENTS_URL = `${API_BASE}/v1/events?category=protocol&limit=100`;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
  }
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { signal: controller.signal, headers: { accept: 'application/json' } });
  } catch {
    throw new ApiError('The Squeekchain API could not be reached. Check your connection, then try again.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new ApiError('The Squeekchain API asked us to slow down. Trying again shortly.');
  if (!res.ok) throw new ApiError(`The Squeekchain API answered ${res.status}. Try again in a minute.`);
  try {
    return await res.json();
  } catch {
    throw new ApiError('The Squeekchain API sent a response that is not valid JSON.');
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isUint = (v: unknown): v is string => typeof v === 'string' && /^\d{1,30}$/.test(v);

/* ---------- /v1/core ---------- */

export interface CoreInfo {
  genesisSeconds: number;
  roundSeconds: number;
  settledThroughRound: number | null;
  installationId: string;
}

export async function fetchCore(signal?: AbortSignal): Promise<CoreInfo> {
  const d = await getJson('/v1/core', signal);
  if (!isObj(d) || !isObj(d.configuration)) throw new ApiError('SqueekCore state is missing its configuration.');
  const cfg = d.configuration;
  if (!isUint(cfg.genesisTimestamp) || !isUint(cfg.roundDuration)) {
    throw new ApiError('SqueekCore state did not include a genesis time.');
  }
  const core = isObj(d.core) ? d.core : {};
  return {
    genesisSeconds: Number(cfg.genesisTimestamp),
    roundSeconds: Number(cfg.roundDuration),
    settledThroughRound: isUint(core.settledThroughRound) ? Number(core.settledThroughRound) : null,
    installationId: typeof d.installationId === 'string' ? d.installationId : 'unknown',
  };
}

/* ---------- /v1/status ---------- */

export interface LiveStatus {
  generatedAt: string;
  freshness: 'online' | 'stale' | 'unknown';
  coreStatus: 'IDLE' | 'ACTIVE' | 'COUNTER_FAULT' | 'unknown';
  rpm: number | null;
  /** Provisional passes in the open round. Not authoritative. */
  openRoundPasses: number | null;
  settledThroughRound: number | null;
}

export async function fetchStatus(signal?: AbortSignal): Promise<LiveStatus> {
  const d = await getJson('/v1/status', signal);
  if (!isObj(d) || typeof d.generatedAt !== 'string') throw new ApiError('Pipeline status had an unexpected shape.');
  const m = isObj(d.measurement) ? d.measurement : null;
  const b = isObj(d.builder) && d.builder.status === 'available' ? d.builder : null;
  const queued = b && isObj(b.queued) ? b.queued : null;
  const anchor = b && isObj(b.anchor) ? b.anchor : null;
  const freshness = m?.freshness === 'online' || m?.freshness === 'stale' ? m.freshness : 'unknown';
  const cs = m?.coreStatus;
  return {
    generatedAt: d.generatedAt,
    freshness,
    coreStatus: cs === 'IDLE' || cs === 'ACTIVE' || cs === 'COUNTER_FAULT' ? cs : 'unknown',
    rpm: typeof m?.rpmMilli === 'number' ? Math.round(m.rpmMilli / 1000) : null,
    openRoundPasses: queued && isUint(queued.openRoundWorkUnits) ? Number(queued.openRoundWorkUnits) : null,
    settledThroughRound: anchor && isUint(anchor.settledThroughRound) ? Number(anchor.settledThroughRound) : null,
  };
}

/* ---------- settlements from /v1/events?category=protocol ---------- */

export function parseSettlementEvent(e: unknown): Settlement | null {
  if (!isObj(e) || e.type !== 'system.settlement_completed') return null;
  const p = e.payload;
  const src = e.source;
  if (!isObj(p) || !isObj(src)) return null;
  if (!isUint(p.previousSettledThroughRound) || !isUint(p.settledThroughRound) || !isUint(p.workAdded)) return null;
  if (typeof src.transactionHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(src.transactionHash)) return null;
  const fromRound = Number(p.previousSettledThroughRound) + 1;
  const toRound = Number(p.settledThroughRound);
  if (toRound < fromRound) return null;
  return {
    fromRound,
    toRound,
    passes: Number(p.workAdded),
    activeRounds: isUint(p.activeRoundCount) ? Number(p.activeRoundCount) : 0,
    txHash: src.transactionHash,
    ethBlock: isUint(src.blockNumber) ? src.blockNumber : '',
    occurredAt: typeof e.occurredAt === 'string' ? e.occurredAt : '',
    blockHeight: isUint(p.blockHeight) ? p.blockHeight : '',
  };
}

export interface SettlementPage {
  settlements: Settlement[];
  nextCursor: string | null;
}

export async function fetchSettlementPage(cursor: string | null, limit = 100, signal?: AbortSignal): Promise<SettlementPage> {
  const q = `/v1/events?category=protocol&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const d = await getJson(q, signal);
  if (!isObj(d)) throw new ApiError('The event feed had an unexpected shape.');
  if (d.status === 'unavailable') {
    throw new ApiError('The Squeekchain event feed is temporarily unavailable. Settled rounds will appear when it returns.');
  }
  if (!Array.isArray(d.events)) throw new ApiError('The event feed did not include an events list.');
  const settlements = d.events.map(parseSettlementEvent).filter((s): s is Settlement => s !== null);
  return { settlements, nextCursor: typeof d.nextCursor === 'string' && d.events.length > 0 ? d.nextCursor : null };
}

/** Merge by settlement key (toRound), newest data wins. */
export function mergeSettlements(a: Settlement[], b: Settlement[]): Settlement[] {
  const map = new Map<number, Settlement>();
  for (const s of a) map.set(s.toRound, s);
  for (const s of b) map.set(s.toRound, s);
  return [...map.values()].sort((x, y) => y.toRound - x.toRound);
}

/**
 * Lowest round covered by an unbroken chain of settlements ending at the newest one.
 * Settlements link: each one's fromRound is the previous one's toRound + 1.
 */
export function contiguousFrom(items: Settlement[]): number | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((x, y) => y.toRound - x.toRound);
  let low = sorted[0].fromRound;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].toRound !== low - 1) break;
    low = sorted[i].fromRound;
  }
  return low;
}

/**
 * Fetch newest-first until the chain of settlements reaches `needFrom`,
 * reusing `cached` where the new pages link up with it.
 */
export async function syncSettlements(
  cached: Settlement[],
  needFrom: number,
  onProgress?: (items: Settlement[]) => void,
  signal?: AbortSignal,
): Promise<Settlement[]> {
  let items = cached;
  let cursor: string | null = null;
  for (let page = 0; page < 30; page++) {
    const res = await fetchSettlementPage(cursor, 100, signal);
    items = mergeSettlements(items, res.settlements);
    onProgress?.(items);
    const low = contiguousFrom(items);
    if (low !== null && low <= needFrom) break;
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return items;
}

/* ---------- local storage ---------- */

const CACHE_KEY = 'squeek-colony:settlements:v1';
const CHOICES_KEY = 'squeek-colony:choices:v1';

export function loadCache(): Settlement[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is Settlement => isObj(s) && typeof s.toRound === 'number' && typeof s.fromRound === 'number' && typeof s.passes === 'number' && typeof s.txHash === 'string',
    );
  } catch {
    return [];
  }
}

export function saveCache(items: Settlement[], keepFrom: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items.filter((s) => s.toRound >= keepFrom)));
  } catch {
    /* storage full or blocked: the game still works without the cache */
  }
}

export function loadChoices(): Record<number, 'forage' | 'fortify' | 'research'> {
  try {
    const raw = localStorage.getItem(CHOICES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!isObj(parsed)) return {};
    const out: Record<number, 'forage' | 'fortify' | 'research'> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (/^\d+$/.test(k) && (v === 'forage' || v === 'fortify' || v === 'research')) out[Number(k)] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveChoices(choices: Record<number, string>): boolean {
  try {
    localStorage.setItem(CHOICES_KEY, JSON.stringify(choices));
    return true;
  } catch {
    return false;
  }
}
