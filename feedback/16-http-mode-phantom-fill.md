# HTTP mode records an order it never confirmed as a full fill at the requested price

Severity: major
Area: grid-bot (examples/03-monorepo-grid)

## Steps to reproduce

1. Run the grid bot with `DREAMDEX_FUNDING_SOURCE=wallet` (HTTP execution path) so `orderExecutor.executeOrder()` returns no `orderId`.
2. Any signal that reaches `resolveExecution(http, symbol, side, requestedPrice, requestedAmount, orderId)` with `orderId === undefined` takes the branch at `examples/03-monorepo-grid/bots/grid-bot/src/index.ts:479-490`:

```ts
if (!orderId) {
  // HTTP mode: no order ID available. Optimistically record as filled at the
  // requested price so the strategy can update its internal balance estimates.
  // The periodic live inventory resync will correct any accumulated drift.
  return {
    side,
    requestedPrice,
    requestedAmount,
    filledAmount: requestedAmount,
    executionPrice: requestedPrice,
  };
}
```

3. That return value flows into `stateStore.recordExecution(...)` (line 437) and `metrics.pushTrade(...)` (line 445) as if the order had filled in full, at the exact price requested.

## Expected

An unconfirmed order must not change the strategy's inventory or the reported trade history. Either return `status: 'unknown'` with `filledAmount: '0'` and skip the position update, or resolve the order by client order id before returning.

## Actual

`filledAmount` is set to the full requested amount and `executionPrice` to the requested price. `status` is left undefined. The caller treats this as a completed fill: it records an execution, pushes a trade with a non-zero notional, and the strategy updates its internal base/quote estimates.

## Impact

The grid strategy now believes it holds a position it may not have. Until the next `getLiveInventory` resync (every 5 minutes, line 316), it can post a sell for base it does not hold (order rejected, grid desynchronised) or keep buying because it thinks inventory is flat. Every phantom fill also writes a fake trade into `stateStore` and the metrics series, so the operator's PnL and exposure view is wrong for at least one resync window. With a 10 s tick and a 15 s cooldown this can compound over several cycles.

## Fix

Treat the HTTP path as unconfirmed: return `{ filledAmount: '0', executionPrice: requestedPrice, status: 'unknown' }` and mark the strategy state dirty so the next loop forces a live inventory sync instead of waiting up to 5 minutes.
