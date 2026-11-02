import { describe, expect, it } from 'vitest';
import { contiguousFrom, mergeSettlements, parseSettlementEvent } from '../src/api';
import {
  classify,
  choiceForSettlement,
  hash32,
  initialState,
  neighbourChoice,
  NEIGHBOURS,
  replaySeason,
  resolveSettlement,
  roundAt,
  seasonOf,
  seasonRange,
  seedText,
  type Settlement,
} from '../src/engine';

const mk = (round: number, passes: number, from = round): Settlement => ({
  fromRound: from,
  toRound: round,
  passes,
  activeRounds: passes > 0 ? 1 : 0,
  txHash: '0x' + round.toString(16).padStart(64, '0'),
  ethBlock: '1',
  occurredAt: '2026-11-02T00:00:00.000Z',
  blockHeight: '1',
});

describe('classification', () => {
  it('maps passes to Nap, Jog and Zoomies at the documented edges', () => {
    expect(classify(0)).toBe('nap');
    expect(classify(1)).toBe('jog');
    expect(classify(499)).toBe('jog');
    expect(classify(500)).toBe('zoomies');
    expect(classify(9999)).toBe('zoomies');
  });
});

describe('seeds', () => {
  it('builds the seed from the public round range and passes', () => {
    expect(seedText(mk(982, 0))).toBe('squeek-colony:v1:rounds:982-982:passes:0');
    expect(hash32('')).toBe(0x811c9dc5);
    expect(hash32('a')).toBe(0xe40c292c); // FNV-1a reference value
  });
  it('fixes neighbour choices from the round alone', () => {
    for (const n of NEIGHBOURS) expect(neighbourChoice(n, 900)).toBe(neighbourChoice(n, 900));
  });
});

describe('resolution', () => {
  it('is deterministic for the same settlement and choice', () => {
    const s = mk(950, 640);
    const a = resolveSettlement(initialState(3), s, { round: 950, choice: 'forage' });
    const b = resolveSettlement(initialState(3), s, { round: 950, choice: 'forage' });
    expect(a).toEqual(b);
  });
  it('triples Research on a Nap and Forage on a Jog', () => {
    const nap = resolveSettlement(initialState(3), mk(10, 0), { round: 10, choice: 'research' }).resolution;
    const you = nap.members.find((m) => m.memberId === 'you')!;
    expect(you.ideas).toBe((2 + 1) * 3);
    expect(you.favoured).toBe(true);
    const jog = resolveSettlement(initialState(3), mk(11, 120), { round: 11, choice: 'forage' }).resolution;
    const youJ = jog.members.find((m) => m.memberId === 'you')!;
    expect(youJ.seeds).toBe((2 + 1) * 3);
  });
  it('lets Zoomies damage only unshielded rooms, with shields from this round', () => {
    const start = initialState(3);
    start.shields = [1, 1, 1, 1, 1, 1]; // old shields must not carry over
    const { resolution } = resolveSettlement(start, mk(12, 3000), { round: 12, choice: 'fortify' });
    const shielded = resolution.shieldsAfter.reduce((a, b) => a + b, 0);
    const placed = resolution.members.reduce((a, m) => a + m.shields, 0);
    expect(shielded).toBe(Math.min(6, placed));
    const held = resolution.roomEvents.filter((e) => e.type === 'held').length;
    expect(held).toBe(shielded);
    for (const e of resolution.roomEvents.filter((x) => x.type === 'damaged')) {
      expect(resolution.shieldsAfter[e.roomIndex]).toBe(0);
    }
  });
  it('applies the latest choice inside a batched settlement', () => {
    expect(choiceForSettlement({ 5: 'forage', 7: 'research' }, { fromRound: 4, toRound: 8 })).toEqual({ round: 7, choice: 'research' });
    expect(choiceForSettlement({ 3: 'forage' }, { fromRound: 4, toRound: 8 })).toBeNull();
  });
  it('replays only settlements inside the season, in round order', () => {
    const { first } = seasonRange(2);
    const list = [mk(first + 1, 0), mk(first - 1, 50), mk(first, 300)];
    const { resolutions, state } = replaySeason(2, list, {});
    expect(resolutions.map((r) => r.settlement.toRound)).toEqual([first, first + 1]);
    expect(state.settledThrough).toBe(first + 1);
  });
});

describe('rounds and seasons', () => {
  it('numbers rounds from the genesis timestamp', () => {
    const g = 1793022600;
    expect(roundAt(g * 1000, g)).toBe(1);
    expect(roundAt((g + 599) * 1000, g)).toBe(1);
    expect(roundAt((g + 600) * 1000, g)).toBe(2);
    expect(seasonOf(432)).toBe(1);
    expect(seasonOf(433)).toBe(2);
  });
});

describe('api parsing', () => {
  it('parses a settlement event and checks chain continuity', () => {
    const ev = {
      type: 'system.settlement_completed',
      occurredAt: '2026-11-02T09:30:36.000Z',
      source: { transactionHash: '0x121be06ee155fc18e118492940c9dd825dff3f4a7719aca9bfc9bec5f3a60f45', blockNumber: '12047278' },
      payload: { previousSettledThroughRound: '981', settledThroughRound: '982', activeRoundCount: '0', workAdded: '0', blockHeight: '6808' },
    };
    const s = parseSettlementEvent(ev)!;
    expect(s).toMatchObject({ fromRound: 982, toRound: 982, passes: 0 });
    expect(parseSettlementEvent({ type: 'system.mining_checkpointed' })).toBeNull();
    const merged = mergeSettlements([mk(980, 0), mk(981, 3)], [mk(982, 0)]);
    expect(contiguousFrom(merged)).toBe(980);
    expect(contiguousFrom([mk(982, 0), mk(979, 0)])).toBe(982);
  });
});
