import { describe, expect, test } from "bun:test";

import { parseMarker } from "../crew/staleness.ts";
import { DURABLE_LEAD_MINIMUM, leadIsOld, OldLeadNotice } from "./old-lead.ts";

// M50 spec 14: a durable peer names a lead below 0.1.0 once, from the release header the lead's sweep
// sends, and keeps the release for the runtime marker that `briard doctor` reads.
describe("a durable peer and an old lead", () => {
  test("old means below 0.1.0; no header is never old", () => {
    expect(DURABLE_LEAD_MINIMUM).toBe("0.1.0");
    expect([leadIsOld("0.0.1"), leadIsOld("0.1.0"), leadIsOld("0.1.1"), leadIsOld(null)]).toEqual([true, false, false, false]);
  });

  test("one log line per old release, however many sweeps carry it, and none for a new one or no header", () => {
    const lines: string[] = [];
    const notice = new OldLeadNotice((line) => lines.push(line));
    expect(notice.leadRelease()).toBeNull();
    for (let sweep = 0; sweep < 5; sweep++) notice.observe("0.0.1");
    notice.observe(null);
    expect(lines).toEqual(["[durable] the lead is 0.0.1; it shows durable panes without the question card and its Terminal tab polls; update the lead"]);
    expect(notice.leadRelease()).toBe("0.0.1");
    notice.observe("0.0.2");
    notice.observe("0.1.0");
    notice.observe("0.1.0");
    expect(lines).toHaveLength(2);
    expect(notice.leadRelease()).toBe("0.1.0");
  });

  test("the runtime marker carries the release when it has one, and an older marker reads as before", () => {
    const base = { bootedAt: 1, pid: 2, mode: "peer", roster: [] };
    expect(parseMarker(JSON.stringify({ ...base, leadRelease: "0.0.1" }))?.leadRelease).toBe("0.0.1");
    const old = parseMarker(JSON.stringify(base));
    expect(old).not.toBeNull();
    expect(old !== null && "leadRelease" in old).toBe(false);
  });
});
