# `MarketInfo` omits `kind` and `stopRegistry`, so a typed client cannot see fields the API returns

Severity: normal
Area: SDK

## Steps to reproduce

1. Fetch the market list:

```bash
curl -s 'https://stg.api.dreamdex.io/v0/markets'
```

2. Compare the payload with the interface the SDK exports for it, `MarketInfo` in `packages/core/src/rest.ts`.

## Expected

The type describes the payload. A consumer that reads `market.kind` or `market.stopRegistry` compiles and type-checks, because both fields are always present in the response.

## Actual

Every market carries `kind` and `stopRegistry`, and neither is in the interface:

```json
{"base":"0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00","baseDecimals":18,"contract":"0x259fD6559214dd5aD3752322426eA9F9fABEFff4","kind":"spot","lotSize":"0.01","minQuantity":"1","quote":"0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171","quoteDecimals":18,"stopRegistry":"0xEb97349Aa62A68507c0bE535eD88B0d028a47E1e","symbol":"SOMI:USDso","tickSize":"0.0001"}
```

The interface stops at `minQuantity`:

```ts
export interface MarketInfo {
  symbol: string;
  contract: `0x${string}`;
  base: `0x${string}`;
  quote: `0x${string}`;
  baseDecimals: number;
  quoteDecimals: number;
  tickSize: string;
  lotSize: string;
  minQuantity: string;
}
```

`stopRegistry` is the address the stop-order docs tell a bot to talk to (docs/perps.md: "Stop orders can only be armed by the account itself"), and `kind` is the field the `kind=spot|perp|all` filter selects on, so both are load-bearing for a perp bot. A typed consumer has to cast `market as any` to reach them, which is where the perp path of this kit ended up.

## Evidence

Captured 2026-10-27T17:05Z against `https://stg.api.dreamdex.io/v0/markets`:

```
$ curl -s 'https://stg.api.dreamdex.io/v0/markets' | head -c 200
{"markets":[{"base":"0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00","baseDecimals":18,"contract":"0x259fD6559214dd5aD3752322426eA9F9fABEFff4","kind":"spot",...

$ curl -s 'https://stg.api.dreamdex.io/v0/markets?kind=perp'
{"markets":[]}
```

The second call is worth a line in the docs on its own: the filter is supported (`kind=bogus` is rejected with `enum ["spot","perp","all"]`), and on this environment `perp` is empty, so a reader who expects the perp markets to be listed by the REST API finds nothing and no explanation.

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0, REST base `https://stg.api.dreamdex.io/v0`, no auth required.
