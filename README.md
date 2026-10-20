# dreamDEX Perps Runner — MVP for the Perps Builder Bounty

A perpetual-futures bot for [dreamDEX](https://app.testnet.dreamdex.io) on the
Somnia Tokyo testnet. It opens a bracketed perp position, watches the pool mark,
closes on take-profit or stop-loss, and repeats — writing a JSON evidence trail
for every order it sends.

Built for the **dreamDEX Perps Builder Bounty, MVP track** (19 October – 1 November 2026).

> This repository is a fork of
> [somnia-chain/dreamdex-bot-kit](https://github.com/somnia-chain/dreamdex-bot-kit)
> (MIT). The kit supplies the shared perp client; everything new lives in
> [strategies/perp-runner](strategies/perp-runner).

## What it is

| | |
| --- | --- |
| Market | ETH-PERP on Somnia Tokyo testnet (Hideki) |
| Strategy | Bracketed market entry, watched take-profit and stop-loss, repeated cycles |
| Key | A bot key linked in the dreamDEX app — it can place and cancel orders, never withdraw |
| Capital | Paper USDso from Perps Arena; the only real cost is testnet gas |
| Evidence | runs/ETH-PERP-<date>.jsonl, one JSON line per event |

## Who it is for

Traders who already bracket every position and want it to run without them: the
bot re-enters after each exit, sizes from the pool's own rule instead of a local
calculation, and gives up on a cycle rather than holding a position open against
a stale mark.

It is also a reference for anyone wiring a bot key to dreamDEX perps, because the
sharp edge is not the order — it is that a trading key cannot arm stops on the
stop registry, so the exit has to be watched by the bot and only protects the
position while the bot runs.

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

## Live orders on Somnia Tokyo testnet

Placed and closed by this bot during development:

| What | Detail |
| --- | --- |
| Open | long 0.0083 ETH @ 2392.91 — order 3412647653636273931470 |
| Close | short 0.0083 ETH @ 2381.86 — order 21139968708471153036385 |
| Bot key | 0xc3928694DF1e99eA81a537C1c6055267021144E9 |
| Account | 0x413FB4BF95004e978890eE03B151BE47bdB9464D |
| Network | Somnia Tokyo testnet (Hideki, chain 50383) |

Both orders are reproducible from the run log in runs/.

## Feedback items

The feedback track wants one Markdown file per issue. Items found while building
this bot live in [feedback/](feedback/):

- [01 — net_version disagrees with eth_chainId on the Hideki RPC](feedback/01-hideki-net-version-mismatch.md)
- [02 — Trading-key mode cannot reach the stop-order helpers](feedback/02-trading-key-cannot-arm-stops.md)
- [03 — sizeForNotional returns 0n instead of a below-minimum error](feedback/03-size-for-notional-silent-zero.md)

## X posts

Posts about this MVP, tagging [@DreamDEXSomnia](https://x.com/DreamDEXSomnia):

- [Announcing the bot](https://x.com/kaminariouji/status/2112506360290300099)
- [The trading-key edge: exits must be watched, not armed](https://x.com/kaminariouji/status/2112506535456960976)
- [Run evidence: live order ids and the run log](https://x.com/kaminariouji/status/2112507321339478259)

## Safety

DRY_RUN defaults to true in code and in .env.example, but a .env line overrides
the code default — check the effective value before you start a run. The bot
never withdraws: a linked bot key has no withdrawal rights.

## License

MIT, inherited from the kit. See [LICENSE](LICENSE).
