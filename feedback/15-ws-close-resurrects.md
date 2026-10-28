# `DreamDexWs.close()` leaves an already-scheduled reconnect armed, so the client reopens itself

Severity: normal
Area: SDK

## Steps to reproduce

1. Put `DreamDexWs` in the state it is in one millisecond after a disconnect — a reconnect armed on its 1 s timer — then close it:

```ts
import { DreamDexWs } from './packages/core/src/ws.ts';
const ws = new DreamDexWs({ wsUrl: 'ws://127.0.0.1:1' } as any, () => {});
const oldSocket = { readyState: 3, close() {}, send() {} };
(ws as any).ws = oldSocket;
(ws as any).scheduleReconnect();   // a drop just happened: reconnect armed for 1000 ms
ws.close();                        // the bot is being shut down
console.log('right after close(): closed =', (ws as any).closed);
await new Promise((r) => setTimeout(r, 1400));
console.log('after 1.4 s: closed =', (ws as any).closed);
console.log('new socket object created =', (ws as any).ws !== oldSocket);
process.exit(0);                   // the resurrected socket keeps retrying, so end the test
```

2. Run it with `npx tsx` from the repo root.

## Expected

`close()` is final. No socket is opened after it returns, and `closed` stays `true`.

## Actual

```
$ npx tsx _ws_close_test.mts
right after close(): closed = true
after 1.4 s: closed = false
new socket object created = true
```

## Why it happens

`scheduleReconnect()` arms a timer and throws the handle away:

```ts
private scheduleReconnect(): void {
  if (this.heartbeat) clearInterval(this.heartbeat);
  if (this.closed) return;
  const delay = this.reconnectDelay;
  this.reconnectDelay = Math.min(delay * 2, 30_000);
  setTimeout(() => this.connect(), delay);   // handle discarded
}

close(): void {
  this.closed = true;
  if (this.heartbeat) clearInterval(this.heartbeat);
  this.ws?.close();                          // cancels the socket, not the timer
}
```

`close()` flips the flag and closes the current socket, but the pending timer is untouched. When it fires, `connect()` starts with `this.closed = false` and opens a fresh socket — the shutdown is undone one second later.

## Impact

Shutdown is not shutdown. A bot stopped during a network blip (the only time the reconnect timer is armed) comes back on its own: the socket reopens, `onReconnect` fires, and the strategy resumes acting on market data after the operator believes the process is idle. It also leaks in tests, and in any code that builds one client per market and closes it, because every close during a backoff leaves a live handle behind.

## Suggested fix

```ts
private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

private scheduleReconnect(): void {
  if (this.heartbeat) clearInterval(this.heartbeat);
  if (this.closed) return;
  const delay = this.reconnectDelay;
  this.reconnectDelay = Math.min(delay * 2, 30_000);
  this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
}

close(): void {
  this.closed = true;
  if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  if (this.heartbeat) clearInterval(this.heartbeat);
  this.ws?.close();
}
```

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0, TypeScript, Node 24, `tsx`; the fake socket is a plain object, no server involved.
