import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  contiguousFrom,
  fetchCore,
  fetchSettlementPage,
  fetchStatus,
  loadCache,
  loadChoices,
  mergeSettlements,
  saveCache,
  saveChoices,
  syncSettlements,
  type CoreInfo,
  type LiveStatus,
} from './api';
import { replaySeason, roundAt, roundEndsAt, seasonOf, seasonRange, type Choice, type Settlement } from './engine';

const STATUS_POLL_MS = 10_000;
const FEED_POLL_MS = 30_000;

export type LoadState = 'loading' | 'ready' | 'error';

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Something went wrong while reading Squeekchain. Try again in a minute.';
}

export function useColony() {
  const [core, setCore] = useState<CoreInfo | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>(() => loadCache());
  const [feedState, setFeedState] = useState<LoadState>('loading');
  const [feedError, setFeedError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>(() => loadChoices());
  const [storageOk, setStorageOk] = useState(true);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const settlementsRef = useRef(settlements);
  settlementsRef.current = settlements;

  // One-second tick for the countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadCore = useCallback(async () => {
    setCoreError(null);
    try {
      setCore(await fetchCore());
    } catch (e) {
      setCoreError(errMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  // Live status poll.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const sentAt = Date.now();
        const s = await fetchStatus();
        if (!alive) return;
        const receivedAt = Date.now();
        const serverMs = Date.parse(s.generatedAt);
        if (Number.isFinite(serverMs)) setClockOffset(serverMs - (sentAt + receivedAt) / 2);
        setStatus(s);
        setStatusError(null);
      } catch (e) {
        if (alive) setStatusError(errMessage(e));
      }
    };
    void run();
    const t = setInterval(run, STATUS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const serverNow = now + clockOffset;
  const currentRound = core ? roundAt(serverNow, core.genesisSeconds) : null;
  const season = currentRound ? seasonOf(currentRound) : null;
  const seasonFirst = season ? seasonRange(season).first : null;

  const fullSync = useCallback(async (needFrom: number) => {
    setFeedState((s) => (s === 'ready' ? s : 'loading'));
    setFeedError(null);
    try {
      const items = await syncSettlements(settlementsRef.current, needFrom, (partial) => setSettlements(partial));
      setSettlements(items);
      saveCache(items, needFrom - 1);
      setFeedState('ready');
    } catch (e) {
      setFeedError(errMessage(e));
      setFeedState('error');
    }
  }, []);

  // Initial sync, once we know which season we are in.
  useEffect(() => {
    if (seasonFirst !== null) void fullSync(seasonFirst);
  }, [seasonFirst, fullSync]);

  // Light refresh of the newest settlements; falls back to a full sync when the chain has a gap.
  useEffect(() => {
    if (seasonFirst === null) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const page = await fetchSettlementPage(null, 20);
        if (!alive) return;
        const merged = mergeSettlements(settlementsRef.current, page.settlements);
        const low = contiguousFrom(merged);
        if (low === null || low > seasonFirst) {
          void fullSync(seasonFirst);
          return;
        }
        setSettlements(merged);
        saveCache(merged, seasonFirst - 1);
        setFeedError(null);
        setFeedState('ready');
      } catch (e) {
        if (alive) setFeedError(errMessage(e));
      }
    }, FEED_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [seasonFirst, fullSync]);

  const replay = useMemo(() => {
    if (season === null) return null;
    return replaySeason(season, settlements, choices);
  }, [season, settlements, choices]);

  const settledThrough = useMemo(() => {
    const newest = settlements.reduce((m, s) => Math.max(m, s.toRound), 0);
    return Math.max(newest, status?.settledThroughRound ?? 0, core?.settledThroughRound ?? 0) || null;
  }, [settlements, status, core]);

  const choose = useCallback(
    (choice: Choice) => {
      if (currentRound === null) return;
      setChoices((prev) => {
        if (prev[currentRound]) return prev;
        const next = { ...prev, [currentRound]: choice };
        setStorageOk(saveChoices(next));
        return next;
      });
    },
    [currentRound],
  );

  const retry = useCallback(() => {
    if (!core) void loadCore();
    if (seasonFirst !== null) void fullSync(seasonFirst);
  }, [core, loadCore, seasonFirst, fullSync]);

  const msLeft = core && currentRound ? Math.max(0, roundEndsAt(currentRound, core.genesisSeconds) - serverNow) : null;

  return {
    core,
    coreError,
    status,
    statusError,
    settlements,
    feedState,
    feedError,
    choices,
    choose,
    storageOk,
    currentRound,
    msLeft,
    season,
    replay,
    settledThrough,
    retry,
  };
}

export type ColonyModel = ReturnType<typeof useColony>;
