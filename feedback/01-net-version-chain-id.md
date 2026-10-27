# `net_version` and `eth_chainId` disagree on the same node

Severity: major
Area: API

## Steps to reproduce

1. Send `eth_chainId` to the Somnia Tokyo testnet RPC used by dreamDEX:

```bash
curl -s -X POST https://api.hideki2.infra.testnet.somnia.network \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

2. Send `net_version` to the same endpoint in the same second:

```bash
curl -s -X POST https://api.hideki2.infra.testnet.somnia.network \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"net_version","params":[]}'
```

## Expected

Both methods report the same chain. `eth_chainId` returns `0xc4cf` = 50383, so `net_version` should return `"50383"`.

## Actual

`net_version` returns `"50000259"` while `eth_chainId` returns `0xc4cf` (50383). A client that reads `net_version` (ethers v5 `getNetwork()`, web3 `net.version`, several wallet connectors) derives 50000259, which is not the chain the node serves.

## Evidence

Captured 2026-10-25T04:05Z against the live endpoint, both HTTP 200:

```
eth_chainId      -> {"jsonrpc":"2.0","id":1,"result":"0xc4cf"}
net_version      -> {"jsonrpc":"2.0","id":2,"result":"50000259"}
```

The node was healthy at the same moment, so this is not a lagging replica:

```
eth_blockNumber  -> 0x1ebeaa9   (32,238,249)
6 seconds later  -> 0x1ebeb21   (32,238,313)   +64 blocks in 6 s
latest block age -> 0.8 s
```

This was first reported in the dreamDEX Discord `#feedback` channel on 2026-10-19, where the team replied: "Use eth_chainId for now. I've passed it to the team."

## Environment

- Network: Somnia Tokyo testnet (Hideki), chain id 50383
- Endpoint: `https://api.hideki2.infra.testnet.somnia.network`
- SDK version: none needed, raw JSON-RPC over HTTP
- Wallet address used for the session: `0x25B30DA47da5044aF447d57B646101D64696bdE3`
- Verified on: 2026-10-25T04:05Z

## Impact

Any integration that reads `net_version` instead of `eth_chainId` fails to connect, or builds transactions with a chain id the node does not accept. The documented workaround ("use eth_chainId for now") moves the defect onto every integrator rather than fixing it.

## Suggested fix

Serve `net_version` from the same chain-id constant that backs `eth_chainId` (50383), instead of passing through the upstream Somnia `net_version`.
