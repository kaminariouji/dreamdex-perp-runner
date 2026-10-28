# The first inventory sync reserves the entire base balance as gas, so the bot never sells a position it started with

Severity: major
Area: grid-bot (examples/03-monorepo-grid)

## Steps to reproduce

1. Start the bot with a wallet that already holds base (for example SOMI) before the first tick — a restarted bot, a manual top-up, or a wallet reused from an earlier session.
2. The first `syncInventory` call runs at `examples/03-monorepo-grid/bots/grid-bot/src/strategies/grid.ts:331-337`:

```ts
syncInventory(snapshot: StrategyInventorySnapshot): void {
  if (this.reservedBaseBalance === 0 && snapshot.baseBalance > 0) {
    this.reservedBaseBalance = snapshot.baseBalance;
  }
  const liveTradable = Math.max(0, snapshot.baseBalance - this.reservedBaseBalance);
  ...
}
```

3. `reservedBaseBalance` is set to the whole balance, so `liveTradable` is zero for that sync.

## Expected

Only the gas float the bot intentionally keeps (the startup SOMI it says it reserves for gas) should be excluded. Any base above that float is a position and must be tracked as a lot so the grid can sell it.

## Actual

The first non-zero snapshot is taken as the reserve in full. `liveTradable` becomes `baseBalance - baseBalance = 0`, no synthetic lot is created (the branch at line 345 requires `liveTradable > 0`), and `getTradableBaseBalance()` returns zero from then on.

## Impact

A bot restarted while holding a position — exactly the case the persistence layer exists for — comes up believing it holds nothing tradable. It will not post a single sell, the FIFO lots stay empty, and the held base sits outside the grid until someone edits state by hand. The same happens on a fresh start with a pre-funded wallet. Because `reservedBaseBalance` is persisted in `getPersistentState()`, the wrong value survives restarts, so the position stays invisible.

## Fix

Reserve a configured gas float (a small fixed amount, e.g. `DREAMDEX_GRID_GAS_RESERVE_BASE`) instead of `snapshot.baseBalance`, and treat any excess as a lot on the first sync. If the reserve is meant to be dynamic, compute it once from the chain's gas requirement, never from the whole balance.
