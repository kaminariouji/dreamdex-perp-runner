# "Link your Discord" stays at 0/1 while the wallet already shows the account linked

Severity: major
Area: UI / quests

The onboarding quest says *"Link your Discord account in your dreamDEX wallet settings."*
The wallet settings already show a linked account — the handle is on screen and the control
offers to unlink it — and the quest counter still reads **0 of 1 account**. Following the
instruction exactly does not move the counter.

This matters beyond the 50 points: the weekly raffle requires *"Complete the onboarding
quests"*, and the eligibility panel reports that requirement as **"TRACK YOUR PROGRESS
MANUALLY"**. With this counter stuck at 0/1 and the waitlist quest waiting on the team,
the onboarding set cannot be completed from the user's side, so the raffle condition is
unreachable.

## Steps to reproduce

1. Sign in on `app.testnet.dreamdex.io` (this account: `@kaminariouji`, login wallet
   `0x25B3…bdE3`).
2. Open `/competition-hub?tab=quests&campaign=perps-arena&quests=campaign`.
3. Read the second onboarding quest: **"Link your Discord account — 0 of 1 account"**, with a
   **Link Discord** button.
4. Open `/portfolio` in the same session and look at the wallet menu: the Discord handle
   **`kaminari0755#0`** is rendered, and the page contains controls with
   `aria-label="Unlink your Discord account"` and `aria-label="Unlink your X account"`.

## Expected

Either the counter reads **1 of 1**, or the quest states the rule it is actually applying —
for example *"link after the campaign starts"* — so that a user who is already linked knows
why the counter does not move. Right now the two surfaces contradict each other with no
explanation.

## Actual

Same page load, same session, 2026-10-20 16:0x UTC:

```
/competition-hub?tab=quests&campaign=perps-arena&quests=campaign
  Onboarding quests            5/7
  Link your Discord account    0 of 1 account
  [Link Discord]

/portfolio
  kaminari0755#0
  aria-label="Unlink your Discord account"
  aria-label="Unlink your X account"
```

The quest's own instruction — *"in your dreamDEX wallet settings"* — points at the exact
place that already shows the account linked.

## Evidence

- Screenshot of the quest row: [05-quest-counter.png](05-quest-counter.png) (2026-10-20,
  onboarding 5/7, "0 of 1 account").
- Eligibility panel, same session: Weekly raffle qualification → **"TRACK YOUR PROGRESS
  MANUALLY"**, *"Complete onboarding quests and close 5+ trades across 2+ days each week."*
- Weekly leaderboard qualification: **INCOMPLETE**, *"This week: 10 of 10 closes, 2 of 3
  days."* — so the trading half of the raffle requirement is already met; the quest half is
  the blocker.
- Registration: COMPLETE. Hold 10 SOMI: COMPLETE (*"your sign-up wallet (0x25B3…bdE3) has
  11.89 SOMI"*).

## Open question for the team

If the intended rule is "the link must be made during the campaign", the counter is correct
and only the copy is wrong — then say so on the quest row. If the link is meant to count
regardless of when it was made, the counter is missing an account that the wallet already
knows about. Both are one-line answers; the current state leaves the user unable to tell
which, and unable to earn the raffle ticket either way.

## Environment

- App: `app.testnet.dreamdex.io`, 2026-10-20 16:0x UTC, signed in as `@kaminariouji`
- Browser: Chrome (real profile), page read via DOM, no automation of any state change
