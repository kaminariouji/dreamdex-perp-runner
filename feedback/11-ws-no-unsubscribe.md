# `DreamDexWs` has no unsubscribe, and every `subscribe()` call is replayed forever

Severity: normal
Area: SDK

## Steps to reproduce

1. Call the same subscription three times on a client that is not connected yet, then read the list that `connect()` replays on the next open:

```ts
import { DreamDexWs } from './packages/core/src/ws.ts';
(globalThis as any).WebSocket = class { static OPEN = 1; readyState = 3; on() {} send() {} close() {} };
const ws = new DreamDexWs({ wsUrl: 'ws://x' } as any, () => {});
ws.subscribeOrderbook(['SOMI:USDso']);
ws.subscribeOrderbook(['SOMI:USDso']);
ws.subscribeOrderbook(['SOMI:USDso']);
console.log((ws as any).subs.length);
```

2. Run with `npx tsx`.

## Expected

Subscriptions are a set, not a log: a repeated subscribe for the same channel and params is a no-op (or replaces the previous entry), and there is a way to drop one — `unsubscribe(channel, params)` — because a strategy that rotates symbols has to stop listening to the old ones.

## Actual

```
$ npx tsx _ws_test.mts
subs queued after 3 identical calls: 3
frames sent on next reconnect: 3
```

`subscribe()` does `this.subs.push({ channel, params })` with no check for an existing entry, and `connect()` replays the whole array on every `open`:

```ts
ws.on("open", () => {
  this.reconnectDelay = 1_000;
  for (const s of this.subs) this.send({ operation: "subscribe", channel: s.channel, params: s.params });
  ...
});
```

There is no `unsubscribe` method at all (`grep -n "unsubscribe" packages/core/src/ws.ts` returns nothing), so `subs` is append-only for the lifetime of the process. A strategy that re-subscribes on each tick — a natural way to express "keep watching these symbols" — grows the array linearly with time, and every reconnect after a network blip sends every historical subscription again. After a day at one call per second that is 86,400 frames per reconnect, all but one of them redundant.

The server also has no documented idempotency for duplicate subscribe frames, so the duplicates are not merely wasted bytes.

## Evidence

Captured 2026-10-27T17:5xZ against SDK `@dreamdex-bot-kit/core` 0.1.0, Node 24, `tsx`, stub WebSocket (no server needed).

```ts
subscribe(channel: string, params: Record<string, unknown>): void {
  this.subs.push({ channel, params });
  if (this.ws?.readyState === WebSocket.OPEN) {
    this.send({ operation: "subscribe", channel, params });
  }
}
```

## Suggested fix

Key the subscriptions by `channel + JSON.stringify(params)` in a `Map`, make a repeat call a no-op, and add:

```ts
unsubscribe(channel: string, params: Record<string, unknown>): void {
  const key = channel + JSON.stringify(params);
  if (!this.subs.delete(key)) return;
  this.send({ operation: "unsubscribe", channel, params });
}
```

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0, Node 24, `tsx`; no network and no wallet.

