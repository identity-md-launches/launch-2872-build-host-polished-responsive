import { describe, expect, it } from 'vitest';
import { initialState, replaySeason, resolveSettlement, seedText, type Choice, type Settlement } from '../src/engine';

// Synthetic data used only in tests; never supplied to the running game.
const settlement = (fromRound: number, toRound: number, passes = 0): Settlement => ({
  fromRound, toRound, passes, activeRounds: passes > 0 ? 1 : 0,
  txHash: `0x${toRound.toString(16).padStart(64, '0')}`,
  ethBlock: '1', occurredAt: '2026-11-01T00:00:00Z', blockHeight: '1',
});

describe('individual results from official settlement ranges', () => {
  it('resolves both reported choices in a zero-work batch, preserving their sources and seeds', () => {
    const batch = settlement(898, 899);
    const choices: Record<number, Choice> = { 898: 'forage', 899: 'research' };
    const result = replaySeason(3, [batch], choices);
    expect(result.state.played.you).toBe(2);
    expect(result.state.points.you).toBe(17); // 3 seeds + 9 ideas + 5 favoured points
    expect(result.resolutions.map((r) => r.members.find((m) => m.memberId === 'you'))).toEqual([
      expect.objectContaining({ round: 898, choice: 'forage', seeds: 3, points: 3 }),
      expect.objectContaining({ round: 899, choice: 'research', ideas: 9, points: 14 }),
    ]);
    for (const r of result.resolutions) {
      expect(r.kind).toBe('nap');
      expect(r.sourceSettlement).toEqual(batch);
      expect(r.seed).toBe(seedText(r.settlement));
      expect(r.settlement.fromRound).toBe(r.settlement.toRound);
    }
    expect(result.deferred).toEqual([]);
    expect(choices).toEqual({ 898: 'forage', 899: 'research' });
  });

  it('produces the same colony as separately certified zero-work rounds', () => {
    const choices: Record<number, Choice> = { 898: 'forage', 899: 'research' };
    const batch = replaySeason(3, [settlement(898, 899)], choices);
    const individual = replaySeason(3, [settlement(899, 899), settlement(898, 898)], choices);
    expect(batch.state).toEqual(individual.state);
    expect(batch.resolutions.map(({ sourceSettlement: _source, ...r }) => r)).toEqual(
      individual.resolutions.map((r) => ({ ...r, settlement: { ...r.settlement, txHash: settlement(898, 899).txHash } })),
    );
  });

  it('defers every choice in a positive batch, and later state-dependent rounds', () => {
    const earlier = settlement(897, 897);
    const batch = settlement(898, 899, 600);
    const later = settlement(900, 900, 100);
    const choices: Record<number, Choice> = { 898: 'forage', 899: 'research', 900: 'fortify' };
    const result = replaySeason(3, [later, batch, earlier], choices);
    expect(result.resolutions.map((r) => r.settlement.toRound)).toEqual([897]);
    expect(result.deferred).toEqual([batch, later]);
    expect(result.state).toEqual(replaySeason(3, [earlier], {}).state);
    expect(result.state.played.you).toBe(0);
    expect(choices).toEqual({ 898: 'forage', 899: 'research', 900: 'fortify' });
  });

  it('never treats an aggregate as an individual result, even for one saved move', () => {
    const batch = settlement(898, 899, 600);
    expect(replaySeason(3, [batch], { 899: 'forage' }).resolutions).toEqual([]);
    expect(() => resolveSettlement(initialState(3), batch, { round: 899, choice: 'forage' })).toThrow(/individual/);
  });

  it('requires zero work and zero active rounds to expand a span', () => {
    const inconsistent = { ...settlement(898, 899), activeRounds: 1 };
    expect(replaySeason(3, [inconsistent], {}).deferred).toEqual([inconsistent]);
  });

  it('clips a certified span at both season boundaries without losing in-season rounds', () => {
    const batch = settlement(432, 865);
    const result = replaySeason(2, [batch], { 432: 'forage', 433: 'research', 864: 'fortify', 865: 'research' });
    expect(result.resolutions).toHaveLength(432);
    expect(result.resolutions[0].settlement.toRound).toBe(433);
    expect(result.resolutions.at(-1)!.settlement.toRound).toBe(864);
    expect(result.state.played.you).toBe(2);
    expect(result.resolutions.every((r) => r.sourceSettlement === batch)).toBe(true);
  });

  it('leaves individual Nap, Jog and Zoomies rounds reproducible', () => {
    const events = [settlement(898, 898), settlement(899, 899, 499), settlement(900, 900, 500)];
    const choices: Record<number, Choice> = { 898: 'research', 899: 'forage', 900: 'fortify' };
    const result = replaySeason(3, events, choices);
    expect(result.resolutions.map((r) => r.kind)).toEqual(['nap', 'jog', 'zoomies']);
    expect(result.state.played.you).toBe(3);
    expect(result).toEqual(replaySeason(3, [...events].reverse(), choices));
  });
});
