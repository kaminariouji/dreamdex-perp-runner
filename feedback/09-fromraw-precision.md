# `fromRaw` returns a JS number, so raw amounts above 2^53 lose digits

Severity: normal
Area: SDK

## Steps to reproduce

1. Take the helper the SDK uses to turn on-chain raw integers into human values (`packages/core/src/quant.ts:24`, `return Number(formatUnits(raw, decimals))`) and round-trip three values through it:

```bash
node --input-type=module -e "
import { formatUnits } from 'viem';
for (const [raw, dec] of [['1234567890123456789','18'], ['1000000000000000001','18'], ['9007199254740993','0']]) {
  const n = Number(formatUnits(BigInt(raw), Number(dec)));
  const back = BigInt(Math.round(n * 10 ** Number(dec)));
  console.log(raw, '->', n, '-> back', back.toString(), back.toString() === raw ? 'ok' : 'LOST');
}
"
```

## Expected

A raw-in / raw-out round trip through the SDK's own conversion helpers is lossless, or the helper refuses to hand back a type that cannot hold the value. A perps SDK whose balances, tick, lot and min-quantity all pass through `fromRaw` (see `packages/core/src/pool.ts:76-78`, `134`, `150`, `158`) should not silently drop wei.

## Actual

```
1234567890123456789 -> 1.2345678901234567 -> back 1234567890123456768 LOST
1000000000000000001 -> 1                 -> back 1000000000000000000 LOST
9007199254740993    -> 9007199254740992  -> back 9007199254740992     LOST
```

`Number` holds 53 bits of mantissa, so any raw integer above 2^53 (about 9.007e15, i.e. 0.009 tokens at 18 decimals) is rounded to the nearest representable double. At a raw balance of 1e18 the unit in the last place is 128 wei; at 1e21 it is 131,072 wei. Round-tripping that number back through `toRaw` (`quant.ts:17`, `parseUnits(s, decimals)`) writes the rounded value, not the original.

The failure is silent: nothing in the API says "this is approximate", and `toRaw(fromRaw(x)) !== x` for any x above 2^53.

## Evidence

Captured 2026-10-27T17:3xZ against SDK `@dreamdex-bot-kit/core` 0.1.0, using the same `viem` `formatUnits` the helper calls.

```
$ node --input-type=module -e "..."   # the command above
1234567890123456789 -> 1.2345678901234567 -> back 1234567890123456768 LOST
1000000000000000001 -> 1                 -> back 1000000000000000000 LOST
9007199254740993    -> 9007199254740992  -> back 9007199254740992     LOST
```

Source, `packages/core/src/quant.ts`:

```ts
export function fromRaw(raw: bigint, decimals: number): number {
  return Number(formatUnits(raw, decimals));
}
```

Call sites that matter for a bot, `packages/core/src/pool.ts`:

```ts
get tick(): number { return fromRaw(this.params.tickSize, this.quoteDecimals); }
get lot(): number { return fromRaw(this.params.lotSize, this.baseDecimals); }
get minQty(): number { return fromRaw(this.params.minQuantity, this.baseDecimals); }
```

## Suggested fix

Return `string` (or a `{ raw: bigint, formatted: string }` pair) and keep `number` only behind an explicit `toNumberUnsafe`. Every caller in `pool.ts` that feeds a value back into `toRaw` should carry the bigint instead.

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0 (dreamdex-bot-kit), `viem` as bundled, Node 24, no network and no wallet needed.

