# `sizeForNotional` returns `0n` for a valid request instead of saying the size is below the market minimum

Severity: normal
Area: API

`sizeForNotional(notionalUsdso, info, atMark)` converts a USDso notional into a
base-unit quantity, floors it to `lotSize`, and returns `0n` when the result
falls under `minQuantity`. The floor is right; returning zero without a word is
not. A caller that asks for "$20 of NEAR-PERP" gets `0n` and no error, and the
next thing it does is usually submit that zero as an order quantity.

The same helper also lets a bad input escape as a raw `BigInt` conversion error.

## Steps to reproduce

```bash
npx tsx -e '
import { createExchange, requireMarket, liveMark, sizeForNotional } from "@dreamdex-bot-kit/perp-core";
const ctx = createExchange({ withSigner: false });
await ctx.exchange.loadMarkets(true);
const near = await requireMarket(ctx.exchange, "NEAR-PERP");
const mark = await liveMark(ctx.exchange, near);
for (const n of [10, 20, 23.83, 50]) console.log(n, "->", sizeForNotional(n, near.info, mark).toString());
try { sizeForNotional(1e30, near.info, mark); } catch (e) { console.log("1e30 THREW:", e.message); }
'
```

## Expected

A size that cannot be represented on this market is a rejection, not a value:
throw (or return `undefined`) with the numbers that made it impossible —
`notional 20 < minNotional 23.74 (minQuantity 5.1 × mark 4.6558)`. A notional
that overflows should say so in the same vocabulary.

## Actual

```
10 -> 0
20 -> 0
23.83 -> 5100000000000000000000000
50 -> 10700000000000000000000000
1e30 THREW: Cannot convert 21494709473376766e+290000 to a BigInt
```

`0n` is indistinguishable from "this market has no size", and the overflow path
reports an internal conversion rather than an input problem.

## Evidence

Live Hideki testnet, 2026-10-20. NEAR-PERP at the time: `mark 4.655805276382`,
`minQuantity 5.1`, `lotSize 0.1`, `baseDecimals 24` — a minimum notional of
$23.74, which is the highest of the 21 listed perp markets (the next is WLD at
$14.34; BTC is $10.58). Output above is verbatim.

For completeness, the same call on BTC-PERP returns `24000` for `$20`
(0.00024 BTC at 81,320), so the helper is correct where the notional clears the
minimum — this is about the failure signal, not the arithmetic.

## Environment

- Network: Somnia Tokyo testnet (Hideki), chain id 50383
- Kit: dreamdex-bot-kit, `packages/perp-core` 0.1.0
- SDK: @somnia-chain/markets-sdk 0.31.0

## Why it matters

Every strategy in the kit sizes from `PERP_NOTIONAL_USDSO`, and the value is a
number in a `.env` file that a user edits without knowing each market's
minimum. A silent `0n` turns a config mistake into a rejected order with no
pointer to the cause, and the markets with the highest minimum (NEAR $23.74,
WLD $14.34) are exactly the ones a small test account reaches for. A throw with
the two numbers in it would end that in one line.
