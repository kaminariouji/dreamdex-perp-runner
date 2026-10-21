/**
 * @license
 * Copyright DreamDEX S.A.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/LICENSE
 */

// DRY_RUN is parsed twice: once by Config.dryRun (which decides whether an order
// is really sent) and once by the perp-runner constant (which decides whether the
// TP/SL watch loop runs, whether emergencyExit is armed, and what the evidence
// file claims). They used to disagree on "0" — the config read it as live while
// the runner read it as dry — so the runner sent real orders, wrote dryRun:true,
// never watched the position and never armed the exit. These cases pin the two
// parsers together.

import { afterEach, describe, expect, it } from "vitest";
import { dryRunMode, loadConfig } from "../src/config.js";

// The perp-runner imports this same function, so this covers both call sites.
const runnerDryRun = dryRunMode;

const original = process.env.DRY_RUN;
afterEach(() => {
  if (original === undefined) delete process.env.DRY_RUN;
  else process.env.DRY_RUN = original;
});

describe("DRY_RUN", () => {
  const cases: Array<[string | undefined, boolean]> = [
    [undefined, true],
    ["", true],
    ["true", true],
    ["1", true],
    ["false", false],
    ["0", false],
  ];

  for (const [raw, expected] of cases) {
    it(`reads ${JSON.stringify(raw)} as ${expected ? "dry" : "live"} in both parsers`, () => {
      if (raw === undefined) delete process.env.DRY_RUN;
      else process.env.DRY_RUN = raw;
      expect(runnerDryRun()).toBe(expected);
      expect(loadConfig().dryRun).toBe(expected);
    });
  }

  it("never lets the runner and the config disagree", () => {
    for (const raw of [undefined, "", "true", "1", "false", "0", "FALSE", "no", " 0 "]) {
      if (raw === undefined) delete process.env.DRY_RUN;
      else process.env.DRY_RUN = raw;
      expect(runnerDryRun()).toBe(loadConfig().dryRun);
    }
  });
});
