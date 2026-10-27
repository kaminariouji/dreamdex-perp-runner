# dreamDEX Perps Builder Bounty — feedback items

Reproducible items found against the dreamDEX stack on Somnia Tokyo testnet, submitted for the **Feedback** track of the dreamDEX Perps Builder Bounty (DoraHacks, 19 Oct – 1 Nov 2026).

One file per item, in the format the bounty asks for. Every item states the exact request and the exact response, so it can be re-run in one command.

| # | Item | Severity | Area |
|---|---|---|---|
| 01 | `net_version` and `eth_chainId` disagree on the same node | major | API |
| 02 | `fetchOrderbooks` cannot request more than one symbol: the API rejects the comma-joined list the SDK sends | major | SDK |
| 03 | 404s leave the JSON error envelope: the body is `text/plain` and carries no `name` | normal | API |
| 04 | `MarketInfo` omits `kind` and `stopRegistry`, so a typed client cannot see fields the API returns | normal | SDK |

Base for all API items: `https://stg.api.dreamdex.io/v0`. SDK: `@dreamdex-bot-kit/core` 0.1.0.

Security vulnerabilities are not filed here; they go privately to security@dreamdex.io as the bounty requires.
