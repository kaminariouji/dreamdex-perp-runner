# Auto-vault moves real funds at startup even when dry run is enabled

Severity: major
Area: grid-bot (examples/03-monorepo-grid)

## Steps to reproduce

1. Set the two variables the shipped example already contains (`bots/grid-bot/.env.example:12-14`):

```
DREAMDEX_AUTO_VAULT=true
DREAMDEX_DRY_RUN=true
```

2. Start the bot.
3. `index.ts:197-206` runs before the dry-run gate:

```ts
const vaultManager = config.autoVault
  ? new VaultManager(executor, market.contract)
  : undefined;

if (vaultManager) {
  console.log(
    '[vault] Auto-vault enabled: depositing wallet funds to vault...',
  );
  await vaultManager.depositAll(market, config.vaultGasReserve);
}
```

4. `VaultManager.depositAll` (`packages/sdk/src/execution/vault.ts:31-60`) sends real transactions: `ensureErc20Allowance`, then `pool.deposit(token, balance)` followed by `tx.wait()`, and for native markets `pool.depositNative({ value: balance - gasReserve })`.

5. The only dry-run check in the process is `index.ts:401-404`, inside the WebSocket handler, after the vault deposit has already been mined.

## Expected

`DREAMDEX_DRY_RUN=true` should mean the process sends no transactions at all. Startup side effects (allowance approvals, vault deposits) must be behind the same guard as order submission, and the guard should be evaluated before any signer call.

## Actual

The dry-run flag is checked in exactly one place, at order submission. Startup paths that write to chain — `depositAll` here, and any future bootstrap step — are not covered. With the example configuration, a user who explicitly asked for a dry run watches the bot approve and deposit their **entire** quote balance (and the whole base balance, or the native balance minus `DREAMDEX_VAULT_GAS_RESERVE`) into the market contract on the first run.

`depositAll` has no amount parameter: it reads `getErc20Balance` and deposits that whole value. There is no cap, no confirmation, and no log line saying how much was moved before it moves.

## Impact

The vault deposit is on chain and irreversible without a matching `withdraw`. A user evaluating the bot with `DREAMDEX_DRY_RUN=true` — the exact setting the flag exists for — has their wallet drained into a contract they did not intend to interact with. The failure is silent: the console prints `Deposited quote ... to vault`, which reads like normal operation, and `Dry run=true` is printed a few lines later, reinforcing the false impression that nothing was signed.

## Fix

Evaluate `config.dryRun` once at startup, before any signer call, and short-circuit the vault bootstrap:

```ts
if (vaultManager && !config.dryRun) {
  await vaultManager.depositAll(market, config.vaultGasReserve);
}
```

and log the amount that is about to be deposited, plus a separate `[dry-run] Skipping vault deposit` line when it is skipped.
