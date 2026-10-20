# perp-runner

Repeats the bracketed perp cycle that `perp-starter` does once: open a market
order on a dreamDEX perpetual, watch the live mark, close on take-profit or
stop-loss, cool down, and go again.

It is built for the **Perps Builder Bounty MVP track** and runs against
**Somnia Tokyo testnet** with paper USDso, so it costs nothing but testnet gas.

## What it does each cycle

1. Reuses a position that is already open instead of stacking a second one.
2. Sizes from `PERP_NOTIONAL_USDSO` through the pool's own rule, so the number
   the pool accepts is the number traded.
3. Places one market order and records it.
4. Sets take-profit and stop-loss against the **live pool mark**, not the market
   row, which lags by tens of minutes.
5. Watches the mark every tick and closes the whole position when either level
   is reached. A cycle that runs past `PERP_MAX_WAIT_PER_CYCLE_MS` is closed flat
   instead of being carried into the next cycle.
6. Writes one JSON line per event to `runs/`.

## Why not just perp-starter

`perp-starter` opens one position, arms a bracket, and stops. That is correct
for a demo and wrong for a bot you leave running: nothing re-enters, nothing is
recorded, and a cycle that never reaches a level just sits there. This runner
loops, records, and gives up on a cycle instead of holding a position open
against a stale mark.

## Exits are watched, not armed

With a trading key (`OWNER_ADDRESS` set) the stop registry is unavailable,
because only the account itself can arm a stop. The bot watches the mark and
closes by itself, so **the exits act only while the bot is running**. A linked
key can place and cancel orders but can never withdraw funds.

## Run it

```bash
cp .env.example .env      # fill in PRIVATE_KEY (bot key) and OWNER_ADDRESS
npm install               # from the repository root
npm start -w perp-runner  # DRY_RUN=true until you say otherwise
```

## Configuration

Every value above is read from `.env`. The defaults in code exist only as a
fallback: **a `.env` line always wins**, including `DRY_RUN`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PERP_SYMBOL` | `ETH-PERP` | Market to trade |
| `PERP_SIDE` | `long` | `long` or `short` |
| `PERP_NOTIONAL_USDSO` | `60` | Position **value**, not margin |
| `PERP_TAKE_PROFIT_PCT` | `1.5` | Take-profit distance from the entry mark |
| `PERP_STOP_LOSS_PCT` | `1` | Stop-loss distance from the entry mark |
| `PERP_TICK_MS` | `10000` | How often the mark is read |
| `PERP_MAX_CYCLES` | `3` | Cycles before the bot stops |
| `PERP_COOLDOWN_MS` | `15000` | Pause between cycles |
| `PERP_MAX_WAIT_PER_CYCLE_MS` | `900000` | Give up on a cycle after this |
| `DRY_RUN` | `true` | Log intended orders without sending them |

## Evidence

Each run appends JSON lines to `runs/<SYMBOL>-<date>.jsonl`:

```json
{"at":"2026-10-20T11:04:02.423Z","symbol":"ETH-PERP","dryRun":false,"event":"cycle-start","cycle":1}
{"at":"2026-10-20T11:04:04.957Z","symbol":"ETH-PERP","dryRun":false,"event":"open","cycle":1,"side":"long","price":"2388.14","quantity":"8300000000000000","sent":true,"filled":"8300000000000000"}
```

Order ids in the log can be checked against the Somnia Tokyo testnet explorer.
