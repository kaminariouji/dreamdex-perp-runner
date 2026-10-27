# `NonceManager.resync()` can hand out a nonce it already allocated

Severity: major
Area: SDK

## Steps to reproduce

1. Run the SDK's own `NonceManager` (`packages/core/src/nonce.ts`) against a stub chain client whose `pending` nonce starts at 100, allocate three nonces, then simulate the documented resync case — an external actor consumed nonce 100, so the chain's pending count is now 101:

```ts
import { NonceManager } from './packages/core/src/nonce.ts';
let pending = 100;
const stub = { getTransactionCount: async () => pending };
const nm = new NonceManager(stub as any, '0x0000000000000000000000000000000000000001', 8);
await nm.initialize();
const a = await nm.acquire();   // 100
const b = await nm.acquire();   // 101
const c = await nm.acquire();   // 102
pending = 101;                  // external consumption of 100
await nm.resync();
const d = await nm.acquire();
console.log(a, b, c, '->', d);
```

2. Run it with `npx tsx` from the repo root.

## Expected

`resync()` may only move the local counter **forward**. The next nonce after a resync is at least `max(localNext, chainPending)` — here `>= 103` — because 101 and 102 are still in flight from this same manager. Handing either of them out again is precisely the "reuse it and loop" failure the method's own comment says it exists to prevent:

> Re-read the pending nonce from chain after a "nonce too low" error — the chain already consumed a nonce, so a local decrement would reuse it and loop.

## Actual

```
$ npx tsx _nonce_test2.mts
allocated 100 101 102
after resync, next nonce handed out = 101
duplicate of an already-allocated nonce? true
monotonic? expected >= 103
```

`resync()` assigns `this.next = await this.client.getTransactionCount({ blockTag: "pending" })` unconditionally, so any chain value below the local counter rewinds it. Two of the three still-unconfirmed transactions then share a nonce with the next `acquire()`: on-chain, the second send replaces or is dropped as "already known", and the bot loses an order while believing it sent one.

The same call also sets `this.inFlight = 0`, so the backpressure cap (`maxInFlight`) stops counting the transactions that are still pending. After one resync the manager will hand out up to `maxInFlight` more while the previous batch is unconfirmed — the cap is no longer a cap.

## Evidence

```ts
async resync(): Promise<number> {
  this.next = await this.client.getTransactionCount({ address: this.address, blockTag: "pending" });
  this.inFlight = 0;
  return this.next;
}
```

Captured 2026-10-27T17:4xZ against SDK `@dreamdex-bot-kit/core` 0.1.0 (dreamdex-bot-kit), Node 24, `tsx`, no network and no wallet — the stub client is the only dependency.

## Suggested fix

```ts
async resync(): Promise<number> {
  const chain = await this.client.getTransactionCount({ address: this.address, blockTag: "pending" });
  this.next = Math.max(this.next ?? 0, chain);
  // drain in-flight only for the nonces the chain has actually consumed
  return this.next;
}
```

and keep `inFlight` tied to real confirmations (`settled()`), not to the resync.

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0, TypeScript, Node 24, `tsx`; no RPC needed to reproduce.

