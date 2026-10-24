import { describe, expect, test } from "bun:test";
import { createPublicKey } from "node:crypto";

import {
  DEFAULT_SUBJECT,
  dropEnvAssignments,
  generateVapidKeys,
  mergeEnv,
  readEnvVar,
  validateSubject,
} from "./push-keys.ts";

// Two things can go wrong here and neither shows up until much later: a keypair that isn't actually
// a valid P-256 point (the push service answers 400, hours after setup), and an .env rewrite that
// loses or duplicates a line (the operator's other settings quietly stop applying). So the keys are
// checked by feeding them back into node:crypto as a real key, and the merge is checked against the
// file shapes an operator actually has — empty, copied-from-.env.example, and already-configured.

describe("generateVapidKeys", () => {
  test("produces an uncompressed P-256 point node:crypto will re-import", () => {
    const { publicKey, privateKey } = generateVapidKeys();
    const raw = Buffer.from(publicKey, "base64url");
    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(0x04);
    expect(Buffer.from(privateKey, "base64url").length).toBe(32);

    // The real assertion: rebuild a JWK from our own encoding and let node:crypto validate that the
    // point is on the curve. A mis-sliced X/Y would still be 65 bytes and would still fail here.
    const key = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: raw.subarray(1, 33).toString("base64url"),
        y: raw.subarray(33).toString("base64url"),
      },
      format: "jwk",
    });
    expect(key.asymmetricKeyType).toBe("ec");
  });

  test("is a fresh keypair each call", () => {
    expect(generateVapidKeys().privateKey).not.toBe(generateVapidKeys().privateKey);
  });
});

describe("readEnvVar", () => {
  test("reads a live assignment and ignores a commented placeholder", () => {
    expect(readEnvVar("# BRIARD_VAPID_PUBLIC=\nBRIARD_VAPID_PUBLIC=abc\n", "BRIARD_VAPID_PUBLIC")).toBe("abc");
    expect(readEnvVar("# BRIARD_VAPID_PUBLIC=old\n", "BRIARD_VAPID_PUBLIC")).toBeUndefined();
  });

  test("an empty assignment is not a value", () => {
    expect(readEnvVar("BRIARD_VAPID_PUBLIC=\n", "BRIARD_VAPID_PUBLIC")).toBeUndefined();
  });

  test("the last assignment wins, as bash would have it", () => {
    expect(readEnvVar("BRIARD_VAPID_PUBLIC=one\nBRIARD_VAPID_PUBLIC=two\n", "BRIARD_VAPID_PUBLIC")).toBe("two");
  });
});

// F12: `briard leave` uses this to retire the wide BRIARD_HOST `crew add` wrote, so a machine
// returning to solo does not crash-loop on a bind solo mode refuses.
describe("dropEnvAssignments", () => {
  test("strikes every live assignment, and says when there was none", () => {
    expect(dropEnvAssignments("BRIARD_HOST=1.2.3.4\nBRIARD_PORT=8787\n", "BRIARD_HOST")).toBe(
      "BRIARD_PORT=8787\n",
    );
    expect(dropEnvAssignments("export BRIARD_HOST=1.2.3.4\nA=b\n", "BRIARD_HOST")).toBe("A=b\n");
    // A later assignment wins at source time, so BOTH have to go or the old value comes back.
    expect(dropEnvAssignments("BRIARD_HOST=a\nB=c\nBRIARD_HOST=d\n", "BRIARD_HOST")).toBe("B=c\n");
    expect(dropEnvAssignments("BRIARD_PORT=8787\n", "BRIARD_HOST")).toBeNull();
  });

  test("a commented placeholder is the operator's note, not a value — it stays", () => {
    expect(dropEnvAssignments("# BRIARD_HOST=\nA=b\n", "BRIARD_HOST")).toBeNull();
  });

  test("a file that was only that one assignment comes back empty, not with a stray newline", () => {
    expect(dropEnvAssignments("BRIARD_HOST=1.2.3.4\n", "BRIARD_HOST")).toBe("");
  });
});

describe("mergeEnv", () => {
  test("appends to a file that has no VAPID lines, keeping what was there", () => {
    const out = mergeEnv("BRIARD_PORT=8787\n", { BRIARD_VAPID_PUBLIC: "pub" });
    expect(out).toContain("BRIARD_PORT=8787");
    expect(out).toContain("BRIARD_VAPID_PUBLIC=pub");
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  test("takes over a commented placeholder in place rather than appending below it", () => {
    const out = mergeEnv("# --- Web Push ---\n# BRIARD_VAPID_PUBLIC=\n# BRIARD_VAPID_PRIVATE=\n", {
      BRIARD_VAPID_PUBLIC: "pub",
    });
    expect(out.split("\n")[1]).toBe("BRIARD_VAPID_PUBLIC=pub");
    expect(out).toContain("# BRIARD_VAPID_PRIVATE=");
  });

  test("leaves no second copy of a key it replaced", () => {
    const out = mergeEnv("BRIARD_VAPID_PRIVATE=old\nBRIARD_PORT=1\n# BRIARD_VAPID_PRIVATE=older\n", {
      BRIARD_VAPID_PRIVATE: "new",
    });
    expect(out.match(/BRIARD_VAPID_PRIVATE/g)?.length).toBe(1);
    expect(out).toContain("BRIARD_VAPID_PRIVATE=new");
    expect(out).toContain("BRIARD_PORT=1");
  });

  test("replaces an `export`-prefixed assignment instead of appending beside it", () => {
    const out = mergeEnv("export BRIARD_VAPID_PRIVATE=old\n", { BRIARD_VAPID_PRIVATE: "new" });
    expect(out.match(/BRIARD_VAPID_PRIVATE/g)?.length).toBe(1);
    expect(out).not.toContain("old");
  });

  test("creates a file from nothing", () => {
    const out = mergeEnv("", { BRIARD_VAPID_SUBJECT: DEFAULT_SUBJECT });
    expect(out).toContain(`BRIARD_VAPID_SUBJECT=${DEFAULT_SUBJECT}`);
  });
});

describe("validateSubject", () => {
  test("accepts the two forms RFC 8292 names", () => {
    expect(validateSubject("mailto:me@example.com")).toBe("mailto:me@example.com");
    expect(validateSubject("https://example.com/briard")).toBe("https://example.com/briard");
  });

  // The allowlist exists because this value has two consumers that read punctuation differently:
  // The subject allowlist is defence in depth: briard-ctl.sh now parses .env rather than sourcing it,
  // matching systemd's EnvironmentFile=. Metacharacters still must not land in the file.
  // Every case below is one the old blocklist let through — `https://x/;id` in particular would have
  // run `id` on every briard-ctl.sh invocation, and handed the bridge a different subject than bash.
  test("rejects anything bash would read as more than a value", () => {
    for (const bad of [
      "me@example.com",
      "mailto:me example.com",
      'mailto:a@b"',
      "mailto:a@b$(id)",
      "https://x/;id",
      "https://x/&id",
      "https://x/|id",
      "https://x/`id`",
      "https://x/$(id)",
      "https://x/~root",
      "https://x/(id)",
      "https://x/\nBRIARD_TRUSTED_USER=",
    ]) {
      expect(() => validateSubject(bad)).toThrow();
    }
  });
});
