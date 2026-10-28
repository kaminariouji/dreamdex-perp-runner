# `NonceManager.acquire()` checks the in-flight cap before it queues, so a burst of callers all pass it

Severity: major
Area: SDK

## Steps to reproduce

1. Run the SDK's own `NonceManager` (`packages/core/src/nonce.ts`) with the documented cap of 8 and fire 50 concurrent `acquire()` calls at it:

```ts
import { NonceManager } from './packages/core/src/nonce.ts';
const client = { getTransactionCount: async () => 5 } as any;
const nm = new NonceManager(client, '0x0000000000000000000000000000000000000001', 8);
const out = await Promise.all(Array.from({ length: 50 }, () => nm.acquire()));
console.log('acquired:', out.length, 'unique:', new Set(out).size);
console.log('inFlight:', (nm as any).inFlight, 'cap:', 8);
console.log('first 12 nonces:', out.slice(0, 12).join(','));
```

2. Run it with `npx tsx` from the repo root.

## Expected

`maxInFlight` is the whole point of the class — its header states the guarantee:

> backpressure, so a stuck tx can't let unbounded sends pile up;

So at most 8 `acquire()` calls may resolve while 8 transactions are unconfirmed; the other 42 wait for `settled()`.

## Actual

```
$ npx tsx _nonce_burst.mts
acquired: 50 unique: 50
inFlight: 50 cap: 8
first 12 nonces: 5,6,7,8,9,10,11,12,13,14,15,16
```

All 50 calls resolve in the same tick and the manager hands out nonces 5 through 54.

## Why it happens

```ts
async acquire(): Promise<number> {
  // Backpressure: don't hand out a nonce while the mempool is backed up.
  while (this.inFlight >= this.maxInFlight) {
    await sleep(200);
  }
  // Chain the allocation onto the queue so concurrent callers serialize.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const prev = this.queue;
  this.queue = prev.then(() => gate);
  await prev;
  ...
  this.inFlight += 1;
  return n;
}
```

The guard reads `inFlight` **before** the caller joins the queue, and `inFlight` is only incremented **after** `await prev`. Every caller in a burst therefore observes `inFlight = 0`, passes the guard, and is serialized afterwards — the queue makes the allocation ordered, and the guard that was supposed to bound it never sees the queue.

This is not `resync()` (item 10). No resync happens here; the cap is breached by a plain concurrent burst against a manager that has never failed.

## Impact

A strategy that re-quotes a grid, or one order per symbol across a handful of markets, fans out N orders in one tick. All N nonces are allocated immediately, so:

- the mempool receives N transactions that the bot cannot recall;
- if the first one is dropped or underpriced, every later order sits behind a nonce gap and none of them mine — while the bot has already recorded them as sent;
- cancelling does not help: `cancelOrder` for an unmined nonce queues behind the same gap.

The failure mode the class exists to prevent is the one it enables.

## Suggested fix

Move the cap inside the serialized section, and wake waiters on `settled()` instead of polling every 200 ms:

```ts
private waiters: Array<() => void> = [];

async acquire(): Promise<number> {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const prev = this.queue;
  this.queue = prev.then(() => gate);
  await prev;
  try {
    while (this.inFlight >= this.maxInFlight) {
      await new Promise<void>((r) => this.waiters.push(r)); // woken by settled()
    }
    if (this.next === null) await this.initialize();
    const n = this.next as number;
    this.next = n + 1;
    this.inFlight += 1;
    return n;
  } finally {
    release();
  }
}

settled(): void {
  if (this.inFlight > 0) this.inFlight -= 1;
  this.waiters.shift()?.();
}
```

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0, TypeScript, Node 24, `tsx`; no RPC and no wallet needed to reproduce.
