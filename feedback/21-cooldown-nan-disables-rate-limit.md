# A non-numeric cooldown is accepted and silently disables rate limiting

Severity: normal
Area: grid-bot (examples/03-monorepo-grid)

## Steps to reproduce

1. Set `DREAMDEX_COOLDOWN_MS=20s` (or `20_000`, or any value `Number()` cannot parse).
2. Start the bot. `config.ts:85` parses it without a fallback guard:

```ts
cooldownMs: Number(optional('DREAMDEX_COOLDOWN_MS', '20000')),
```

3. The numeric validation block at `config.ts:132-159` checks 22 fields and **does not include `cooldownMs`**:

```
chainId, expireSeconds, mmStartingQuoteBalanceQuote, mmStartingBaseBalance,
mmQuoteSizeQuote, mmTargetBaseInventoryQuote, mmMaxBaseInventoryQuote,
mmMinSpreadBps, mmTargetHalfSpreadBps, mmInventorySkewBps, mmMaxSessionLossQuote,
rebalanceTradeSizeQuote, rebalanceTargetBaseQuote, rebalanceTargetToleranceQuote,
rebalanceMaxSpreadBps, gridTradeSizeQuote, gridStepBps, gridMaxSpreadBps,
gridMaxLongQuote, gridMaxSessionLossQuote, gridStuckTimeoutMs, metricsPort
```

4. `config.cooldownMs` is therefore `NaN`, and it reaches both consumers:
   - `index.ts:364` — `if (now - lastActionAt < config.cooldownMs) return;`
   - `backtest.ts:179` — `if (signal && simMs - lastActionTick >= config.cooldownMs) {`

Every comparison against `NaN` is `false`.

## Expected

An unparseable numeric environment variable should fail at startup with the same message the other 22 fields get, not reach the trading loop.

## Actual

Live trading: the guard `now - lastActionAt < NaN` never returns early, so the cooldown is disabled. Every order book message that produces a signal is submitted, subject only to the strategy's own gating. On a market that updates several times per second with a threshold that stays crossed, that is one order per book update instead of one per 20 seconds.

Backtest: `simMs - lastActionTick >= NaN` is also `false`, so the `if` body never runs and **no trade is ever simulated**. The run completes normally and prints a flat equity curve and zero trades. Nothing distinguishes this from "the strategy found no opportunities", which is the opposite conclusion.

## Impact

The same typo produces two opposite wrong outcomes depending on the entry point: in production it removes the rate limit (order flood, fee bleed, and inventory churn the cooldown was added to prevent), and in research it silently reports the strategy as inactive. Because `NaN` propagates without an exception, neither case shows an error.

## Fix

Add `Number.isNaN(config.cooldownMs)` to the block at `config.ts:132-155`, and parse the value once into a validated number:

```ts
const cooldownMs = Number(optional('DREAMDEX_COOLDOWN_MS', '20000'));
if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
  throw new Error('DREAMDEX_COOLDOWN_MS must be a non-negative number of milliseconds');
}
```
