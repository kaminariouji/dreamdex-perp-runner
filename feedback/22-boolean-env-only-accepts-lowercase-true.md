# Boolean env vars accept only the lowercase literal `true`, so `TRUE` or `1` silently enable live trading

Severity: major
Area: grid-bot (examples/03-monorepo-grid)

## Steps to reproduce

1. Set `DREAMDEX_DRY_RUN=TRUE` (or `1`, `True`, `yes`, `on`) in `.env`.
2. Start the bot.
3. `config.ts:86` parses it with strict string equality:

```ts
dryRun: optional('DREAMDEX_DRY_RUN', 'true') === 'true',
```

4. `config.dryRun` is `false`. `index.ts:401-404` therefore does not short-circuit, and the bot signs and sends real orders.
5. The same pattern is used for the vault bootstrap at `config.ts:127`:

```ts
autoVault: optional('DREAMDEX_AUTO_VAULT', 'false') === 'true',
```

so `DREAMDEX_AUTO_VAULT=1` silently disables the vault deposit, and `DREAMDEX_AUTO_VAULT=TRUE` silently enables it.

## Expected

`1`, `true`, `TRUE`, `yes`, `on` should all be accepted as true, and an unrecognised value should abort startup with a message naming the variable. This is a flag that decides whether the process spends money; guessing is not acceptable.

## Actual

Anything other than the exact string `true` is treated as false. There is no validation, no warning, and no list of accepted values. The only signal is the startup line `Dry run=false` at `index.ts:212`, printed among a dozen other configuration lines, which does not indicate that the value was misread rather than intentionally set.

Note the asymmetry: the default is `'true'` (safe), so a user who omits the variable is protected. The failure only fires when a user deliberately tries to set the flag — which is exactly when they believe they have control over it.

## Impact

A user who writes `DREAMDEX_DRY_RUN=1` — the most common way to express "on" in shell and Docker environments — gets a bot that trades live with the private key from `DREAMDEX_PRIVATE_KEY`. On a market with a crossed threshold and no cooldown protection (see the `cooldownMs` item), the first order can be submitted within one order book tick of startup. The inverse also applies: `DREAMDEX_AUTO_VAULT=1` leaves the wallet unfunded for `normalOrder`/`postOnly`, and the bot then logs the "resting orders require vault" warning on every signal instead of depositing.

## Fix

Parse once through a shared helper that rejects unknown values:

```ts
const bool = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`${name} must be one of 1/0, true/false, yes/no, on/off (got "${raw}")`);
};
```

and use it for `DREAMDEX_DRY_RUN`, `DREAMDEX_AUTO_VAULT`, and any other boolean added later.
