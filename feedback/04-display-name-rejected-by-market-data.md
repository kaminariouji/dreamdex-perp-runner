# Market-data calls reject every name but the exact ccxt symbol, and the error points at the wrong cause

Severity: normal
Area: API

`perpMarkets()` returns two names for each market: `.display` (`BTC-PERP`) and
`.symbol` (`BTC/USDso:USDso`). Trading helpers accept the display name — the kit's own
`requireMarket()` compares the base asset, so `requireMarket(ex, "ETH-PERP")` resolves
and the runner places real orders on it. The market-data methods accept **only** the
exact `.symbol`, and when they reject anything else they blame the wrong thing:

```
unknown symbol BTC-PERP — call loadMarkets() first
```

Markets *were* loaded — 55 of them, including the one being asked for. The reader
follows the hint, re-runs `loadMarkets()`, and gets the same error.

## Steps to reproduce

```bash
npx tsx -e '
import { createExchange, perpMarkets } from "@dreamdex-bot-kit/perp-core";
const ex = createExchange({ withSigner: false });
await ex.exchange.loadMarkets(true);
console.log("markets loaded:", Object.keys(ex.exchange.markets).length);
const btc = (await perpMarkets(ex.exchange, false)).find((m) => m.display === "BTC-PERP");
console.log("display:", btc.display, "| symbol:", btc.symbol);
for (const s of ["BTC-PERP", "BTC:USDso", "BTC/USDso", "BTC/USDso:USDso"]) {
  try { const c = await ex.exchange.fetchOHLCV(s, "1h", undefined, 3); console.log(s, "OK", c.length); }
  catch (e) { console.log(s, "ERR", e.message); }
}
'
```

## Actual

```
markets loaded: 55
display: BTC-PERP | symbol: BTC/USDso:USDso
BTC-PERP         ERR @somnia-chain/markets-sdk: unknown symbol BTC-PERP — call loadMarkets() first
BTC:USDso        ERR @somnia-chain/markets-sdk: unknown symbol BTC:USDso — call loadMarkets() first
BTC/USDso        ERR @somnia-chain/markets-sdk: unknown symbol BTC/USDso — call loadMarkets() first
BTC/USDso:USDso  OK 3
```

`market("BTC-PERP")` and `fetchTicker("BTC-PERP")` fail identically.

## Expected

Accept the display name (it is what `perpMarkets()` returns and what every order
example in the repo uses), or reject it naming the handle that would work:

```
unknown symbol BTC-PERP — this market's tradable symbol is BTC/USDso:USDso
```

and keep "call loadMarkets() first" for when `markets` is actually empty.

## Where it comes from

`dist/unified/symbols.js:161-169` (0.30.0; `:219` in 0.31.0), `resolve()`: a non-chain ref goes straight to
`this.bySymbol.get(marketSymbol)`, and `bySymbol` is keyed only by the synthesized
symbol built in `build()`. `byRef` already holds the market id, the pool address and
(binary) the market address — the display name is the one handle that is never
registered, and `resolve()` never consults `byRef` on the symbol path anyway.

Registering the display name in `build()` and falling back to `byRef` before throwing
fixes the lookup; the message fix alone is three lines and removes the wrong lead.

## Evidence

Live Hideki testnet, 2026-10-20 15:33 UTC. Reproduced on `@somnia-chain/markets-sdk
0.30.0` (the version installed in the working copy) with `@dreamdex-bot-kit/perp-core
0.1.0`, Node v24.21.0; raw run in [04.log](04.log). Output above is verbatim, and the
successful call returned `[1792494000000,81628.3,82490,81538.2,81572.6,7.7571]`, so the
data path is fine.

The published `0.31.0` tarball — the range `packages/perp-core/package.json` declares —
carries the same path: `resolve()` still goes from `splitSymbol()` straight to
`this.bySymbol.get()` and still throws `unknown symbol ${ref} — call loadMarkets()
first` (`dist/unified/symbols.js:219`). No display-name handling was added, so this is
not fixed in the newer release.

The docs make the miss more likely rather than less: the only candle example in
`docs/backtesting.md` is `--symbol WETH:USDso`, a spot pair, so `BTC:USDso` is the
natural guess for a perp — and it is one of the four names that fail above.

## Why it matters

The kit has 21 perp markets and every strategy trades them by display name. Market
data is the one surface where that name silently stops working, and the error sends
the caller to fix `loadMarkets()` instead of the name. The cost is a debugging loop
that ends with reading `symbols.js` — the reporter of this item went through exactly
that loop before finding `.symbol`.
