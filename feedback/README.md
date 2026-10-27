# dreamDEX Perps Builder Bounty — feedback items

Reproducible items found against the dreamDEX stack on Somnia Tokyo testnet, submitted for the **Feedback** track of the dreamDEX Perps Builder Bounty (DoraHacks, 19 Oct – 1 Nov 2026).

One file per item, in the format the bounty asks for. Every item states the exact request and the exact response, so it can be re-run in one command.

| # | Item | Severity | Area | Filed |
|---|---|---|---|---|
| 01 | `net_version` disagrees with `eth_chainId` on the Hideki testnet RPC | normal | API | 2026-10-21 |
| 02 | In trading-key mode, `armBracket` fails with an SDK-internal error | major | SDK | 2026-10-20 |
| 03 | `sizeForNotional` returns `0n` instead of a below-minimum error | normal | SDK | 2026-10-20 |
| 04 | Market-data calls reject the display name, with a hint that is already satisfied | normal | API | 2026-10-20 |
| 05 | "Link your Discord" stays at 0/1 while the wallet shows the account linked | normal | UI | 2026-10-20 |
| 06 | `fetchOrderbooks` cannot request more than one symbol: the API rejects the comma-joined list the SDK sends | major | SDK | 2026-10-27 |
| 07 | 404s leave the JSON error envelope: the body is `text/plain` and carries no `name` | normal | API | 2026-10-27 |
| 08 | `MarketInfo` omits `kind` and `stopRegistry`, so a typed client cannot see fields the API returns | normal | SDK | 2026-10-27 |
| 09 | `fromRaw` returns a JS number, so raw amounts above 2^53 lose digits | normal | SDK | 2026-10-27 |
| 10 | `NonceManager.resync()` can hand out a nonce it already allocated | major | SDK | 2026-10-27 |
| 11 | `DreamDexWs` has no unsubscribe, and every `subscribe()` call is replayed forever | normal | SDK | 2026-10-27 |
| 12 | `cancelOrder` and `cancelOrderFor` never check the receipt, so a reverted cancel returns as success | major | SDK | 2026-10-27 |

Base for all API items: `https://stg.api.dreamdex.io/v0`. SDK: `@dreamdex-bot-kit/core` 0.1.0.

One file per distinct issue: an issue already filed is not filed again under a second number. Security vulnerabilities are not filed here; they go privately to security@dreamdex.io as the bounty requires.

