import { HERDR_FAMILY_PROFILES } from "./profile.ts";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { deriveConfigRoot, discoverSessionSockets, herdrSessionsIn } from "./sessions.ts";

// Herdr's session layout, moved here from `bridge/sessions.ts` with the `listSessions` capability
// (M22/02): the shape `<root>/herdr.sock` + `<root>/sessions/<name>/herdr.sock` is this adapter's,
// so the tests for it live beside it. Both listers are injected, so nothing here touches a disk.

describe.each([...HERDR_FAMILY_PROFILES])("$displayName", (profile) => {
describe("deriveConfigRoot", () => {
  test("a default-session socket's config root is its own directory", () => {
    expect(deriveConfigRoot(`/home/u/.config/${profile.configDirName}/${profile.socketFile}`)).toBe(`/home/u/.config/${profile.configDirName}`);
  });

  test("a named-session socket's config root is the prefix before /sessions/", () => {
    expect(deriveConfigRoot(`/home/u/.config/${profile.configDirName}/sessions/demo/${profile.socketFile}`)).toBe(
      `/home/u/.config/${profile.configDirName}`,
    );
  });
});

describe("discoverSessionSockets", () => {
  // `join`, because the module joins onto the root and the fake lister/probe compare to its output.
  const root = join("/cfg", profile.configDirName);

  test("finds the default socket plus each sessions/<name>/herdr.sock that exists", () => {
    const present = new Set([
      join(root, profile.socketFile),
      join(root, "sessions", "alpha", profile.socketFile),
      // 'zeta' dir exists but its socket does not (session cleanly stopped → socket removed).
    ]);
    const found = discoverSessionSockets(
      root,
      (dir) => (dir === join(root, "sessions") ? ["alpha", "zeta"] : []),
      (p) => present.has(p),
      profile,
    );
    expect(found).toEqual([
      { name: "default", socketPath: join(root, profile.socketFile) },
      { name: "alpha", socketPath: join(root, "sessions", "alpha", profile.socketFile) },
    ]);
  });

  test("omits the default when its socket is absent (default session not running)", () => {
    const present = new Set([join(root, "sessions", "only", profile.socketFile)]);
    const found = discoverSessionSockets(
      root,
      () => ["only"],
      (p) => present.has(p),
      profile,
    );
    expect(found).toEqual([{ name: "only", socketPath: join(root, "sessions", "only", profile.socketFile) }]);
  });

  test("returns nothing when no sockets exist", () => {
    expect(discoverSessionSockets(root, () => [], () => false, profile)).toEqual([]);
  });
});

describe("herdrSessionsIn", () => {
  // `join`, because the module joins onto the root and the fake lister/probe compare to its output.
  const root = join("/cfg", profile.configDirName);

  test("a socket path IS the endpoint the port asks for", () => {
    const present = new Set([join(root, profile.socketFile), join(root, "sessions", "work", profile.socketFile)]);
    expect(herdrSessionsIn(root, () => ["work"], (p) => present.has(p), profile)).toEqual([
      { name: "default", endpoint: join(root, profile.socketFile) },
      { name: "work", endpoint: join(root, "sessions", "work", profile.socketFile) },
    ]);
  });

  test("an empty answer is an empty LIST, the refusal is the adapter's, never this function's", () => {
    expect(herdrSessionsIn(root, () => [], () => false, profile)).toEqual([]);
  });
});

});
