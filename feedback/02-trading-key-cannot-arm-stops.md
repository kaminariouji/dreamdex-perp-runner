# Trading-key mode cannot reach the stop-order helpers: `exchange.trader` throws

Severity: major
Area: API

The bot kit documents trading-key mode (`OWNER_ADDRESS` + a linked bot key in
`PRIVATE_KEY`) as the safe way to run a bot: the key can place, cancel and
reduce orders for the account, cannot withdraw, and every read is scoped to the
owner. `packages/perp-core/src/stops.ts` does not go through the key. It calls
`ctx.exchange.trader.placePerpStopOrder(...)`, and in trading-key mode the
`SomniaMarkets` instance is built with the owner as a bare address, so it has no
signer. Reading `.trader` throws before any stop is armed.

`armBracket` (`stops.ts:83`) and `cancelStops` (`stops.ts:131`) are therefore
unreachable in the mode the kit recommends. A bot that wants a take-profit and a
stop-loss on the exchange has to either run with the owner key — the thing
trading keys exist to avoid — or watch the position in-process, which stops the
moment the process does.

## Steps to reproduce

```bash
# .env: NETWORK=hideki, OWNER_ADDRESS=0x…, PRIVATE_KEY=<bot key linked to it>
npx tsx -e '
import { createExchange } from "@dreamdex-bot-kit/perp-core";
const ctx = createExchange({ withSigner: true });
console.log("owner      =", ctx.config.owner);
console.log("tradingKey =", ctx.tradingKey?.operator, "->", ctx.tradingKey?.owner);
ctx.exchange.trader;
'
```

## Expected

Either the trader is bound to the owner through the key, so `armBracket` works
in key mode, or the call fails with a message that names the missing capability
("stops require the owner key") and the docs say so next to the bracket helper.

## Actual

```
owner      = 0x413FB4BF95004e978890eE03B151BE47bdB9464D
tradingKey = 0xc3928694DF1e99eA81a537C1c6055267021144E9 -> 0x413FB4BF95004e978890eE03B151BE47bdB9464D
FATAL @somnia-chain/markets-sdk: createTrader is authenticated — construct SomniaMarkets with a privateKey / account / walletClient
```

The throw comes from the SDK's `createTrader` getter, not from the stop path, so
it fires for every caller that touches `exchange.trader` in key mode.

## Evidence

Captured on 2026-10-20 against the live Hideki testnet, with a key that is
linked and trading (it placed and closed the orders in this repo's README):

```
owner      = 0x413FB4BF95004e978890eE03B151BE47bdB9464D
tradingKey = 0xc3928694DF1e99eA81a537C1c6055267021144E9 -> 0x413FB4BF95004e978890eE03B151BE47bdB9464D
exchange.trader -> FATAL @somnia-chain/markets-sdk: createTrader is authenticated
```

Source, `packages/perp-core/src/exchange.ts` (trading-key branch): the exchange
is constructed as `new SomniaMarkets({ ...base, account: config.owner })` — an
address, no key. Source, `packages/perp-core/src/stops.ts`: both stop writers
use `ctx.exchange.trader`. By contrast `packages/perp-core/src/orders.ts:175`
does the right thing for plain orders: `ctx.tradingKey ? placeFor(ctx.tradingKey,
order) : ctx.exchange.trader.placePerpOrder(order)`. The stop path has no such
branch.

## Environment

- Network: Somnia Tokyo testnet (Hideki), chain id 50383
- Kit: dreamdex-bot-kit, `packages/perp-core` 0.1.0
- SDK: @somnia-chain/markets-sdk 0.31.0
- Owner account: 0x413FB4BF95004e978890eE03B151BE47bdB9464D
- Bot key: 0xc3928694DF1e99eA81a537C1c6055267021144E9

## Why it matters

Trading-key mode is the only mode where a bot can run without holding the
withdrawal key, so it is the mode a hosted bot (Railway, a VPS, a container) will
use. In that mode there is no exchange-side take-profit or stop-loss, so the
position's protection lives in the bot process: a restart, a deploy, an OOM kill
or an expired token leaves an open position with no exit. That is a materially
different risk profile from what the kit's bracket helper appears to offer, and
it is worth either fixing (a `placeStopFor` granted to trading keys) or stating
in the docs.
