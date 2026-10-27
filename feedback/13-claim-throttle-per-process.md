# `maybeClaim` throttles every wallet in the process with one module-level timer, and the "will retry" it logs waits a full interval

Severity: normal
Area: SDK

## Steps to reproduce

1. Drive two `EcContext`s with different wallets through one process, the first with a failing market index and the second healthy:

```ts
import { maybeClaim } from './packages/ec-core/src/claim.ts';
let aCalls = 0, bCalls = 0;
const mk = (wallet: string, fail: boolean, inc: () => void) => ({
  exchange: { walletAddress: wallet, client: { listBinaryMarkets: async () => { inc(); if (fail) throw new Error('indexer down'); return []; } } },
  config: { venueId: 'v1', dryRun: false },
  canTrade: true,
} as any);
const A = mk('0xAAA0000000000000000000000000000000000001', true,  () => { aCalls++; });
const B = mk('0xBBB0000000000000000000000000000000000002', false, () => { bCalls++; });
await maybeClaim(A);   // sweep fails: indexer down
await maybeClaim(B);   // a different wallet, nothing wrong with it
console.log(aCalls, bCalls);
```

2. Run with `npx tsx`.

## Expected

The throttle belongs to the thing being throttled. Two wallets in one process are two sweepers: B should sweep on its own schedule, and a failed sweep should not consume the interval it just promised to retry within.

## Actual

```
$ npx tsx _claim_test.mts
2026-10-27T17:49:15.192Z claim: sweep failed, will retry — indexer down
sweeps attempted: A = 1 | B = 0
B swept at all? false
```

`packages/ec-core/src/claim.ts` keeps the timer at module scope, with a comment that assumes a single wallet:

```ts
/** Per-process throttle. Keyed by nothing: one strategy, one wallet, one loop. */
let lastSweepAt = 0;
```

and `maybeClaim` advances it **before** the sweep:

```ts
const now = Date.now();
if (now - lastSweepAt < interval) return;
lastSweepAt = now;
try {
  await claimSettled(ctx, opts);
} catch (e) {
  log(`claim: sweep failed, will retry — ${(e as Error).message}`);
}
```

Two consequences, both visible in the run above:

1. **One wallet starves the other.** The first `maybeClaim` in the process starts the clock for everyone. Any second wallet — a second strategy, a second operator key, a test harness — returns at the guard and never sweeps while the first keeps calling. Its settled positions stay unredeemed, which is exactly the failure this module says it exists to prevent ("a bot that trades for a week and never redeems has its balance spread across dozens of finalised markets while its wallet reads near zero").
2. **"will retry" is not true on the next tick.** `lastSweepAt` was already moved, so the retry happens after `intervalMs` (10 minutes by default), not on the next loop. A transient indexer error therefore costs a full interval of unclaimed winnings, while the log tells the operator the opposite.

## Evidence

Captured 2026-10-27T17:49Z against `@dreamdex-bot-kit/ec-core` as shipped in dreamdex-bot-kit, Node 24, `tsx`, stub clients (no RPC, no wallet).

## Suggested fix

```ts
const lastSweepAt = new WeakMap<object, number>();   // per EcContext, or per wallet address
// ...
const prev = lastSweepAt.get(ctx) ?? 0;
if (now - prev < interval) return;
try {
  await claimSettled(ctx, opts);
  lastSweepAt.set(ctx, Date.now());   // advance only on success
} catch (e) {
  log(`claim: sweep failed, will retry — ${(e as Error).message}`);
}
```

## Environment

`@dreamdex-bot-kit/ec-core`, Node 24, `tsx`; no network and no wallet needed to reproduce.

