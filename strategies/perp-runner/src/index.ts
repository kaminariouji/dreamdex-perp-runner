/**
 * perp-runner - repeated bracketed perp cycles on dreamDEX.
 *
 * perp-starter opens ONE position and stops. This runner repeats the cycle:
 * open a market order, watch the live mark, close on take-profit or stop-loss,
 * cool down, and go again. Every cycle writes a JSON line to runs/, so the
 * orders can be checked against the explorer afterwards.
 *
 * It is built for a linked trading key (OWNER_ADDRESS set): a trading key
 * cannot arm stops on the stop registry, so the bot watches the mark itself and
 * closes when a level is reached. The exits act only while the bot runs.
 *
 * Safety defaults: DRY_RUN is on unless you set DRY_RUN=false, the position is
 * sized from PERP_NOTIONAL_USDSO, and a cycle is abandoned after
 * PERP_MAX_WAIT_PER_CYCLE_MS so a stale mark cannot hold a position open.
 *
 *   npm start -w perp-runner
 */

import { appendFileSync, mkdirSync } from "node:fs";

import {
  ORDER_TYPE,
  closePosition,
  createExchange,
  ensureLeverage,
  envNum,
  liveFunding,
  liveMark,
  loadEnv,
  markOf,
  onStop,
  placePerp,
  positionIn,
  preflight,
  requireMarket,
  shutdown,
  sizeForNotional,
  sizeOrder,
  sleep,
  tradingKeyCheck,
  type Side,
} from "@dreamdex-bot-kit/perp-core";

// Read .env before the constants below, because ES module bindings are
// evaluated at import time.
loadEnv();

const SYMBOL = (process.env.PERP_SYMBOL ?? "ETH-PERP").trim();
const SIDE = ((process.env.PERP_SIDE ?? "long").trim().toLowerCase() === "short" ? "short" : "long") as Side;
const LEVERAGE = envNum("PERP_LEVERAGE", 2);
const NOTIONAL = envNum("PERP_NOTIONAL_USDSO", 60);
const TAKE_PROFIT_PCT = envNum("PERP_TAKE_PROFIT_PCT", 1.5);
const STOP_LOSS_PCT = envNum("PERP_STOP_LOSS_PCT", 1);
const TICK_MS = envNum("PERP_TICK_MS", 10000);
const MAX_CYCLES = envNum("PERP_MAX_CYCLES", 3);
const COOLDOWN_MS = envNum("PERP_COOLDOWN_MS", 15000);
const MAX_WAIT_MS = envNum("PERP_MAX_WAIT_PER_CYCLE_MS", 900000);
// 0 disables the gate. Above 0, a cycle only opens when the venue pays OUR side at
// least this APR: a bracket on a coin nobody is paying to hold is a coin flip, and
// the funding is the only part of the trade the venue states in advance.
const MIN_FUNDING_APR = envNum("PERP_MIN_FUNDING_APR", 0);
const DRY_RUN = process.env.DRY_RUN !== "false";

const RUN_DIR = process.cwd() + "/runs";
// The pid keeps one process per file: two runners on the same day used to append
// to one log and then close each other's positions.
const EVIDENCE =
  RUN_DIR +
  "/" +
  SYMBOL +
  "-" +
  new Date().toISOString().slice(0, 10) +
  (DRY_RUN ? "-dryrun" : "") +
  "-" +
  process.pid +
  ".jsonl";

/** Set once a live cycle can hold a position. Called when the run ends badly. */
let emergencyExit: (() => Promise<void>) | undefined;

function record(event: Record<string, unknown>): void {
  const line = JSON.stringify({ at: new Date().toISOString(), symbol: SYMBOL, dryRun: DRY_RUN, ...event });
  console.log("[evidence] " + line);
  try {
    mkdirSync(RUN_DIR, { recursive: true });
    appendFileSync(EVIDENCE, line + "\n");
  } catch (err) {
    // A missing runs/ directory must never stop a live position from closing,
    // but a line that never lands must not be silent either: the log is the
    // only evidence an order was sent.
    console.error("[evidence] NOT WRITTEN: " + (err instanceof Error ? err.message : String(err)));
  }
}

const px = (v: bigint) => (Number(v) / 1e18).toFixed(2);

async function main(): Promise<void> {
  const ctx = createExchange({ withSigner: !DRY_RUN });
  const stopped = onStop();
  const market = await requireMarket(ctx.exchange, ctx.config.symbol || SYMBOL);
  const me = ctx.exchange.walletAddress as `0x${string}` | undefined;

  // From here a cycle can be holding a position, so the run needs a way out that
  // does not depend on the watch loop finishing. The exits live in this process
  // (a trading key cannot arm stops), so a crash would otherwise leave the
  // position open with nothing protecting it.
  emergencyExit = async () => {
    if (DRY_RUN || !me) return;
    try {
      const still = await positionIn(ctx.exchange, market);
      if (!still) return;
      console.error("ending with a position open — flattening before exit");
      const closed = await closePosition(ctx, market, me, { label: "exit" });
      record({
        event: "close",
        reason: "exit",
        sent: closed?.sent ?? false,
        orderId: closed?.orderId ? String(closed.orderId) : null,
        txHash: closed?.txHash ?? null,
      });
      if (!closed?.sent) console.error("WARNING: the position is STILL OPEN and no stop is armed");
    } catch (err) {
      console.error(
        "WARNING: flatten on exit failed, the position is STILL OPEN: " +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  // The settings that produced the evidence belong in the evidence: without them
  // a log cannot tell you what the run was actually trying to do.
  record({
    event: "run-start",
    pid: process.pid,
    side: SIDE,
    leverage: LEVERAGE,
    notional: NOTIONAL,
    takeProfitPct: TAKE_PROFIT_PCT,
    stopLossPct: STOP_LOSS_PCT,
    tickMs: TICK_MS,
    maxWaitMs: MAX_WAIT_MS,
    minFundingApr: MIN_FUNDING_APR,
    maxCycles: MAX_CYCLES,
    account: me ?? null,
    owner: ctx.config.owner ?? null,
  });

  console.log(
    "perp-runner on " + market.display + " | " + SIDE + " " + NOTIONAL + " USDso at " + LEVERAGE + "x | " +
      "take-profit " + TAKE_PROFIT_PCT + "% stop-loss " + STOP_LOSS_PCT + "% | " +
      "up to " + MAX_CYCLES + " cycle(s) | dry-run " + DRY_RUN,
  );

  if (!me) {
    console.log("read-only: no PRIVATE_KEY, so nothing will be sent. Set one to trade.");
  } else {
    const link = await tradingKeyCheck(ctx, market);
    if (link.message) console.log(link.message);
    if (!link.ok && !DRY_RUN) process.exit(1);

    const check = await preflight(ctx.exchange, market, me, {
      requiredUsdso: NOTIONAL / Math.max(1, LEVERAGE),
      linkedAccount: Boolean(ctx.config.owner),
    });
    console.log(check.message);
    if (!check.ok) process.exit(1);

    const lev = await ensureLeverage(ctx, market, me, LEVERAGE);
    if (!lev.dryRun) {
      console.log(
        lev.changed
          ? "leverage set to " + lev.to + "x on " + market.display + " (was " + (lev.from || "unset") + ")"
          : lev.ownerOnly
            ? "leverage on " + market.display + " is " + (lev.from ? lev.from + "x" : "unset") + "; a trading key cannot change it. Sizing follows the account setting."
            : "leverage already " + lev.to + "x on " + market.display + ", left alone",
      );
    }
  }

  const summary = { cycles: 0, takeProfit: 0, stopLoss: 0, timeouts: 0, closed: 0, netPnl: 0 };

  for (let cycle = 1; cycle <= MAX_CYCLES && !stopped(); cycle++) {
    record({ event: "cycle-start", cycle });

    // Reuse a position that is already open instead of stacking a second one.
    const existing = me ? await positionIn(ctx.exchange, market) : undefined;
    if (!existing) {
      const funding = await liveFunding(ctx.exchange, market);
      if (MIN_FUNDING_APR > 0) {
        const paysUs = funding.known && funding.paidSide === SIDE;
        const apr = Math.abs(funding.apr ?? 0);
        if (!paysUs || apr * 100 < MIN_FUNDING_APR) {
          const why = !funding.known
            ? "funding cannot be read"
            : "funding pays " + funding.paidSide + " at " + (apr * 100).toFixed(2) + "% APR";
          console.log("standing down: " + why + ", below the " + MIN_FUNDING_APR + "% gate for a " + SIDE);
          record({ event: "skip", cycle, reason: "funding", apr: funding.apr, paid: funding.paidSide });
          if (cycle < MAX_CYCLES && !stopped()) await sleep(COOLDOWN_MS, stopped);
          continue;
        }
        console.log("funding pays " + SIDE + " at " + (apr * 100).toFixed(2) + "% APR, above the " + MIN_FUNDING_APR + "% gate");
        record({ event: "funding", cycle, apr: funding.apr, paid: funding.paidSide });
      }
      const book = await ctx.exchange.fetchOrderBook(market.symbol, 1);
      const touch = SIDE === "long" ? book.asks[0]?.[0] : book.bids[0]?.[0];
      if (touch === undefined) {
        console.log("no counterparty resting on the book, nothing to cross");
        break;
      }
      const price = BigInt(Math.round(touch * 1e18));
      const wanted = sizeForNotional(NOTIONAL, market.info, await liveMark(ctx.exchange, market));
      const sized = me
        ? await sizeOrder(ctx.exchange, { market, account: me, side: SIDE, price, wanted, autoPull: true, tradingKey: ctx.tradingKey })
        : { ok: true as const, quantity: wanted, limitedBy: undefined };

      if (!sized.ok) {
        console.log("cannot open: " + sized.reason);
        break;
      }
      if (sized.limitedBy) console.log("size ceiling is set by " + sized.limitedBy + " (this is not an error on its own)");

      const opened = await placePerp({ ctx, market, side: SIDE, price, quantity: sized.quantity, orderType: ORDER_TYPE.MARKET, label: "open" });
      record({
        event: "open",
        cycle,
        side: SIDE,
        price: px(price),
        quantity: String(sized.quantity),
        sent: opened.sent,
        filled: String(opened.filled ?? BigInt(0)),
        orderId: opened.orderId ? String(opened.orderId) : null,
        txHash: opened.txHash ?? null,
      });
      if (opened.sent && opened.filled === BigInt(0)) {
        console.log("nothing crossed, the price moved. Exiting rather than resting an unintended maker order.");
        break;
      }
    } else {
      console.log("already " + existing.side + " " + existing.contracts + " " + market.info.baseSymbol + ", managing it");
    }

    if (DRY_RUN || !me) {
      const mark = (await liveMark(ctx.exchange, market)) ?? markOf(market.info);
      const up = BigInt(Math.round(mark * (1 + TAKE_PROFIT_PCT / 100) * 1e18));
      const down = BigInt(Math.round(mark * (1 - STOP_LOSS_PCT / 100) * 1e18));
      console.log("[dry-run] would watch take-profit " + px(SIDE === "long" ? up : down) + " and stop-loss " + px(SIDE === "long" ? down : up));
      break;
    }

    // Levels are set against the mark the POOL acts on, not the market row.
    const seed = (await liveMark(ctx.exchange, market)) ?? markOf(market.info);
    const up = BigInt(Math.round(seed * (1 + TAKE_PROFIT_PCT / 100) * 1e18));
    const down = BigInt(Math.round(seed * (1 - STOP_LOSS_PCT / 100) * 1e18));
    const takeProfit = SIDE === "long" ? up : down;
    const stopLoss = SIDE === "long" ? down : up;
    console.log("watching take-profit " + px(takeProfit) + " and stop-loss " + px(stopLoss));

    let waited = 0;
    let ticks = 0;
    let outcome = "timeout";
    let lastPnl = 0;

    while (!stopped() && waited < MAX_WAIT_MS) {
      await sleep(TICK_MS, stopped);
      waited += TICK_MS;

      const fresh = await requireMarket(ctx.exchange, market.symbol, { reload: true });
      const position = await positionIn(ctx.exchange, fresh);
      if (!position) {
        console.log("position is closed");
        outcome = "closed";
        break;
      }
      const live = await liveMark(ctx.exchange, fresh);
      if (live === undefined) continue;

      lastPnl = Number(position.unrealizedPnl ?? 0);
      const liveRaw = BigInt(Math.round(live * 1e18));
      const hitTakeProfit = SIDE === "long" ? liveRaw >= takeProfit : liveRaw <= takeProfit;
      const hitStopLoss = SIDE === "long" ? liveRaw <= stopLoss : liveRaw >= stopLoss;
      console.log(
        position.side + " " + position.contracts + " " + fresh.info.baseSymbol + " | uPnL " +
          (position.unrealizedPnl?.toFixed(4) ?? "?") + " | mark " + live.toFixed(2),
      );
      // A carry position is judged over hours, so the log needs a time series:
      // the mark, the unrealised PnL and what the venue is paying while we hold.
      if (++ticks % 10 === 0) {
        const f = await liveFunding(ctx.exchange, fresh);
        record({
          event: "hold",
          cycle,
          mark: live.toFixed(2),
          upnl: lastPnl,
          fundingApr: f.known ? f.apr : null,
          paid: f.paidSide ?? null,
        });
      }

      if (hitTakeProfit || hitStopLoss) {
        const reason = hitTakeProfit ? "take-profit" : "stop-loss";
        const closed = await closePosition(ctx, fresh, me, { label: reason });
        const sent = closed?.sent === true;
        record({
          event: "close",
          cycle,
          reason,
          sent,
          mark: live.toFixed(2),
          upnl: lastPnl,
          orderId: closed?.orderId ? String(closed.orderId) : null,
          txHash: closed?.txHash ?? null,
        });
        // closePosition comes back quietly when the market is un-priceable or the
        // book is empty. Counting that as a win would put a closed trade in the
        // summary for a position that never closed, so keep watching instead.
        if (sent) {
          outcome = reason;
          break;
        }
        console.log(reason + " reached but the close did not go through — still holding, retrying next tick");
      }
    }

    // A cycle that runs out of time must not leave the position behind: the next
    // cycle would only adopt it, and the run summary would describe a position
    // the bot never opened. Flatten on timeout and record it.
    if (outcome === "timeout") {
      const stale = await requireMarket(ctx.exchange, market.symbol, { reload: true });
      const stillOpen = await positionIn(ctx.exchange, stale);
      if (stillOpen) {
        const closed = await closePosition(ctx, stale, me, { label: "timeout" });
        record({
          event: "close",
          cycle,
          reason: "timeout",
          sent: closed?.sent === true,
          upnl: lastPnl,
          orderId: closed?.orderId ? String(closed.orderId) : null,
          txHash: closed?.txHash ?? null,
        });
        if (closed?.sent !== true) console.log("the timeout flatten did not go through — the position is still open");
      }
    }

    summary.cycles++;
    if (outcome === "take-profit") summary.takeProfit++;
    else if (outcome === "stop-loss") summary.stopLoss++;
    // "closed" is the position going away on its own, which used to be counted as
    // a timeout and made the run look slower than it was.
    else if (outcome === "closed") summary.closed++;
    else summary.timeouts++;
    summary.netPnl += lastPnl;
    record({ event: "cycle-end", cycle, outcome, upnl: lastPnl });

    if (cycle < MAX_CYCLES && !stopped()) {
      console.log("cooling down " + Math.round(COOLDOWN_MS / 1000) + "s before the next cycle");
      await sleep(COOLDOWN_MS, stopped);
    }
  }

  console.log(
    "summary: " + summary.cycles + " cycle(s) | take-profit " + summary.takeProfit + " | stop-loss " + summary.stopLoss +
      " | timeout " + summary.timeouts + " | net uPnL " + summary.netPnl.toFixed(4) + " USDso",
  );
  record({ event: "summary", ...summary, evidence: EVIDENCE });
  await shutdown(ctx);
}

main().then(
  () => process.exit(0),
  async (err) => {
    console.error(err instanceof Error ? err.message : err);
    // The exits only act while this process runs, so an unhandled error used to
    // leave an open position with nothing watching it. Flatten first, then stop.
    await emergencyExit?.();
    process.exit(1);
  },
);
