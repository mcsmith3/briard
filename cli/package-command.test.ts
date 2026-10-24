import { describe, expect, test } from "bun:test";

import { PACKAGED_SENTENCE } from "./install-kind.ts";
import { packageCommand } from "./package-command.ts";

// ── Naming the command, once the kind is already decided ─────────────────────
// The prefix is NEVER evidence of the kind (M17 principle 3). It only chooses which words to print
// after `classifyInstall` has already said `packaged`, and an unrecognised prefix costs the operator
// a command, never a wrong kind.

describe("packageCommand", () => {
  test("each prefix we publish to names its own manager", () => {
    expect(packageCommand("/opt/briard")).toBe("sudo pacman -Syu briard-bin");
    expect(packageCommand("/opt/briard/bin")).toBe("sudo pacman -Syu briard-bin");
    // The root every `briard-bin` before the /opt move installed to, still answered.
    expect(packageCommand("/usr/lib/briard")).toBe("sudo pacman -Syu briard-bin");
    expect(packageCommand("/nix/store/abc123-briard-1.5.3")).toBe("nix profile upgrade briard");
    expect(packageCommand("/opt/homebrew/Cellar/briard/1.5.3")).toBe("brew upgrade briard");
    expect(packageCommand("/usr/local/Cellar/briard/1.5.3")).toBe("brew upgrade briard");
  });

  test("an unrecognised prefix answers null, and the sentence stands on its own", () => {
    expect(packageCommand("/opt/vendor/briard")).toBeNull();
    expect(packageCommand("/usr/lib/briard-something-else")).toBeNull();
    expect(packageCommand("/opt/briard-something-else")).toBeNull();
    expect(PACKAGED_SENTENCE).toBe("updates come from your package manager");
  });
});
