import { useMemo, useRef, useState, type FormEvent } from 'react';
import { DOCS_URL, EXPLORER_TX, ROUNDS_DOCS_URL, SETTLEMENTS_URL } from './api';
import {
  CHOICES,
  CHOICE_LABEL,
  FAVOURED,
  KIND_LABEL,
  MAX_LEVEL,
  MEMBERS,
  ROOMS,
  SEASON_ROUNDS,
  YOU_ID,
  ZOOMIES_AT,
  seasonRange,
  upgradeCost,
  type Choice,
  type Resolution,
} from './engine';
import { Scene, sceneLabel } from './Scene';
import { useColony, type ColonyModel } from './useColony';

const CHOICE_HINT: Record<Choice, string> = {
  forage: 'Seeds, best on a Jog',
  fortify: 'Shields rooms this round',
  research: 'Ideas, best on a Nap',
};

const memberName = (id: string) => MEMBERS.find((m) => m.id === id)?.name ?? id;

function roundsLabel(r: Resolution): string {
  const s = r.settlement;
  return s.fromRound === s.toRound ? `Round ${s.toRound}` : `Rounds ${s.fromRound} to ${s.toRound}`;
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function shortHash(h: string): string {
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

function passesText(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'pass' : 'passes'}`;
}

function KindTag({ kind }: { kind: Resolution['kind'] }) {
  return <span className={`tag tag-${kind}`}>{KIND_LABEL[kind]}</span>;
}

function roomEventText(r: Resolution): string {
  if (r.roomEvents.length === 0) return 'No room changes.';
  return (
    r.roomEvents
      .map((e) => {
        const name = ROOMS[e.roomIndex].name;
        if (e.type === 'upgraded') return `${name} upgraded to level ${e.level}`;
        if (e.type === 'damaged') return `${name} damaged to level ${e.level}`;
        return `${name} held, one shield used`;
      })
      .join('. ') + '.'
  );
}

function yieldText(m: Resolution['members'][number]): string {
  const parts: string[] = [];
  if (m.seeds) parts.push(`${m.seeds} seeds`);
  if (m.ideas) parts.push(`${m.ideas} ideas`);
  if (m.shields) parts.push(`${m.shields} ${m.shields === 1 ? 'shield' : 'shields'}`);
  if (m.relic) parts.push('a relic');
  return parts.length ? parts.join(', ') : 'nothing';
}

/* ---------------- round panel ---------------- */

function RoundPanel({ model }: { model: ColonyModel }) {
  const { currentRound, msLeft, choices, choose, coreError, status, statusError, storageOk, retry, settledThrough } = model;
  const picked = currentRound ? choices[currentRound] : undefined;
  const pending = Object.keys(choices)
    .map(Number)
    .filter((r) => settledThrough === null || r > settledThrough)
    .filter((r) => r !== currentRound)
    .sort((a, b) => b - a)
    .slice(0, 3);

  if (coreError && currentRound === null) {
    return (
      <section className="panel round" aria-labelledby="round-title">
        <h2 id="round-title">Round unavailable</h2>
        <p className="error" role="alert">
          {coreError}
        </p>
        <p className="muted">The round clock comes from SqueekCore state, so choices open once it loads.</p>
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
      </section>
    );
  }

  const wheelText =
    status === null
      ? statusError
        ? 'Wheel status unknown'
        : 'Checking the wheel'
      : status.freshness === 'stale'
        ? 'Wheel sensor is quiet'
        : status.coreStatus === 'ACTIVE'
          ? `Wheel turning${status.rpm !== null ? ` at ${status.rpm} rpm` : ''}`
          : status.coreStatus === 'IDLE'
            ? 'Wheel idle'
            : status.coreStatus === 'COUNTER_FAULT'
              ? 'Wheel counter paused'
              : 'Wheel status unknown';

  return (
    <section className="panel round" aria-labelledby="round-title">
      <div className="round-head">
        <h2 id="round-title">{currentRound ? `Round ${currentRound}` : 'Loading round'}</h2>
        <p className="clock" aria-live="off">
          {msLeft !== null ? (
            <>
              <span className="num">{formatClock(msLeft)}</span> left
            </>
          ) : (
            'Reading the clock'
          )}
        </p>
      </div>
      <p className="live-line">
        <span className={`dot ${status?.coreStatus === 'ACTIVE' && status.freshness === 'online' ? 'dot-on' : ''}`} aria-hidden="true" />
        {wheelText}
        {status?.openRoundPasses !== null && status?.openRoundPasses !== undefined && (
          <span className="muted"> · {passesText(status.openRoundPasses)} so far, unofficial</span>
        )}
      </p>

      <fieldset className="choices" disabled={!currentRound || Boolean(picked)}>
        <legend>{picked ? 'Your choice is locked in' : 'Pick one free move for this round'}</legend>
        <div className="choice-row">
          {CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              className={`choice choice-${c}`}
              aria-pressed={picked === c}
              onClick={() => choose(c)}
            >
              <span className="choice-name">{CHOICE_LABEL[c]}</span>
              <span className="choice-hint">{CHOICE_HINT[c]}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="note" role="status">
        {picked
          ? `${CHOICE_LABEL[picked]} is set for round ${currentRound}. It resolves when Squeekchain settles the round.`
          : 'Results decide the bonus: Nap rewards Research, Jog rewards Forage.'}
      </p>
      {!storageOk && <p className="error">This browser blocked storage, so your choice lasts only while this tab is open.</p>}
      {pending.length > 0 && (
        <ul className="pending" aria-label="Choices waiting for settlement">
          {pending.map((r) => (
            <li key={r}>
              Round {r}: {CHOICE_LABEL[choices[r]]}, waiting for settlement
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- latest result ---------------- */

function LatestResult({ model }: { model: ColonyModel }) {
  const latest = model.replay?.resolutions.at(-1) ?? null;
  if (!latest) return null;
  const you = latest.members.find((m) => m.memberId === YOU_ID);
  return (
    <section className="latest" aria-labelledby="latest-title">
      <h2 id="latest-title" className="h-small">
        Last settlement
      </h2>
      <p>
        {roundsLabel(latest)} settled as <KindTag kind={latest.kind} /> with {passesText(latest.settlement.passes)}.{' '}
        {you ? `Your ${CHOICE_LABEL[you.choice]} brought ${yieldText(you)}.` : 'Your burrow sat it out.'}{' '}
        <a href={`${EXPLORER_TX}${latest.settlement.txHash}`} target="_blank" rel="noreferrer">
          View the settlement transaction
        </a>
      </p>
    </section>
  );
}

/* ---------------- feed state ---------------- */

function FeedNotice({ model }: { model: ColonyModel }) {
  const { feedState, feedError, settlements, retry } = model;
  if (feedError) {
    return (
      <div className="notice notice-error" role="alert">
        <p>
          {feedError}
          {settlements.length > 0 ? ` Showing ${settlements.length} settlements saved earlier on this device.` : ''}
        </p>
        <button type="button" className="btn btn-small" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (feedState === 'loading') {
    return (
      <p className="notice" role="status">
        Reading settled rounds from Squeekchain…
      </p>
    );
  }
  return null;
}

/* ---------------- rooms ---------------- */

function Rooms({ model }: { model: ColonyModel }) {
  const st = model.replay?.state;
  if (!st) return null;
  return (
    <section id="rooms" className="section" aria-labelledby="rooms-title">
      <h2 id="rooms-title">Colony rooms</h2>
      <dl className="stores">
        <div>
          <dt>Seeds</dt>
          <dd className="num">{st.seeds}</dd>
        </div>
        <div>
          <dt>Ideas</dt>
          <dd className="num">{st.ideas}</dd>
        </div>
        <div>
          <dt>Expeditions</dt>
          <dd className="num">{st.expeditions}</dd>
        </div>
        <div>
          <dt>Relics</dt>
          <dd className="num">{st.relics}</dd>
        </div>
      </dl>
      <ul className="room-list">
        {ROOMS.map((room, i) => {
          const lvl = st.levels[i];
          const cost = upgradeCost(lvl);
          return (
            <li key={room.id} className="room">
              <div className="room-top">
                <h3>{room.name}</h3>
                <span className="num">
                  Level {lvl} of {MAX_LEVEL}
                </span>
              </div>
              <div className="pips" aria-hidden="true">
                {Array.from({ length: MAX_LEVEL }, (_, p) => (
                  <span key={p} className={p < lvl ? 'pip on' : 'pip'} />
                ))}
              </div>
              <p>{room.effect}</p>
              <p className="muted">
                {lvl >= MAX_LEVEL ? 'Fully built' : `Next level: ${cost.seeds} seeds, ${cost.ideas} ideas`}
                {st.shields[i] > 0 ? ' · Shielded in the last round' : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------- history ---------------- */

function HistoryRow({ r }: { r: Resolution }) {
  const you = r.members.find((m) => m.memberId === YOU_ID);
  return (
    <li className="history-row" id={`round-${r.settlement.toRound}`}>
      <div className="history-main">
        <h3>{roundsLabel(r)}</h3>
        <KindTag kind={r.kind} />
        <span className="num muted">{passesText(r.settlement.passes)}</span>
      </div>
      <p>
        {you
          ? `You chose ${CHOICE_LABEL[you.choice]}${you.favoured ? ', the favoured move' : ''}: ${yieldText(you)}, ${you.points} points.`
          : 'You did not choose this round.'}{' '}
        {roomEventText(r)}
      </p>
      <p className="links">
        <a href={`${EXPLORER_TX}${r.settlement.txHash}`} target="_blank" rel="noreferrer">
          Transaction {shortHash(r.settlement.txHash)}
        </a>
        <a href={SETTLEMENTS_URL} target="_blank" rel="noreferrer">
          Official feed
        </a>
      </p>
      <details>
        <summary>Seed and crew</summary>
        <p>
          Seed text <code>{r.seed}</code>, FNV-1a hash <code>0x{r.seedHash.toString(16).padStart(8, '0')}</code>.
        </p>
        <div className="table-wrap">
        <table className="crew">
          <caption className="sr-only">Crew choices for {roundsLabel(r)}</caption>
          <thead>
            <tr>
              <th scope="col">Burrow</th>
              <th scope="col">Move</th>
              <th scope="col">Brought</th>
              <th scope="col" className="right">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {r.members.map((m) => (
              <tr key={m.memberId}>
                <td>{memberName(m.memberId)}</td>
                <td>{CHOICE_LABEL[m.choice]}</td>
                <td>{yieldText(m)}</td>
                <td className="right num">{m.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="muted">
          After this settlement: {r.seedsAfter} seeds, {r.ideasAfter} ideas.
        </p>
      </details>
    </li>
  );
}

function History({ model }: { model: ColonyModel }) {
  const [shown, setShown] = useState(10);
  const resolutions = model.replay?.resolutions ?? [];
  const newestFirst = useMemo(() => [...resolutions].reverse(), [resolutions]);
  const range = model.season ? seasonRange(model.season) : null;
  return (
    <section id="history" className="section" aria-labelledby="history-title">
      <h2 id="history-title">Round history</h2>
      {newestFirst.length === 0 ? (
        <p className="empty">
          {model.feedState === 'loading'
            ? 'Settled rounds are loading.'
            : model.feedState === 'error'
              ? 'Round history could not load from Squeekchain. Use Try again in the round panel, or come back in a minute.'
              : `No rounds have settled in season ${model.season ?? ''} yet. A round usually settles about three minutes after it ends.`}
        </p>
      ) : (
        <>
          <p className="muted">
            {newestFirst.length} settlements this season{range ? `, rounds ${range.first} to ${range.last}` : ''}.
          </p>
          <ol className="history">
            {newestFirst.slice(0, shown).map((r) => (
              <HistoryRow key={r.settlement.toRound} r={r} />
            ))}
          </ol>
          {shown < newestFirst.length && (
            <button type="button" className="btn btn-quiet" onClick={() => setShown((n) => n + 20)}>
              Show 20 more rounds
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* ---------------- leaderboard ---------------- */

function Leaderboard({ model }: { model: ColonyModel }) {
  const st = model.replay?.state;
  if (!st) return null;
  const rows = MEMBERS.map((m) => ({
    id: m.id,
    name: m.name,
    points: st.points[m.id] ?? 0,
    favoured: st.favouredPicks[m.id] ?? 0,
    played: st.played[m.id] ?? 0,
  })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return (
    <section id="leaderboard" className="section" aria-labelledby="board-title">
      <h2 id="board-title">Season {st.season} leaderboard</h2>
      <p className="muted">
        Seven neighbour burrows play every round with moves seeded from the round ID. You are the only real player on this device, and
        you have played {st.played[YOU_ID] ?? 0} of {model.replay?.resolutions.length ?? 0} settlements. Favoured counts moves that matched
        the result&apos;s bonus.
      </p>
      <div className="table-wrap">
        <table className="board">
          <caption className="sr-only">Season {st.season} points by burrow</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Burrow</th>
              <th scope="col" className="right">
                Points
              </th>
              <th scope="col" className="right">
                Favoured
              </th>
              <th scope="col" className="right col-rounds">
                Rounds
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className={row.id === YOU_ID ? 'you' : undefined}>
                <td className="num">{i + 1}</td>
                <th scope="row">{row.id === YOU_ID ? 'Your burrow' : row.name}</th>
                <td className="right num">{row.points}</td>
                <td className="right num">{row.favoured}</td>
                <td className="right num col-rounds">{row.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- verify ---------------- */

function Verify({ model }: { model: ColonyModel }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ ok: boolean; r?: Resolution; message?: string } | null>(null);
  const resolutions = model.replay?.resolutions ?? [];
  const latestRound = resolutions.at(-1)?.settlement.toRound;
  const inputRef = useRef<HTMLInputElement>(null);

  const fail = (message: string) => {
    setResult({ ok: false, message });
    inputRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value.trim());
    if (!Number.isInteger(n) || n < 1) {
      fail(`Enter a whole round number, such as ${latestRound ?? 982}.`);
      return;
    }
    const r = resolutions.find((x) => n >= x.settlement.fromRound && n <= x.settlement.toRound);
    if (r) {
      setResult({ ok: true, r });
      return;
    }
    const range = model.season ? seasonRange(model.season) : null;
    if (range && (n < range.first || n > range.last)) {
      fail(`Round ${n} is outside this season (rounds ${range.first} to ${range.last}).`);
    } else {
      fail(`Round ${n} has not settled yet, or its settlement has not loaded. Try a round up to ${latestRound ?? 'the latest one'}.`);
    }
  };

  return (
    <section id="verify" className="section" aria-labelledby="verify-title">
      <h2 id="verify-title">Check a settled round</h2>
      <form className="verify-form" onSubmit={submit} noValidate>
        <label htmlFor="verify-round">Round number</label>
        <div className="verify-row">
          <input
            id="verify-round"
            ref={inputRef}
            name="round"
            inputMode="numeric"
            autoComplete="off"
            placeholder={latestRound ? String(latestRound) : '982'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby={result && !result.ok ? 'verify-error' : undefined}
            aria-invalid={result !== null && !result.ok}
          />
          <button type="submit" className="btn">
            Check round
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {result && !result.ok && (
          <p id="verify-error" className="error">
            {result.message}
          </p>
        )}
        {result?.ok && result.r && (
          <div className="verify-out">
            <p>
              <strong>{roundsLabel(result.r)}</strong>: the official settlement added {passesText(result.r.settlement.passes)}, so the
              result is <KindTag kind={result.r.kind} />. The favoured move was {CHOICE_LABEL[FAVOURED[result.r.kind]]}.
            </p>
            <p>
              Seed text <code>{result.r.seed}</code> hashes to <code>0x{result.r.seedHash.toString(16).padStart(8, '0')}</code>. {roomEventText(result.r)}
            </p>
            <p className="links">
              <a href={`${EXPLORER_TX}${result.r.settlement.txHash}`} target="_blank" rel="noreferrer">
                Settlement transaction on Sepolia
              </a>
              {result.r.settlement.ethBlock && <span className="muted">Ethereum block {result.r.settlement.ethBlock}</span>}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- how it works ---------------- */

function HowItWorks() {
  return (
    <section id="how" className="section how" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol className="steps">
        <li>
          <h3>Pick a move each round</h3>
          <p>
            Squeekchain counts a real hamster wheel in ten-minute rounds. While a round is live you get one free move: Forage for seeds,
            Fortify for shields, or Research for ideas.
          </p>
        </li>
        <li>
          <h3>The official result decides</h3>
          <p>
            When the round settles on Sepolia, its accepted wheel passes set the outcome. Nap (0 passes) triples Research. Jog (1 to{' '}
            {ZOOMIES_AT - 1}) triples Forage. Zoomies ({ZOOMIES_AT} or more) send foragers on expeditions, while every room without a shield
            risks losing a level. Fortify shields the highest rooms for that round only.
          </p>
        </li>
        <li>
          <h3>The colony builds itself</h3>
          <p>
            Seeds and ideas go into shared stores. After each settlement the colony upgrades its lowest affordable room. A season lasts{' '}
            {SEASON_ROUNDS} rounds, three days, then the burrow starts fresh.
          </p>
        </li>
        <li>
          <h3>Anyone can replay it</h3>
          <p>
            Each settlement is resolved with a seed made from its public round range and pass count. Same rounds, same choices, same
            colony. Neighbour moves come from the round ID alone, so they are fixed before any result exists.
          </p>
        </li>
      </ol>
      <p className="disclaimer">
        Squeek Colony only reads public data. Nothing here reaches the wheel or the hamster, and no move can change a result. There are no
        tokens, wagers or payments in the game.
      </p>
    </section>
  );
}

/* ---------------- app ---------------- */

export default function App() {
  const model = useColony();
  const st = model.replay?.state;
  const latest = model.replay?.resolutions.at(-1) ?? null;
  const levels = st?.levels ?? ROOMS.map(() => 1);
  const shields = st?.shields ?? ROOMS.map(() => 0);
  const wheelActive = model.status?.coreStatus === 'ACTIVE' && model.status.freshness === 'online';
  const wheelWord = model.status === null ? 'not yet known' : wheelActive ? 'turning' : 'still';

  return (
    <>
      <a className="skip" href="#play">
        Skip to the game
      </a>
      <header className="topbar">
        <a className="brand" href="#play" aria-label="Squeek Colony, back to the game">
          <img src="./favicon.svg" alt="" width="28" height="28" />
          <span>Squeek Colony</span>
        </a>
        <nav aria-label="Sections">
          <a href="#history" className="nav-wide">
            History
          </a>
          <a href="#leaderboard" className="nav-wide">
            Leaderboard
          </a>
          <a href="#how">How it works</a>
        </nav>
      </header>

      <main id="play" tabIndex={-1}>
        <div className="hero">
          <div className="hero-intro">
            <h1>Squeek Colony</h1>
            <p className="lede">Grow a shared hamster burrow from real Squeekchain rounds.</p>
          </div>
          <div className="stage">
            <Scene
              levels={levels}
              shields={shields}
              latest={latest}
              wheelActive={wheelActive}
              wheelKnown={model.status !== null}
              label={sceneLabel(levels, shields, wheelWord, latest)}
            />
            {st && (
              <p className="stage-caption">
                Season {st.season} · {st.seeds} seeds · {st.ideas} ideas
              </p>
            )}
          </div>
          <div className="side">
            <RoundPanel model={model} />
            <FeedNotice model={model} />
            <LatestResult model={model} />
          </div>
        </div>

        <div className="columns">
          <Rooms model={model} />
          <Leaderboard model={model} />
        </div>
        <History model={model} />
        <div className="columns">
          <HowItWorks />
          <Verify model={model} />
        </div>
      </main>

      <footer className="footer">
        <p>
          Data: the public{' '}
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            Squeekchain API
          </a>{' '}
          (status, SqueekCore state and settlement events), confirmed on Sepolia. Read how{' '}
          <a href={ROUNDS_DOCS_URL} target="_blank" rel="noreferrer">
            rounds and settlements
          </a>{' '}
          work.
        </p>
        <p className="muted">A fan-made game. The official Squeekchain result is the only authority.</p>
      </footer>
    </>
  );
}
