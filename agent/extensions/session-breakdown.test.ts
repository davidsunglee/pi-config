import test from "node:test";
import assert from "node:assert/strict";

import { visibleWidth } from "@mariozechner/pi-tui";
import * as sessionBreakdown from "./session-breakdown.ts";

test("session-breakdown exposes a local sliceByColumn helper with expected behavior", () => {
  assert.equal(typeof sessionBreakdown.sliceByColumnLocal, "function");

  const sliceByColumnLocal = sessionBreakdown.sliceByColumnLocal as (
    line: string,
    startCol: number,
    length: number,
    strict?: boolean,
  ) => string;

  assert.equal(sliceByColumnLocal("abcdef", 2, 3), "cde");
  assert.equal(sliceByColumnLocal("a😀b", 1, 1, true), "");
  assert.equal(sliceByColumnLocal("a😀b", 1, 2, true), "😀");

  const styled = "\x1b[31mhello\x1b[0m world";
  const slice = sliceByColumnLocal(styled, 1, 3, true);
  assert.equal(visibleWidth(slice), 3);
  assert.match(slice, /\x1b\[31m/);
  assert.match(slice, /ell/);
});
