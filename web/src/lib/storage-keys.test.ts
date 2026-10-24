import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { FakeIDBFactory, uninstallFakeIndexedDB } from "@/test/fake-indexeddb";
import { dropLegacyLastSeen } from "./last-seen";
import { __resetStore, getRecord, putRecord, STORE_NAME } from "./store";
import { wipeDevice } from "./wipe";

// EVERY STORAGE KEY THE APP WRITES HAS A DECIDED FATE AT UNPAIR (M46 spec 02).
//
// The wipe (lib/wipe.ts) is only as good as its list. A new key added under web/src with no line in
// the table below fails the first test here, so whoever adds it has to decide: is it session content
// the wipe must clear, or a preference that may stay? The second test then proves the table true by
// seeding each key and running the wipe.
//
// The scan reads app source for a quoted literal shaped like a Briard key (`briard:` or `briard.`),
// templates included, so `briard:auto-reloaded-for=${id}` reads as its prefix. Tests, the playground
// and fixtures are out of scope: none of them ships.

const SRC = join(import.meta.dirname, "..");
const KEY_LITERAL = /["'`](briard[:.][A-Za-z][^"'`\s$]*)/g;

/** Literals of that shape that are not storage keys at all. */
const NOT_STORAGE = new Map<string, string>([
  ["briard:open", "a service-worker postMessage type (lib/notification-open.ts)"],
  ["briard:herd", "a notification tag (lib/push-decision.ts)"],
  ["briard:herd@<host>", "the per-host notification tag, named in a comment"],
]);

type Area = "local" | "session";

interface KeyFate {
  area: Area;
  /** True when the key is a prefix and real keys carry a suffix after it. */
  prefix: boolean;
  /** `dropped`: a key from an older build that nothing writes any more; its module deletes it at boot. */
  fate: "wiped" | "kept" | "dropped";
  why: string;
}

const KEYS = new Map<string, KeyFate>([
  // ── Wiped: what a pairing leaves behind ──
  ["briard:draft:", { area: "local", prefix: true, fate: "wiped", why: "unsent words typed under the pairing" }],
  // The draft store's second version (lib/drafts.ts, PR 560); under the first one's prefix, so its wipe covers both.
  ["briard:draft:v2:", { area: "local", prefix: true, fate: "wiped", why: "unsent words typed under the pairing" }],
  // The token and the push endpoint are named by constants, so the scan sees them through those.
  ["briard:device-token", { area: "local", prefix: false, fate: "wiped", why: "the credential itself" }],
  ["briard:push-endpoint", { area: "local", prefix: false, fate: "wiped", why: "names this phone's push endpoint" }],
  // Cleared with the token (lib/pairing.ts `clearDeviceToken`): it caps the store at this pairing's expiry.
  ["briard:pairing-expires", { area: "local", prefix: false, fate: "wiped", why: "the ended pairing's expiry" }],
  // Written first by the wipe and removed last; present only while a wipe is unfinished (lib/wipe.ts).
  ["briard:wipe-pending", { area: "local", prefix: false, fate: "wiped", why: "a wipe's resume mark" }],
  // ── Kept: how this phone likes to look and behave, never what a session said ──
  ["briard:theme:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:design:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:themes:v1", { area: "local", prefix: false, fate: "kept", why: "preference, the imported colour themes (M57)" }],
  ["briard:key-board:v1", { area: "local", prefix: false, fate: "kept", why: "preference, this phone's key layout" }],
  ["briard:display-prefs:v4", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:dash-prefs:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:locale:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:haptics:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:harness-bar:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:harness-prefs:v1", { area: "local", prefix: false, fate: "kept", why: "preference, per harness (status line shown)" }],
  ["briard:strips-collapsed:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:stt-hands-free:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:stt-engine:v1", { area: "local", prefix: false, fate: "kept", why: "preference, Host or This phone for speech (ADR 0096)" }],
  ["briard:zen-enabled:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:auto-zen-enabled:v1", { area: "local", prefix: false, fate: "kept", why: "preference" }],
  ["briard:pins:v1", { area: "local", prefix: false, fate: "kept", why: "pinned pane ids, no content" }],
  ["briard:pin-hint:v1", { area: "local", prefix: false, fate: "kept", why: "a dismissed hint" }],
  ["briard:masked-hint:v1", { area: "local", prefix: false, fate: "kept", why: "a dismissed hint" }],
  ["briard:hidden-machines:v1", { area: "local", prefix: false, fate: "kept", why: "machine names hidden here" }],
  ["briard:mirror-native:", { area: "local", prefix: true, fate: "kept", why: "a per-pane colour choice" }],
  ["briard:tour:v1", { area: "local", prefix: false, fate: "kept", why: "the tour was seen" }],
  ["briard:new-sheet:again:v1", { area: "local", prefix: false, fate: "wiped", why: "the last start per machine names its folders" }],
  ["briard:no-prompts-confirmed:v1", { area: "local", prefix: false, fate: "wiped", why: "the per-device No prompts confirms name machines and command lines" }],
  ["briard:new-page:kind:v1", { area: "local", prefix: false, fate: "kept", why: "Agent or Command per machine, one word, no folder" }],
  ["briard:push-disabled", { area: "local", prefix: false, fate: "kept", why: "the operator's push choice" }],
  // Written BY the wipe, so it outlives it: the cause the pair screen names once, then clears.
  ["briard:wipe-last", { area: "local", prefix: false, fate: "kept", why: "a wipe reason word, no content" }],
  ["briard:update-mode:closed:v1", { area: "local", prefix: false, fate: "kept", why: "update screen state" }],
  ["briard:update-mode:v1", { area: "session", prefix: false, fate: "kept", why: "update screen state" }],
  ["briard:auto-reloaded-for=", { area: "session", prefix: true, fate: "kept", why: "reload guard, a build id" }],
  ["briard:pwa:guardReload:v1", { area: "session", prefix: false, fate: "kept", why: "reload guard" }],
  ["briard:preload-reload", { area: "session", prefix: false, fate: "kept", why: "reload guard, a timestamp" }],
  ["briard.nav.booted", { area: "session", prefix: false, fate: "kept", why: "navigation state" }],
  ["briard.nav.seeded", { area: "session", prefix: false, fate: "kept", why: "navigation state, an app path" }],
  ["briard.nav.pendingOpen", { area: "session", prefix: false, fate: "kept", why: "navigation state, an app path" }],
  ["briard.nav.trail", { area: "session", prefix: false, fate: "kept", why: "navigation state, the app paths this tab visited" }],
  // ── Dropped: the 1.17 last-seen mirror, moved into the on-device store (ADR 0087) ──
  ["briard:last-snapshot:", { area: "session", prefix: true, fate: "dropped", why: "lib/last-seen.ts deletes it at boot" }],
  ["briard:last-pane:", { area: "session", prefix: true, fate: "dropped", why: "lib/last-seen.ts deletes it at boot" }],
]);

/**
 * Every IndexedDB database the app opens, and its fate at unpair. One today: the on-device store
 * (lib/store.ts, ADR 0087), which holds the herd and the pane text as last seen, and the Chat tail.
 */
const DATABASES = new Map<string, "wiped" | "kept">([[STORE_NAME, "wiped"]]);

/** The one module allowed to open IndexedDB. A second store is a second thing to wipe. */
const IDB_OWNER = "lib/store.ts";

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(SRC, full);
    if (entry.isDirectory()) {
      if (rel === "playground" || rel === "test" || rel === "fixtures") continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function keyLiterals(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of collectSourceFiles(SRC)) {
    for (const match of readFileSync(file, "utf8").matchAll(KEY_LITERAL)) {
      const literal = match[1];
      if (literal !== undefined && !found.has(literal)) found.set(literal, relative(SRC, file));
    }
  }
  return found;
}

function storageOf(area: Area): Storage {
  return area === "local" ? localStorage : sessionStorage;
}

describe("storage keys and the wipe", () => {
  it("finds the keys it should (guard against a broken scan)", () => {
    const found = keyLiterals();
    expect(found.has("briard:draft:")).toBe(true);
    expect(found.has("briard:device-token")).toBe(true);
  });

  it("every storage key written under web/src has a decided fate at unpair", () => {
    const undecided = [...keyLiterals()]
      .filter(([literal]) => !KEYS.has(literal) && !NOT_STORAGE.has(literal))
      .map(([literal, file]) => `${literal} (${file})`);
    expect(undecided).toEqual([]);
  });

  it("the table is true: the wipe clears every wiped key and leaves every kept one", async () => {
    sessionStorage.clear();
    const keyOf = (name: string, fate: KeyFate) => (fate.prefix ? `${name}probe` : name);
    for (const [name, fate] of KEYS) storageOf(fate.area).setItem(keyOf(name, fate), "1");

    await wipeDevice("unpair");

    const wrong = [...KEYS]
      .filter(([, fate]) => fate.fate !== "dropped")
      .filter(([name, fate]) => {
        const present = storageOf(fate.area).getItem(keyOf(name, fate)) !== null;
        return fate.fate === "wiped" ? present : !present;
      })
      .map(([name, fate]) => `${name} should be ${fate.fate}`);
    expect(wrong).toEqual([]);
  });
  it("a dropped key is deleted at boot, whatever the wipe does", () => {
    const keyOf = (name: string, fate: KeyFate) => (fate.prefix ? `${name}probe` : name);
    const dropped = [...KEYS].filter(([, fate]) => fate.fate === "dropped");
    for (const [name, fate] of dropped) storageOf(fate.area).setItem(keyOf(name, fate), "1");
    dropLegacyLastSeen();
    const left = dropped.filter(([name, fate]) => storageOf(fate.area).getItem(keyOf(name, fate)) !== null);
    expect(left.map(([name]) => name)).toEqual([]);
  });

  it("only the store opens IndexedDB", () => {
    const openers = collectSourceFiles(SRC)
      .filter((file) => /\bindexedDB\b/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(openers).toEqual([IDB_OWNER]);
  });

  it("every IndexedDB database has a decided fate, and the wipe deletes the wiped ones", async () => {
    const idb = new FakeIDBFactory().install();
    try {
      __resetStore();
      await putRecord("snapshot", "probe", 1);
      await wipeDevice("unpair");
      for (const [name, fate] of DATABASES) expect(idb.deleted.includes(name)).toBe(fate === "wiped");
      expect(await getRecord("snapshot", "probe")).toBeNull();
    } finally {
      __resetStore();
      uninstallFakeIndexedDB();
    }
  });
});
