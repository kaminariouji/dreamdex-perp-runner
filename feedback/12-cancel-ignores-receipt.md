# `cancelOrder`, `cancelOrderFor` and the `operator.ts` write helper never check the receipt, so a reverted cancel or deposit returns as success

Severity: major
Area: SDK

## Steps to reproduce

1. Call `cancelOrder` (`packages/core/src/execute.ts`) with a client whose transaction receipt comes back `status: "reverted"` — the case of cancelling an order that was already filled, already cancelled, or is not yours:

```ts
import { cancelOrder } from './packages/core/src/execute.ts';
const ctx: any = {
  publicClient: {
    simulateContract: async () => ({ request: {} }),
    waitForTransactionReceipt: async () => ({ status: 'reverted', logs: [] }),
  },
  walletClient: { chain: { id: 50312 }, writeContract: async () => '0xdeadbeef' },
  account: { address: '0x0000000000000000000000000000000000000001' },
};
const hash = await cancelOrder(ctx, '0x0000000000000000000000000000000000000002', 42n);
console.log(hash);
```

2. Run with `npx tsx`.

## Expected

The same contract the placement path already enforces. `placeOrder` and `placeOrderFor` in the same file both do:

```ts
const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") {
  throw new GotchaError("TX_REVERTED", `placeOrder tx reverted: ${txHash}`);
}
```

A cancel that reverted must throw the same way: the caller asked for "this order is no longer resting", and a reverted cancel means it still is.

## Actual

```
$ npx tsx _cancel_test.mts
cancelOrder returned: 0xdeadbeef
threw on a reverted receipt? no — a reverted cancel is reported as success
```

Both cancel paths discard the receipt entirely:

```ts
export async function cancelOrder(ctx: ExecCtx, pool: `0x${string}`, orderId: bigint): Promise<`0x${string}`> {
  const sim = await ctx.publicClient.simulateContract({ ... });
  const hash = await ctx.walletClient.writeContract({ ... });
  await ctx.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
```

`cancelOrderFor` is identical. `simulateContract` does not save you here: a cancel can simulate cleanly and still revert at execution when the order was filled in the block before yours — the classic race for a bracketed order whose stop leg triggers first.

For a strategy that brackets entries (`placeOrder` → later `cancelOrder`), this is the failure that matters: the bot logs a successful cancel, stops tracking the order, and leaves a live resting order with no owner. The position it thinks it closed is still open, and the next quote is placed on top of it.

## Evidence

Captured 2026-10-27T17:5xZ against SDK `@dreamdex-bot-kit/core` 0.1.0, Node 24, `tsx`, stub clients (no RPC, no wallet).

```
$ grep -n "receipt.status" packages/core/src/execute.ts
139:  if (receipt.status !== "success") {
188:  if (receipt.status !== "success") throw new GotchaError("TX_REVERTED", ...)
# cancelOrder starts at line 202 and cancelOrderFor at 195: neither mentions receipt.status
```

## Same pattern in `operator.ts`: the owner-side setup calls

`packages/core/src/operator.ts` wraps every write in the same receipt-less helper, so `setManualVaultMode`, `depositVault`, `withdrawVault` and `grantOperator` all report success on a reverted transaction:

```ts
async function send(ctx: ChainContext, hash: `0x${string}`): Promise<`0x${string}`> {
  await ctx.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
```

For `depositVault` this compounds: it approves only when `allowance < amountRaw`, then deposits unconditionally. A reverted `approve` (a token that returns `false` instead of reverting, or a wallet that rejects the spend) is reported as success, the `deposit` that follows reverts too, and both hashes come back clean. The owner believes the vault is funded; the operator then has nothing to trade against, and `placeOrderFor` fails with `SIM_FALSE` on the first order.

The fix is the same one line in `send()`: throw on `receipt.status !== "success"`.

## Suggested fix

```ts
const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") {
  throw new GotchaError("TX_REVERTED", `cancelOrder tx reverted: ${hash}`);
}
return hash;
```

and the same in `cancelOrderFor`. Consider also returning the `OrderCancelled` log check, mirroring the `SILENT_REJECTION` check the placement path does on `OrderPlaced`.

## Environment

SDK `@dreamdex-bot-kit/core` 0.1.0, Node 24, `tsx`; no network and no wallet needed to reproduce.

