# `alignToStep` and `adjustPriceByBps` throw a SyntaxError on exponential notation

Severity: major
Area: SDK (examples/03-monorepo-grid/packages/sdk)

## Steps to reproduce

Compile the file on its own and call it with the strings a caller produces from `Number(...).toString()`:

```bash
npx tsc packages/sdk/src/utils.ts --outDir /tmp/sdkbuild --module esnext --target es2022 --skipLibCheck
node -e "
import('/tmp/sdkbuild/utils.js').then(({alignToStep, adjustPriceByBps}) => {
  for (const [v, s] of [['5e-8','0.00001'], ['1e-7','0.0001'], ['1e+21','0.01']]) {
    try { console.log(v, '=>', alignToStep(v, s)); }
    catch (e) { console.log(v, '=> THROW', e.constructor.name + ': ' + e.message); }
  }
  try { adjustPriceByBps('1e-7', 8, 'down'); } catch (e) { console.log('adjustPriceByBps => THROW', e.message); }
});"
```

Output against the current source:

```
5e-8 => THROW SyntaxError: Cannot convert 5e-800000 to a BigInt
1e-7 => THROW SyntaxError: Cannot convert 1e-7000000 to a BigInt
1e+21 => THROW SyntaxError: Cannot convert 1e+2100 to a BigInt
adjustPriceByBps => THROW Cannot convert 1e-7000000 to a BigInt
```

## Cause

`toScaledInteger` (`packages/sdk/src/utils.ts:12-16`) splits on `.` and concatenates the parts, assuming plain decimal notation:

```ts
function toScaledInteger(value: string, scale: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  const paddedFraction = (fraction + '0'.repeat(scale)).slice(0, scale);
  return BigInt(`${whole}${paddedFraction}`);
}
```

For `"5e-8"` there is no `.`, so `whole` is `"5e-8"`, `fraction` is `""`, and the padded fraction is a run of zeros. The result is `BigInt("5e-800000")`, which is not a valid integer literal. `decimalPlaces` has the same assumption: `"1.5e-7"` yields `decimals.length === 4`, so the scale is wrong even before the parse fails.

Any JavaScript number with an absolute value below `1e-6` (or at or above `1e21`) stringifies in exponential form, so this is reachable from ordinary arithmetic, not from hand-written input.

## Reached from the grid bot

`strategies/grid.ts` passes `Number(...).toString()` into both helpers:

- `buildBuySignal` → `alignToStep(this.getAffordableBuyBaseAmount(priceNum).toString(), context.market.lotSize)`
- `buildSellAllSignal` → `alignToStep(totalAmount.toString(), ...)`
- `evaluate` → `adjustPriceByBps(this.referencePrice.toString(), this.settings.stepBps, 'down')`

`getAffordableBuyBaseAmount` is `Math.min(tradeSizeQuote, quoteBalance) / price`. On the live staging market `WBTC:USDso` (best bid `80978.8`, best ask `80995.1`, read from `GET /v0/orderbooks?symbols=WBTC:USDso&depth=1` on 2026-10-28) any quote balance below `0.081` produces an amount below `1e-6`, which stringifies as `"1.2e-7"` and throws.

The maker path calls `buildBuySignal` directly, without the `minQuantity` pre-check that `shouldBuy` performs:

```ts
if (noAsk && !haveLots && !stopTriggered && context.allowedSide !== 'sell') {
  const signal = this.buildBuySignal(buyTriggerPrice.toString(), context, ...);
```

so a dust quote balance combined with a one-sided book throws on the first tick instead of returning `undefined`. The throw escapes `evaluate`, which runs inside the WebSocket handler.

## Impact

A `SyntaxError` from `BigInt()` is not a validation failure the caller can interpret — it aborts the current stack. In the grid bot that means the order book message is dropped and, because the handler has no `catch`, the rejection is unhandled. A wallet holding dust on a high-priced market cannot run the bot at all, and the error message (`Cannot convert 5e-800000 to a BigInt`) points at a number the caller never passed in.

## Fix

Normalise before splitting, and reject what cannot be represented:

```ts
function toScaledInteger(value: string, scale: number): bigint {
  const normalised = Number(value);
  if (!Number.isFinite(normalised)) throw new Error(`Invalid decimal: ${value}`);
  // Work from toFixed(scale) so exponential input is expanded first.
  const fixed = normalised.toFixed(scale);
  const [whole, fraction = ''] = fixed.split('.');
  const digits = `${whole}${(fraction + '0'.repeat(scale)).slice(0, scale)}`;
  return BigInt(digits);
}
```

and derive `scale` from the expanded string rather than from `decimalPlaces` on the raw input. Callers that compute an amount should also clamp to `minQuantity` before formatting, so dust never reaches the parser.
