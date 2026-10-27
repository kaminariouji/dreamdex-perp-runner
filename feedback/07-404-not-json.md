# 404s leave the JSON error envelope: the body is `text/plain` and carries no `name`

Severity: normal
Area: API

## Steps to reproduce

1. Request a path that does not exist under an existing resource:

```bash
curl -s -i 'https://stg.api.dreamdex.io/v0/markets/SOMI:USDso' | head -6
```

2. Compare with a request that fails inside a route that exists:

```bash
curl -s 'https://stg.api.dreamdex.io/v0/markets/SOMI:USDso/orders/1'
```

## Expected

Every error answers in the envelope the SDK is written against — `{"description", "name", "status"}` — with `name` as the stable machine-readable code, as documented in `rest.ts` ("The stable machine-readable error is in `name`").

## Actual

404s are served by the router as plain text, so a client that reads `name` gets nothing and the SDK falls back to `apiName = "http_error"`:

```
HTTP/1.1 404 Not Found
content-type: text/plain; charset=utf-8

404 page not found
```

The 401 from a real route is JSON, which is why the inconsistency only shows up on 404:

```json
{"description":"authentication required","name":"unauthorized","status":401}
```

A bot that mistypes a symbol or a path cannot tell "route does not exist" from "authentication failed" or "bad parameter" by `name`, and `safeJson` in the SDK turns the body into `{raw: "404 page not found\n"}`, which then lands inside `DreamDexApiError.detail`.

## Evidence

Captured 2026-10-27T17:05Z, re-run 2026-10-27T17:18Z.

```
$ curl -s -i 'https://stg.api.dreamdex.io/v0/markets/SOMI:USDso' | head -6
HTTP/1.1 404 Not Found
content-type: text/plain; charset=utf-8
vary: Origin
x-content-type-options: nosniff
x-cloud-trace-context: dcef29151f57ea3fb003b2357e567b4f
date: Tue, 27 Oct 2026 17:05:05 GMT
404 page not found

$ curl -s 'https://stg.api.dreamdex.io/v0/markets/SOMI:USDso/orders/1'
{"description":"authentication required","name":"unauthorized","status":401}

$ curl -s 'https://stg.api.dreamdex.io/v0/perp/markets'
404 page not found
```

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0, REST base `https://stg.api.dreamdex.io/v0`, no auth required to reproduce.
