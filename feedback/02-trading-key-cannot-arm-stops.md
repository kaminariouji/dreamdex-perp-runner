# In trading-key mode, `armBracket` fails with an SDK-internal error instead of naming the missing capability

Severity: normal
Area: API

Trading keys cannot arm stop orders — the docs say so (`docs/perps.md:65`, "Stop
orders can only be armed by the account itself"), and `strategies/perp-starter`
handles it: `const watchedExits = Boolean(ctx.config.owner)` (line 70) routes key
mode to a watch loop and never calls the bracket helper.

The exported helper does not handle it. `packages/perp-core/src/stops.ts` calls
`ctx.exchange.trader.placePerpStopOrder(...)` (line 83) and `cancelStops` does the
same (line 131). In key mode the `SomniaMarkets` instance is built with the owner
as a bare address, so it has no signer, and reading `.trader` throws:

```
FATAL @somnia-chain/markets-sdk: createTrader is authenticated — construct SomniaMarkets with a privateKey / account / walletClient
```

That message points at how the `SomniaMarkets` instance was constructed. It does
not say that stops need the owner key, which is the actual constraint, and it
names neither the market nor the call the caller made.

## Steps to reproduce

```bash
# .env: NETWORK=hideki, OWNER_ADDRESS=0x…, PRIVATE_KEY=<bot key linked to it>
npx tsx -e '
import { createExchange, requireMarket, armBracket } from "@dreamdex-bot-kit/perp-core";
const ctx = createExchange({ withSigner: true });
const market = await requireMarket(ctx.exchange, "ETH-PERP");
await armBracket({ ctx, market, position: "long", takeProfit: 2500n * 10n ** 18n, stopLoss: 2300n * 10n ** 18n });
'
```

## Expected

A rejection that names the rule, thrown before the SDK is touched:

```
stops need the owner key: this account is trading through a linked bot key.
Use a watched exit (see strategies/perp-starter) or run with the owner key.
```

## Actual

The call reaches `ctx.exchange.trader` and dies there, with a message about
`SomniaMarkets` construction. A caller has to read `exchange.ts` to learn that the
account was deliberately built read-only.

## Evidence

Captured 2026-10-20 on Hideki, with a key that is linked and trading (it placed
and closed the orders in this repo's README):

```
owner      = 0x413FB4BF95004e978890eE03B151BE47bdB9464D
tradingKey = 0xc3928694DF1e99eA81a537C1c6055267021144E9 -> 0x413FB4BF95004e978890eE03B151BE47bdB9464D
ctx.exchange.trader -> FATAL @somnia-chain/markets-sdk: createTrader is authenticated
```

Source: `packages/perp-core/src/exchange.ts` builds the key-mode exchange as
`new SomniaMarkets({ ...base, account: config.owner })` — an address, no key.
`orders.ts:175` branches on `ctx.tradingKey` for plain orders; `stops.ts` has no
such branch, and no guard.

## Environment

- Network: Somnia Tokyo testnet (Hideki), chain id 50383
- Kit: dreamdex-bot-kit, `packages/perp-core` 0.1.0
- SDK: @somnia-chain/markets-sdk 0.31.0

## Why it matters

Small on its own: the documented path works, and the strategy that ships with the
kit avoids the call. It matters because `armBracket` is the exported, documented
entry point for stop orders, and the first thing a builder does with it is run it
in key mode — the mode the same page recommends. One guard at the top of
`armBracket` and `cancelStops` (`if (ctx.tradingKey) throw new Error("stops need
the owner key …")`) turns a stack trace into a sentence.
