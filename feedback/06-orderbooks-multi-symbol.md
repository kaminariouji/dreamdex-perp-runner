# `fetchOrderbooks` cannot request more than one symbol: the API rejects the comma-joined list the SDK sends

Severity: major
Area: SDK

## Steps to reproduce

1. Call the canonical multi-symbol orderbook endpoint the way `DreamDexRest.fetchOrderbooks` builds it (`packages/core/src/rest.ts:71-74`: `const q = encodeURIComponent(symbols.join(","))`), with two markets:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://stg.api.dreamdex.io/v0/orderbooks?symbols=SOMI:USDso,WBTC:USDso&depth=2'
```

2. For comparison, send the same two markets as repeated query parameters:

```bash
curl -s 'https://stg.api.dreamdex.io/v0/orderbooks?symbols=SOMI:USDso&symbols=WBTC:USDso&depth=2'
```

3. Also try a single symbol, which is the only case that works today:

```bash
curl -s 'https://stg.api.dreamdex.io/v0/orderbooks?symbols=SOMI:USDso&depth=2'
```

## Expected

The documented "canonical multi-symbol orderbook endpoint" returns one book per requested market. `fetchOrderbooks(["SOMI:USDso", "WBTC:USDso"])` should return two entries, exactly like the repeated-parameter form does.

## Actual

The comma-joined form is rejected as if the whole string were one unknown symbol:

```json
{"context":{"invalid_symbols":["SOMI:USDso,WBTC:USDso"]},"description":"unknown market symbols: SOMI:USDso,WBTC:USDso","name":"invalid_param","status":400}
```

So the SDK helper fails for every call with two or more symbols — the only shape the helper is for — while the API itself does support multiple symbols when they are repeated parameters. The URL-encoded comma (`%2C`) fails identically, so this is not a client-side encoding problem.

## Evidence

Captured 2026-10-27T17:05Z, re-run 2026-10-27T17:18Z against the live endpoint.

```
$ curl -s -o /dev/null -w '%{http_code}\n' 'https://stg.api.dreamdex.io/v0/orderbooks?symbols=SOMI:USDso,WBTC:USDso&depth=2'
400

$ curl -s 'https://stg.api.dreamdex.io/v0/orderbooks?symbols=SOMI:USDso,WBTC:USDso&depth=2'
{"context":{"invalid_symbols":["SOMI:USDso,WBTC:USDso"]},"description":"unknown market symbols: SOMI:USDso,WBTC:USDso","name":"invalid_param","status":400}

$ curl -s 'https://stg.api.dreamdex.io/v0/orderbooks?symbols=SOMI:USDso&symbols=WBTC:USDso&depth=2' | head -c 120
{"orderbooks":[{"asks":[{"price":"0.1793","quantity":"473.5"},{"price":"0.1794","quantity":...

$ curl -s 'https://stg.api.dreamdex.io/v0/orderbooks?symbols=SOMI:USDso&depth=2' | head -c 60
{"orderbooks":[{"asks":[{"price":"0.1793","quantity":"473.5"}...
```

SDK source, `packages/core/src/rest.ts`:

```ts
/** Canonical multi-symbol orderbook endpoint. Prefer this over per-market paths. */
async fetchOrderbooks(symbols: string[], depth = 5): Promise<unknown> {
  const q = encodeURIComponent(symbols.join(","));
  return this.request("GET", `/orderbooks?symbols=${q}&depth=${depth}`, { auth: false });
}
```

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0 (dreamdex-bot-kit), network Somnia Tokyo testnet, REST base `https://stg.api.dreamdex.io/v0`, no wallet needed (public endpoint).
