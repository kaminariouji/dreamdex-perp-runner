# dreamDEX Perps Runner — MVP for the Perps Builder Bounty

A perpetual-futures bot for [dreamDEX](https://app.testnet.dreamdex.io) on the Somnia Tokyo
testnet. It opens a bracketed perp position, watches the pool mark, closes on take-profit or
stop-loss, and repeats — writing a JSON evidence trail for every order it sends.

Built for the **dreamDEX Perps Builder Bounty, MVP track** (19 October – 1 November 2026).

> This repository is a fork of [somnia-chain/dreamdex-bot-kit](https://github.com/somnia-chain/dreamdex-bot-kit)
> (MIT). The kit supplies the shared perp client; everything new lives in
> [strategies/perp-runner](strategies/perp-runner).

## What it is

| | |
| --- | --- |
| Market | ETH-PERP on Somnia Tokyo testnet (Hideki) |
| Strategy | Bracketed market entry, watched take-profit and stop-loss, repeated cycles |
| Key | A bot key linked in the dreamDEX app — it can place and cancel orders, never withdraw |
| Capital | Paper USDso from Perps Arena; the only real cost is testnet gas |
| Evidence | `runs/ETH-PERP-<date>.jsonl`, one JSON line per event |

## Who it is for

Traders who already bracket every position and want it to run without them: the bot re-enters
after each exit, sizes from the pool's own rule instead of a local calculation, and gives up on a
cycle rather than holding a position open against a stale mark.

It is also a reference for anyone wiring a bot key to dreamDEX perps, because the sharp edge is
not the order — it is that a trading key cannot arm stops on the stop registry, so the exit has to
be watched by the bot and only protects the position while the bot runs.

## Run it

```bash
git clone <this repo> && cd dreamdex-perp-runner
npm install
cp strategies/perp-runner/.env.example strategies/perp-runner/.env
# fill in PRIVATE_KEY (the linked bot key) and OWNER_ADDRESS (your account)
npm start -w perp-runner     # DRY_RUN=true until you change it
```

Node 20 or newer. Full configuration reference:
[strategies/perp-runner/README.md](strategies/perp-runner/README.md).

## Evidence

Every run below placed and closed real orders on Somnia Tokyo testnet, with paper USDso from the
Perps Arena. Totals come from the `summary` event each run writes to its own log.

| Run (2026-10-20) | Cycles | Take-profit | Stop-loss | Timeout | Net uPnL (USDso) |
| --- | --- | --- | --- | --- | --- |
| 12:33 UTC | 10 | 0 | 0 | 10 | −0.5075 |
| 12:45 UTC | 10 | 2 | 0 | 8 | −0.0986 |
| 13:21 UTC | 10 | 3 | 0 | 7 | −0.6831 |
| 13:45 UTC | 6 | 4 | 0 | 2 | −0.0611 |

The last run, in full — order id and transaction hash for both legs of every cycle:

| # | Outcome | uPnL | Open order | Open tx | Close order | Close tx |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | take-profit | +0.0055 | `10201049472761388983536` | [`0xdeb6ddb5`](https://explorer.testnet.somnia.network/tx/0xdeb6ddb55b016d86f51132ac411f0aa117f8df3870dfc3ec8ff1a17ad57e219b) | `12064170624206053697342` | [`0xcb047780`](https://explorer.testnet.somnia.network/tx/0xcb047780af04bf51f6ef96bc7ccfe85a26cf51c7ddb30004bf0aa00b2249096c) |
| 2 | take-profit | +0.0949 | `10422410401645903603564` | [`0x2c28dcec`](https://explorer.testnet.somnia.network/tx/0x2c28dcec5b973c4d258006800ac3e166fec9c7e771fe17814d92d30234fd806b) | `5349555781375776909325` | [`0x09c983a2`](https://explorer.testnet.somnia.network/tx/0x09c983a2ea053458c803a6b802182f30df684c30f4fefd1f18dad7aec259d6ca) |
| 3 | take-profit | +0.0293 | `18815678955183749589102` | [`0xb2d2a4b8`](https://explorer.testnet.somnia.network/tx/0xb2d2a4b8f8ed7bbd00c4b2f93629689d066bcac67c0239d8457eff5b1465806e) | `5257322061007229151555` | [`0xed9bf02e`](https://explorer.testnet.somnia.network/tx/0xed9bf02ebd6eb316f63be6614317476df7b1ae6c0813e18c281cffb96bd56173) |
| 4 | take-profit | −0.0093 | `16436048969675217430870` | [`0xc2ad778d`](https://explorer.testnet.somnia.network/tx/0xc2ad778d96fc34e26bc0cfc3fcac4ca93175496dcdf307d8aa059f91d677e61c) | `21139968708471153093259` | [`0x655b3591`](https://explorer.testnet.somnia.network/tx/0x655b359120e887e845630bc84c3be7ef8247476a6623e939b97d4a66b4410479) |
| 5 | timeout | −0.1915 | `16380708737454088776412` | [`0x7579ae21`](https://explorer.testnet.somnia.network/tx/0x7579ae2183455710b22461c6c2ae9e999120d7c2b546283eb5d944289d046f59) | `5312662293228357808534` | [`0x721a8d0a`](https://explorer.testnet.somnia.network/tx/0x721a8d0a6c03b7705486488e8590495770ec6d8759bd8887aec98de707f43364) |
| 6 | timeout | +0.0100 | `5368002525449486463403` | [`0xb1d334b7`](https://explorer.testnet.somnia.network/tx/0xb1d334b76d6b0cf72c6811c897a1fdb894f296e54dd0f790f64dc764dd5a1ab2) | `21121521964397443544923` | [`0x2ceb8cda`](https://explorer.testnet.somnia.network/tx/0x2ceb8cdaa1f85ff58acee1507a991d4345ec50050030fa8183bed4197d70a98c) |

Accounts used: bot key `0xc3928694DF1e99eA81a537C1c6055267021144E9`, account
`0x413FB4BF95004e978890eE03B151BE47bdB9464D`, chain 50383. Any hash above can be checked with
`eth_getTransactionByHash` on `https://api.hideki2.infra.testnet.somnia.network`.

`node strategies/perp-runner/summarize.mjs <run.jsonl>` regenerates the second table from a log.

### What the numbers say

The harness is solid: 36 cycles, every position closed, no orphan left open, and the timeout path
flattens instead of adopting a position into the next cycle. The strategy is not profitable at
these settings — a 0.12% take-profit is inside two minutes of noise on ETH-PERP, so 27 of 36
cycles ended on the timeout rather than on a level. That is a parameter finding, not a code
finding: widening the target or trailing the mark is the next experiment.

## Why this side: funding

A bracket on a coin nobody is paying you to hold is a coin flip with a fee attached. The venue
states one thing in advance — the funding rate — so the runner reads it before it opens anything
(`PERP_MIN_FUNDING_APR`, 0 disables the gate). Measured on 2026-10-20 over the last 48 settled
intervals per market (`fundingWindowSec` 28800, `fundingIntervalSec` 3600):

| Market | Min APR | Median APR | Max APR | Intervals paying shorts |
| --- | --- | --- | --- | --- |
| BTC-PERP | 93.18% | 170.76% | 305.80% | 48 / 48 |
| ETH-PERP | 10.95% | 10.95% | 10.95% | 48 / 48 |
| LIT-PERP | −52.21% | −29.88% | 10.95% | 1 / 48 (pays longs) |

Funding is not a signal about price. It is a payment for holding a side, and it is the only part of
the trade that is known before the entry. The gate turns it into a filter: with
`PERP_MIN_FUNDING_APR=50`, a short on BTC-PERP opens and a long stands down —

```
funding pays short at 155.64% APR, above the 50% gate
standing down: funding pays short at 155.64% APR, below the 50% gate for a long
```

Scale, stated plainly: 170% APR is 0.019% per hour. On a $300 short that is about six cents an
hour, so a 90-minute run measures the mechanism, not the yield — over a day the price moves more
than the funding pays.

That is not a hypothesis here. We ran it: short BTC-PERP at 81,968.80, and 17 minutes later the
mark was 83,432.40. Price cost $5.36, funding paid about $0.02, and the run closed flat by hand
(order `21767158006977277443853`). Unhedged carry at this size is a directional bet with a
rounding error attached.

The other leg exists: the venue lists WBTC/USDso as a spot market (102,755 trades at the time of
writing), so the short can be hedged instead of hoped at. The gate is shipped as a filter, and the
hedged version is the next build — the numbers above are the argument for it.

## Feedback items

The feedback track wants one Markdown file per issue. Items found while building this bot live in
[feedback/](feedback/):

- [01 — net_version disagrees with eth_chainId on the Hideki RPC](feedback/01-hideki-net-version-mismatch.md)
- [02 — In trading-key mode, armBracket fails with an SDK-internal error](feedback/02-trading-key-cannot-arm-stops.md)
- [03 — sizeForNotional returns 0n instead of a below-minimum error](feedback/03-size-for-notional-silent-zero.md)
- [04 — Market-data calls reject the display name, with a hint that is already satisfied](feedback/04-display-name-rejected-by-market-data.md)
- [05 — "Link your Discord" stays at 0/1 while the wallet shows the account linked](feedback/05-discord-quest-stuck.md)

## X posts

Posts about this MVP, tagging [@DreamDEXSomnia](https://x.com/DreamDEXSomnia):

- [Announcing the bot](https://x.com/kaminariouji/status/2112506360290300099)
- [The trading-key edge: exits must be watched, not armed](https://x.com/kaminariouji/status/2112506535456960976)
- [Run evidence: live order ids and the run log](https://x.com/kaminariouji/status/2112507321339478259)

## Safety

`DRY_RUN` defaults to true in code and in `.env.example`, but a `.env` line overrides the code
default — check the effective value before you start a run. The bot never withdraws: a linked bot
key has no withdrawal rights.

## License

MIT, inherited from the kit. See [LICENSE](LICENSE).
