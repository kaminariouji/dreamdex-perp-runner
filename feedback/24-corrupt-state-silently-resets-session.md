# A corrupt state file is silently replaced with an empty snapshot, resetting the session loss budget and the lot history

Severity: major
Area: SDK persistence (examples/03-monorepo-grid/packages/sdk)

## Steps to reproduce

1. Run the grid bot once so it writes `data/<symbol>-<strategy>.state.json`.
2. Corrupt that file — truncate it, leave a trailing comma, or replace its contents with `{}` after an interrupted write.
3. Start the bot again.
4. `BotStateStore.loadSnapshot` (`packages/sdk/src/persistence/store.ts:153-168`) catches every failure and returns a fresh snapshot:

```ts
private async loadSnapshot(): Promise<PersistedBotSnapshot> {
  try {
    const raw = await readFile(this.statePath, 'utf8');
    const parsed = JSON.parse(raw) as PersistedBotSnapshot;
    return { ...createEmptySnapshot(this.context), ...parsed, metrics: {...} };
  } catch {
    return createEmptySnapshot(this.context);
  }
}
```

5. Nothing is logged, nothing is renamed to `.corrupt`, and the caller cannot tell the difference between "first run" and "state lost".

## Expected

An unreadable or unparsable state file is a data-loss event and should be reported. The bot should refuse to start, or at minimum log the path and the parse error, move the bad file aside, and require an explicit `--reset-state` flag before trading with an empty snapshot.

## Actual

The bot starts normally and continues with `strategyState` undefined. `index.ts:177-181` then skips `strategy.hydrate`, so:

- `lots` is empty, so `getTradableBaseBalance()` is 0 and the sell path never fires;
- `initialEquityQuote` is undefined and is re-captured from the current equity at the first tick, so the `DREAMDEX_GRID_MAX_SESSION_LOSS_QUOTE` budget restarts from zero even if the session had already spent it;
- `reservedBaseBalance` is 0, and the first `syncInventory` assigns it the whole live base balance (see the separate reserved-balance item), so any position held in the wallet becomes permanently non-tradable;
- `tradedQuoteVolume`, `tradeCount` and the persisted metrics reset, so the journal no longer reconciles with the state file.

## Impact

The failure mode is "the bot appears healthy but silently ignores the position it already holds and forgets how much it has lost this session". The stop-loss is the safety control that limits drawdown; resetting its baseline on a corrupted file means a bot that had already hit its limit resumes trading with a fresh budget. Because the `catch` is bare, there is no log line, no metric, and no way to notice from the dashboard.

`{}` is a particularly quiet case: it parses successfully, so `...parsed` contributes nothing and the merged snapshot is identical to `createEmptySnapshot` — the same result as a hard parse error, through a different branch.

## Fix

Distinguish "missing" from "unreadable":

```ts
private async loadSnapshot(): Promise<PersistedBotSnapshot> {
  let raw: string;
  try {
    raw = await readFile(this.statePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptySnapshot(this.context);
    }
    throw error;
  }
  try {
    return { ...createEmptySnapshot(this.context), ...JSON.parse(raw) };
  } catch (error) {
    console.error(`[store] State file ${this.statePath} is unreadable: ${String(error)}`);
    await rename(this.statePath, `${this.statePath}.corrupt-${Date.now()}`);
    throw new Error('Refusing to start with a corrupt state file; move it aside to start fresh');
  }
}
```
