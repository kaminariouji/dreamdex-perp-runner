# Failed order reconciliation is reported as zero fill, hiding a position that may exist

Severity: major
Area: grid-bot (examples/03-monorepo-grid)

## Steps to reproduce

1. Place an order through the WebSocket/vault path so `orderId` is defined.
2. Make `http.fetchOrder(symbol, orderId)` fail for all five attempts (RPC 5xx, timeout, or a 404 while the indexer catches up). The loop at `examples/03-monorepo-grid/bots/grid-bot/src/index.ts:492-514` logs `Could not reconcile order ... assuming no fill`.
3. Observe the return at line 515-521:

```ts
return {
  side,
  requestedPrice,
  requestedAmount,
  filledAmount: '0',
  executionPrice: requestedPrice,
  status: 'unknown',
};
```

## Expected

An unknown outcome must not be collapsed into "no fill". The bot should stop trading for that symbol until the order is reconciled (fetch by order id again, or force a live inventory resync), because the order may have filled on chain while the read failed.

## Actual

The execution is recorded with `filledAmount: '0'`. `recordExecution` writes it as a completed, zero-fill order, and the strategy keeps its previous inventory. `status: 'unknown'` is stored but never acted on: nothing in the loop checks it, so the next tick proceeds with the stale position.

## Impact

If the order did fill, the strategy is now short or long by an amount it does not know about. It can immediately send the opposite order (thinking nothing happened), doubling exposure, or send another order in the same direction, exceeding the configured grid cap. The position only becomes visible at the next 5-minute `getLiveInventory` sync, and the intervening trades are attributed to the wrong inventory state.

## Fix

On reconciliation exhaustion, set a `reconcilePending` flag for the symbol, skip new signals until a live inventory sync succeeds, and surface the unknown execution in the status line instead of recording it as a zero fill.
