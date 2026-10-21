# net_version disagrees with eth_chainId on the Hideki testnet RPC

Severity: normal
Area: API

The public Hideki RPC endpoint answers `eth_chainId` with the chain id the
network actually uses (50383) but answers `net_version` with a different
number (50000259). Libraries that read `net_version` to pick a network — or to
sanity-check a configured chain id — will disagree with libraries that read
`eth_chainId`, on the same endpoint.

## Steps to reproduce

```bash
RPC=https://api.hideki2.infra.testnet.somnia.network/

curl -s -X POST $RPC -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'

curl -s -X POST $RPC -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"net_version","params":[]}'
```

## Expected

Both calls identify the same network. For a chain with id 50383 the conventional
answer to `net_version` is the decimal form of that id, `"50383"`.

## Actual

```json
{"jsonrpc":"2.0","id":1,"result":"0xc4cf"}
{"jsonrpc":"2.0","id":2,"result":"50000259"}
```

`0xc4cf` is 50383. `net_version` returns 50000259, which is not the chain id and
is not a value any client config in the docs mentions.

## Evidence

Both responses captured from a single session on 2026-10-20, endpoint above,
block height `0x1b1e714` (28436244) at the time of capture.

```
eth_chainId  -> 0xc4cf        (50383)
net_version  -> 50000259
eth_blockNumber -> 0x1b1e714  (28436244)
```

## Environment

- Network: Somnia Tokyo testnet (Hideki), chain id 50383
- RPC: https://api.hideki2.infra.testnet.somnia.network/
- SDK: @somnia-chain/markets-sdk via dreamdex-bot-kit `packages/perp-core`
- Wallet used for the session: 0x413FB4BF95004e978890eE03B151BE47bdB9464D
- Bot key (linked, cannot withdraw): 0xc3928694DF1e99eA81a537C1c6055267021144E9

## Why it matters

A bot that validates its configuration against `net_version` refuses to start on
a correctly configured Hideki endpoint, and a bot that logs `net_version` for
support reports the wrong network. Neither is fatal once you know, which is why
this is filed as normal rather than major: `eth_chainId` is the value to trust.

## Scope: it is this endpoint, not every Somnia endpoint

Re-run on 2026-10-21 against the other two public Somnia RPCs. Both answer
`net_version` with the decimal chain id, so the mismatch is specific to the
Hideki endpoint and not a proxy-wide convention:

```
api.hideki2.infra.testnet.somnia.network
  eth_chainId  -> 0xc4cf    (50383)
  net_version  -> 50000259            <- differs

api.infra.testnet.somnia.network            (Shannon)
  eth_chainId  -> 0xc488    (50312)
  net_version  -> 50312               <- matches

api.infra.mainnet.somnia.network            (Somnia mainnet)
  eth_chainId  -> 0x13a7    (5031)
  net_version  -> 5031                <- matches
```

Raw responses from the same 2026-10-21 run, in the order above:

```json
{"jsonrpc":"2.0","id":1,"result":"0xc4cf"}
{"jsonrpc":"2.0","id":2,"result":"50000259"}
{"jsonrpc":"2.0","id":1,"result":"0xc488"}
{"jsonrpc":"2.0","id":2,"result":"50312"}
{"jsonrpc":"2.0","id":1,"result":"0x13a7"}
{"jsonrpc":"2.0","id":2,"result":"5031"}
```

That also makes the fix easy to check: whatever the Hideki deployment does to
`net_version`, the other two already do the right thing.
