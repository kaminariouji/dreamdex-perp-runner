# A misconfigured order size crashes the bot instead of skipping the trade

Severity: major
Area: grid-bot (examples/03-monorepo-grid)

## Steps to reproduce

1. Set `DREAMDEX_ORDER_AMOUNT` to a value that rounds below the market minimum for the selected symbol (for example `0.001` on a market with `minQuantity: '0.01'`).
2. Start the bot and wait for the first order book message.
3. `ThresholdStrategy.evaluate` reaches `examples/03-monorepo-grid/bots/grid-bot/src/strategies/threshold.ts:26-30`:

```ts
if (Number(amount) < Number(context.market.minQuantity)) {
  throw new Error(
    `Configured order amount ${amount} is below market minimum ${context.market.minQuantity}`,
  );
}
```

4. `evaluate` is called from inside the WebSocket message handler at `index.ts:332`, and that handler is wrapped in `try { ... } finally { isHandling = false; }` (`index.ts:295` / `index.ts:461-464`) with **no `catch`**. The `finally` clears the in-flight flag but the rejection is never handled, and `index.ts` registers no `process.on('unhandledRejection')` handler.

## Expected

The same condition is treated as a non-fatal "no trade" everywhere else in the codebase:

- `strategies/grid.ts:428` — `if (Number(amount) < Number(context.market.minQuantity)) return undefined;`
- `strategies/grid.ts:456` and `grid.ts:476` — same pattern
- `strategies/market-maker.ts:324-326` — same pattern

`threshold.ts` should do the same, or the amount should be validated once at startup (`index.ts:210` already logs `min qty=${market.minQuantity}` but never compares it against `config.orderAmount`).

## Actual

The throw escapes `evaluate`, escapes the `try` block, and the `finally` only resets `isHandling`. There is no `catch` between `index.ts:295` and `index.ts:464`, so the rejection surfaces as an unhandled promise rejection from the async WebSocket callback. On Node 15+ the default `--unhandled-rejections=throw` terminates the process.

Because the condition is deterministic, this is not a one-off tick loss: every order book message re-enters `evaluate` and throws again, so a supervisor that restarts the bot produces a crash loop rather than a single failed start.

## Impact

A pure configuration mistake — one that every other strategy degrades into "no trade" — takes the whole process down. Any open position is left unmanaged: no grid re-quote, no rebalance, no stop logic runs while the bot is down. The failure is also invisible in the metrics and status line, because `lastDecisionLine` is only updated on the non-throwing paths, so the dashboard keeps showing the previous decision text.

## Fix

Replace the `throw` with a decision line plus `return undefined`, matching `grid.ts` and `market-maker.ts`:

```ts
if (Number(amount) < Number(context.market.minQuantity)) {
  this.lastDecisionLine =
    `no trade: configured amount ${amount} is below market minimum ${context.market.minQuantity}`;
  return undefined;
}
```

Additionally validate `config.orderAmount` against `market.minQuantity` once during startup, right after the market metadata is loaded, so the operator sees a clear error before the WebSocket connects.
