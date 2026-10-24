import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

// The version resolver itself lives in `bridge/version.ts` (the bridge answers `hello` with it and
// cannot import from `cli/`); `briardVersion*` are re-exported from here, so these cases exercise
// one implementation either way.
import { bareVersionFrom } from "../bridge/version.ts";
import {
  briardVersion,
  briardVersionBare,
  briardVersionFrom,
  deriveSettings,
  effectiveServePort,
  parseEnvFile,
  parseServePort,
  PLUGIN_ID,
  resolveConfigDir,
  resolveHome,
  instanceSuffix,
  resolveInstance,
  shadowNotes,
  tightenEnvFile,
  upsertEnvVars,
  type Environment,
} from "./context.ts";

// Ported behaviour, so these tests are written against the shell they replace: the config-dir
// precedence of the pre-shim briard-ctl.sh and its three-way version string. If the binary and
// the script disagree here, a setting applied one way is silently ignored the other — the exact bug
// the precedence comment records.

const HOME = "/home/tester";
const LEGACY = join(HOME, ".config", "briard");
const CONVENTIONAL = join(HOME, ".config", "herdr", "plugins", "config", PLUGIN_ID);

function resolve(opts: {
  env?: Environment;
  files?: string[];
  herdr?: string | null;
}) {
  const files = new Set(opts.files ?? []);
  return resolveConfigDir({
    env: opts.env ?? {},
    home: HOME,
    fileExists: (p) => files.has(p),
    askHerdr: () => opts.herdr ?? null,
  });
}

describe("config dir precedence", () => {
  test("the injected env var wins over everything", () => {
    const r = resolve({
      env: { HERDR_PLUGIN_CONFIG_DIR: "/injected" },
      herdr: "/from-herdr",
      files: [join(CONVENTIONAL, ".env")],
    });
    expect(r.dir).toBe("/injected");
  });

  test("a blank injected value does not count as injected", () => {
    expect(resolve({ env: { HERDR_PLUGIN_CONFIG_DIR: "   " }, herdr: "/from-herdr" }).dir).toBe(
      "/from-herdr",
    );
  });

  test("the Herdr CLI is asked next, and wins when its dir holds the .env", () => {
    expect(resolve({ herdr: "/from-herdr", files: [join("/from-herdr", ".env")] }).dir).toBe(
      "/from-herdr",
    );
  });

  // The 2026-08-26 bug: a `herdr` binary on PATH answers for every Briard on the host, so a binary
  // install's own `~/.config/briard/.env` was ignored in favour of a plugin dir nothing had written.
  test("a Herdr answer with no .env loses to a conventional dir that has one", () => {
    const r = resolve({ herdr: "/from-herdr", files: [join(CONVENTIONAL, ".env")] });
    expect(r.dir).toBe(CONVENTIONAL);
    expect(r.note).toBeNull();
  });

  test("a Herdr answer with no .env loses to ~/.config/briard's .env", () => {
    const r = resolve({ herdr: "/from-herdr", files: [join(LEGACY, ".env")] });
    expect(r.dir).toBe(LEGACY);
    expect(r.note).toBeNull();
  });

  test("with no .env anywhere, Herdr's answer is still taken", () => {
    expect(resolve({ herdr: "/from-herdr" }).dir).toBe("/from-herdr");
    expect(resolve({ herdr: "/from-herdr", files: ["/from-herdr", CONVENTIONAL] }).dir).toBe(
      "/from-herdr",
    );
  });

  test("Herdr saying nothing (or being absent) falls through", () => {
    expect(resolve({ herdr: "" }).dir).toBe(LEGACY);
    expect(resolve({ herdr: null }).dir).toBe(LEGACY);
  });

  test("the conventional path counts only when it actually holds a .env", () => {
    expect(resolve({ files: [join(CONVENTIONAL, ".env")] }).dir).toBe(CONVENTIONAL);
    expect(resolve({ files: [CONVENTIONAL] }).dir).toBe(LEGACY);
  });

  test("~/.config/briard is the last resort", () => {
    expect(resolve({}).dir).toBe(LEGACY);
  });
});

// The mux choice lives in the `.env` being searched for, so a plain shell names no tool. A Flockr
// plugin install must still be found, and must not resolve to Herdr's dir.
describe("config dir across the Herdr family", () => {
  const FLOCKR_DIR = join(HOME, ".config", "flockr", "plugins", "config", "flockr.briard");
  const HERDR_DIR = join(HOME, ".config", "herdr", "plugins", "config", "herdr.briard");

  function search(env: Environment, files: string[], answers: Record<string, string> = {}) {
    const asked: string[] = [];
    const set = new Set(files);
    const r = resolveConfigDir({
      env,
      home: HOME,
      fileExists: (p) => set.has(p),
      askHerdr: (profile) => {
        asked.push(profile.mux);
        return answers[profile.mux] ?? null;
      },
    });
    return { dir: r.dir, asked };
  }

  test("a Flockr plugin install is found from a shell that names no tool", () => {
    expect(search({}, [join(FLOCKR_DIR, ".env")]).dir).toBe(FLOCKR_DIR);
  });

  test("Flockr's own answer counts when it holds the .env", () => {
    expect(search({}, ["/flockr-said/.env"], { flockr: "/flockr-said" }).dir).toBe("/flockr-said");
  });

  test("inside a Flockr pane, Flockr's dir wins when both tools hold a .env", () => {
    const files = [join(FLOCKR_DIR, ".env"), join(HERDR_DIR, ".env")];
    const r = search({ FLOCKR_ENV: "1", FLOCKR_SOCKET_PATH: "/x/flockr.sock" }, files);
    expect(r.dir).toBe(FLOCKR_DIR);
    expect(r.asked[0]).toBe("flockr");
  });

  test("outside either tool, Herdr is searched first as before", () => {
    const files = [join(FLOCKR_DIR, ".env"), join(HERDR_DIR, ".env")];
    expect(search({}, files).dir).toBe(HERDR_DIR);
  });

  test("an explicit BRIARD_MUX searches only that tool", () => {
    const r = search({ BRIARD_MUX: "herdr" }, [join(FLOCKR_DIR, ".env")]);
    expect(r.asked).toEqual(["herdr"]);
    expect(r.dir).toBe(LEGACY);
  });

  test("a named instance finds its own suffixed dir under Flockr", () => {
    const v1 = join(HOME, ".config", "flockr", "plugins", "config", "flockr.briard-v1");
    expect(search({ BRIARD_INSTANCE: "v1", BRIARD_PORT: "8788" }, [join(v1, ".env")]).dir).toBe(v1);
  });
});

describe("the legacy .env note", () => {
  test("fires when a legacy .env exists but is not the resolved dir", () => {
    // Both files exist and the Herdr one is in use — the case the note was written for.
    const r = resolve({
      herdr: "/from-herdr",
      files: [join("/from-herdr", ".env"), join(LEGACY, ".env")],
    });
    expect(r.dir).toBe("/from-herdr");
    expect(r.note).toContain(join(LEGACY, ".env"));
    expect(r.note).toContain(join("/from-herdr", ".env"));
  });

  test("stays silent when the legacy dir IS the resolved dir", () => {
    expect(resolve({ files: [join(LEGACY, ".env")] }).note).toBeNull();
  });

  test("stays silent when there is no legacy .env to ignore", () => {
    expect(resolve({ herdr: "/from-herdr", files: [join("/from-herdr", ".env")] }).note).toBeNull();
  });
});

// A named instance may only ever land on a dir the operator made for it. The alternative is the
// 2026-08-12 incident: `BRIARD_INSTANCE=v1 briard crew add` resolved the DEFAULT instance's config
// dir, and a crew verb read and then MUTATED the live stable instance's trust store.
describe("config dir for a named instance", () => {
  const V1 = join(HOME, ".config", "herdr", "plugins", "config", `${PLUGIN_ID}-v1`);

  function resolveV1(opts: { env?: Environment; files?: string[] }) {
    const files = new Set(opts.files ?? []);
    let asks = 0;
    const r = resolveConfigDir({
      env: { BRIARD_INSTANCE: "v1", BRIARD_PORT: "8788", ...opts.env },
      home: HOME,
      fileExists: (p) => files.has(p),
      askHerdr: () => {
        asks += 1;
        return "/from-herdr";
      },
    });
    return { ...r, asks };
  }

  test("its own suffixed conventional dir wins, and Herdr is never asked", () => {
    const r = resolveV1({ files: [join(V1, ".env"), join(CONVENTIONAL, ".env")] });
    expect(r.dir).toBe(V1);
    expect(r.asks).toBe(0);
  });

  test("no suffixed dir refuses, naming the path it wanted", () => {
    let err: unknown;
    try {
      resolveV1({ files: [join(CONVENTIONAL, ".env"), join(LEGACY, ".env")] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    // SAFETY: the line above IS the check — this only reads the message off what it just proved.
    const message = (err as Error).message;
    expect(message).toContain(join(V1, ".env"));
    expect(message).toContain('BRIARD_INSTANCE="v1"');
    // The two dirs it must never silently borrow.
    expect(message).not.toContain(join(CONVENTIONAL, ".env"));
    expect(message).not.toContain(join(LEGACY, ".env"));
  });

  test("an injected config dir still wins, unchanged", () => {
    const r = resolveV1({ env: { HERDR_PLUGIN_CONFIG_DIR: "/injected" } });
    expect(r.dir).toBe("/injected");
    expect(r.asks).toBe(0);
  });

  test("a legacy .env draws no note — it belongs to the host's first Briard", () => {
    expect(resolveV1({ files: [join(V1, ".env"), join(LEGACY, ".env")] }).note).toBeNull();
  });

  test("an unusable instance name falls through, leaving the refusal to resolveInstance", () => {
    // Single-sourced: `resolveConfigDir` does not duplicate the shape check's error.
    expect(resolve({ env: { BRIARD_INSTANCE: "V 1" }, herdr: "/from-herdr" }).dir).toBe(
      "/from-herdr",
    );
    expect(() => resolveInstance({ BRIARD_INSTANCE: "V 1", BRIARD_PORT: "8788" })).toThrow(
      /not a usable instance name/,
    );
  });

  test("an empty instance is no instance", () => {
    expect(resolve({ env: { BRIARD_INSTANCE: "  " }, herdr: "/from-herdr" }).dir).toBe(
      "/from-herdr",
    );
  });
});

// `.env` holds BRIARD_VAPID_PRIVATE and the settings that decide who may type into this operator's
// terminals. Nothing else in Briard can notice a readable one: both readers take it at any mode.
describe("tightenEnvFile", () => {
  const perms = (mode: number | null, ok = true) => {
    const tightened: string[] = [];
    return {
      io: { mode: () => mode, tighten: (p: string) => (tightened.push(p), ok) },
      tightened,
    };
  };

  test("an owner-only file is left alone and says nothing", () => {
    for (const mode of [0o600, 0o400]) {
      const p = perms(mode);
      expect(tightenEnvFile("/x/.env", p.io)).toBeNull();
      expect(p.tightened).toEqual([]);
    }
  });

  test("a readable file is tightened in place, and the line says what it was", () => {
    const p = perms(0o644);
    expect(tightenEnvFile("/x/.env", p.io)).toBe(
      "warn: /x/.env was mode 644 (expected 600); tightened it to 600.",
    );
    expect(p.tightened).toEqual(["/x/.env"]);
  });

  test("a file this process cannot chmod WARNS — it never refuses to start", () => {
    const p = perms(0o664, false);
    expect(tightenEnvFile("/x/.env", p.io)).toContain("could not be tightened");
  });

  test("a file that cannot be stated is not a finding", () => {
    expect(tightenEnvFile("/x/.env", perms(null).io)).toBeNull();
  });
});

describe("parseEnvFile", () => {
  test("reads plain assignments, comments and blanks", () => {
    expect(parseEnvFile("# a comment\n\nBRIARD_PORT=9000\n  BRIARD_SERVE_MODE=http\n")).toEqual({
      BRIARD_PORT: "9000",
      BRIARD_SERVE_MODE: "http",
    });
  });

  test("honours an `export` prefix", () => {
    expect(parseEnvFile("export BRIARD_PORT=9000")).toEqual({ BRIARD_PORT: "9000" });
  });

  test("unwraps quotes — single literal, double with the common escapes", () => {
    expect(parseEnvFile(`A='raw $NOPE'\nB="line\\nbreak"\nC="say \\"hi\\""`)).toEqual({
      A: "raw $NOPE",
      B: "line\nbreak",
      C: 'say "hi"',
    });
  });

  test("strips a trailing inline comment only from an unquoted value", () => {
    expect(parseEnvFile("A=8787 # the port\nB='8787 # not a comment'")).toEqual({
      A: "8787",
      B: "8787 # not a comment",
    });
  });

  test("ignores anything that is not an assignment — a .env is parsed, never executed", () => {
    // The whole point of not `source`ing: a function defined here used to shadow the real `bun`
    // and poison every later lookup (the pre-shim briard-ctl.sh).
    const parsed = parseEnvFile('bun() { echo nope; }\nrm -rf /\nBRIARD_PORT=9000\n');
    expect(parsed).toEqual({ BRIARD_PORT: "9000" });
  });

  test("a later assignment wins, as re-assignment would in a sourced file", () => {
    expect(parseEnvFile("A=1\nA=2")).toEqual({ A: "2" });
  });
});

// `.env` still wins the merge in `loadContext` — the precedence is load-bearing and unchanged. This
// only tests that the win stops being silent: the pure computation `loadContext` calls at the merge
// site, so it never has to touch the real `process.env`.
describe("shadowNotes", () => {
  test("a differing value gets one note naming both", () => {
    expect(shadowNotes({ BRIARD_PORT: "8788" }, { BRIARD_PORT: "8787" })).toEqual([
      "note: BRIARD_PORT=8788 from your environment is shadowed by .env (8787).",
    ]);
  });

  test("an equal value says nothing", () => {
    expect(shadowNotes({ BRIARD_PORT: "8787" }, { BRIARD_PORT: "8787" })).toEqual([]);
  });

  test("an unset ambient value says nothing — there was nothing to shadow", () => {
    expect(shadowNotes({}, { BRIARD_PORT: "8787" })).toEqual([]);
  });

  test("a credential-shaped name is named but never valued", () => {
    expect(
      shadowNotes({ BRIARD_STT_API_KEY: "sk-old" }, { BRIARD_STT_API_KEY: "sk-new" }),
    ).toEqual(["note: BRIARD_STT_API_KEY from your environment is shadowed by .env."]);
  });

  test("more than the cap collapses into a summary line", () => {
    const ambient = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`VAR_${i}`, "old"]));
    const fromFile = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`VAR_${i}`, "new"]));
    const notes = shadowNotes(ambient, fromFile);
    expect(notes).toHaveLength(6);
    expect(notes.slice(0, 5).every((l) => l.startsWith("note: VAR_"))).toBe(true);
    expect(notes[5]).toBe("note: 2 more environment variables shadowed by .env.");
  });
});

// The other direction, and the only writer of a `.env` in the tree (`briard start`'s first-run mux
// pick, M14/03). What it writes must be what `parseEnvFile` reads back, so the round trip is the
// assertion in every case here.
describe("upsertEnvVars", () => {
  test("replaces an assignment where it stands and leaves everything else alone", () => {
    const written = upsertEnvVars("# mine\nBRIARD_PORT=8788\nBRIARD_MUX=herdr\n# after\n", {
      BRIARD_MUX: "tmux",
    });
    expect(written).toBe("# mine\nBRIARD_PORT=8788\nBRIARD_MUX=tmux\n# after\n");
  });

  test("appends what was not there, and ends on exactly one newline", () => {
    expect(upsertEnvVars("", { BRIARD_MUX: "zellij" })).toBe("BRIARD_MUX=zellij\n");
    expect(upsertEnvVars("A=1", { B: "2" })).toBe("A=1\nB=2\n");
    expect(upsertEnvVars("A=1\n\n\n", { B: "2" })).toBe("A=1\nB=2\n");
  });

  test("an `export` prefix and indentation are kept — the operator's file, in their shape", () => {
    expect(upsertEnvVars("  export A=1\n", { A: "2" })).toBe("  A=2\n");
  });

  test("quotes exactly what parseEnvFile would need quoted, and the pair round-trips", () => {
    const vars = { A: "/run/user/1000/briard.sock", B: "a session", C: 'say "hi" $NOPE', D: "two\nlines" };
    expect(upsertEnvVars("", vars)).toContain("A=/run/user/1000/briard.sock");
    expect(parseEnvFile(upsertEnvVars("", vars))).toEqual(vars);
  });

  test("a value that looks like a comment survives the round trip", () => {
    expect(parseEnvFile(upsertEnvVars("", { A: "8787 # not a comment" }))).toEqual({
      A: "8787 # not a comment",
    });
  });
});

describe("version", () => {
  const BUILD_INFO = '{"id":"x","version":"0.24.2","sha":"f76be58"}';
  const MANIFEST = 'id = "herdr.briard"\nversion = "0.24.2"\n';

  test("the built stamp wins, as version+sha", () => {
    expect(briardVersionFrom(BUILD_INFO, MANIFEST)).toBe("0.24.2+f76be58");
  });

  test("a stamp with no sha prints the bare version", () => {
    expect(briardVersionFrom('{"version":"0.24.2"}', MANIFEST)).toBe("0.24.2");
  });

  test("no stamp falls back to the manifest, tagged as unbuilt", () => {
    expect(briardVersionFrom(null, MANIFEST)).toBe("0.24.2 (manifest; web not built)");
  });

  test("neither is `unknown` — never an empty line or a crash", () => {
    expect(briardVersionFrom(null, null)).toBe("unknown");
    expect(briardVersionFrom(null, "no version here")).toBe("unknown");
  });

  test("a half-written stamp is still read, as the shell's sed would", () => {
    // Truncated mid-write: the version line is complete, the sha's closing quote is not — so the
    // version survives and the sha is simply absent, exactly as the shell's two seds behaved.
    expect(briardVersionFrom('{"version":"0.24.2","sha":"f76be5', MANIFEST)).toBe("0.24.2");
    expect(briardVersionFrom('{"version":"0.24.2","sha":"f76be58"', MANIFEST)).toBe("0.24.2+f76be58");
  });

  test("a stamp with no version at all falls through to the manifest", () => {
    expect(briardVersionFrom("{}", MANIFEST)).toBe("0.24.2 (manifest; web not built)");
  });

  test("reads the two real paths off a checkout-shaped directory", () => {
    const root = mkdtempSync(join(tmpdir(), "briard-version-"));
    writeFileSync(join(root, "herdr-plugin.toml"), MANIFEST);
    expect(briardVersion(root)).toBe("0.24.2 (manifest; web not built)");
    mkdirSync(join(root, "web", "dist"), { recursive: true });
    writeFileSync(join(root, "web", "dist", "build-info.json"), BUILD_INFO);
    expect(briardVersion(root)).toBe("0.24.2+f76be58");
  });

  test("the BARE spelling is the wire's: a version and never a parenthetical (§7.1)", () => {
    // What `hello` answers with. A parenthetical would make a machine with an unbuilt bundle read as
    // skewed against every peer — including one running the identical release.
    expect(bareVersionFrom(BUILD_INFO, MANIFEST)).toBe("0.24.2+f76be58");
    expect(bareVersionFrom(null, MANIFEST)).toBe("0.24.2");
    expect(bareVersionFrom(null, null)).toBe("unknown");
  });

  test("both spellings name the same version off the same checkout — one resolver, two decorations", () => {
    const root = mkdtempSync(join(tmpdir(), "briard-version-bare-"));
    writeFileSync(join(root, "herdr-plugin.toml"), MANIFEST);
    expect(briardVersion(root)).toBe("0.24.2 (manifest; web not built)");
    expect(briardVersionBare(root)).toBe("0.24.2");
  });

  test("an empty directory is `unknown`, not a thrown ENOENT", () => {
    expect(briardVersion(mkdtempSync(join(tmpdir(), "briard-version-empty-")))).toBe("unknown");
  });
});

describe("derived settings", () => {
  test("defaults match the shell's", () => {
    expect(deriveSettings({}, HOME)).toEqual({
      port: 8787,
      serveMode: "https",
      servePort: 443,
      basePath: "/",
      // herdr keeps its socket under %APPDATA% on Windows (bridge/config.ts), `~/.config` elsewhere.
      socket:
        process.platform === "win32"
          ? join(HOME, "AppData", "Roaming", "herdr", "herdr.sock")
          : join(HOME, ".config", "herdr", "herdr.sock"),
    });
  });

  test("env overrides each of them", () => {
    expect(
      deriveSettings(
        {
          BRIARD_PORT: "9000",
          BRIARD_SERVE_MODE: "http",
          BRIARD_SERVE_PORT: "8443",
          HERDR_SOCKET_PATH: "/run/h.sock",
        },
        HOME,
      ),
    ).toEqual({ port: 9000, serveMode: "http", servePort: 8443, basePath: "/", socket: "/run/h.sock" });
  });

  test("a non-numeric port falls back rather than becoming NaN", () => {
    expect(deriveSettings({ BRIARD_PORT: "8787abc" }, HOME).port).toBe(8787);
  });

  test("only the literal `http` leaves https — a typo does not silently disable TLS", () => {
    expect(deriveSettings({ BRIARD_SERVE_MODE: "htpp" }, HOME).serveMode).toBe("https");
    expect(deriveSettings({ BRIARD_SERVE_MODE: "HTTP" }, HOME).serveMode).toBe("https");
  });
});

describe("BRIARD_SERVE_PORT", () => {
  test("unset or empty is 443 — the default install is untouched", () => {
    expect(parseServePort({})).toEqual({ ok: true, port: 443 });
    expect(parseServePort({ BRIARD_SERVE_PORT: "" })).toEqual({ ok: true, port: 443 });
    expect(parseServePort({ BRIARD_SERVE_PORT: "  " })).toEqual({ ok: true, port: 443 });
    expect(effectiveServePort({})).toBe(443);
  });

  test("a port in range is taken, surrounding whitespace and all", () => {
    expect(parseServePort({ BRIARD_SERVE_PORT: "8443" })).toEqual({ ok: true, port: 8443 });
    expect(parseServePort({ BRIARD_SERVE_PORT: " 8443 " })).toEqual({ ok: true, port: 8443 });
    expect(parseServePort({ BRIARD_SERVE_PORT: "1" })).toEqual({ ok: true, port: 1 });
    expect(parseServePort({ BRIARD_SERVE_PORT: "65535" })).toEqual({ ok: true, port: 65535 });
  });

  test("anything else is refused BY NAME — 0, out of range, not a whole number", () => {
    const refusal = (value: string): string => {
      const parsed = parseServePort({ BRIARD_SERVE_PORT: value });
      if (parsed.ok) throw new Error(`expected a refusal for: ${value}`);
      return parsed.message;
    };
    for (const bad of ["0", "70000", "8x", "-1", "84.43"]) {
      expect(refusal(bad)).toContain("BRIARD_SERVE_PORT");
    }
  });

  test("the lenient half falls back rather than throwing — no unrelated verb dies on a typo", () => {
    // `url`, `status`, `qr` and `doctor` all read the context; only `briard serve` refuses.
    expect(effectiveServePort({ BRIARD_SERVE_PORT: "70000" })).toBe(443);
    expect(deriveSettings({ BRIARD_SERVE_PORT: "8x" }, HOME).servePort).toBe(443);
  });
});

describe("resolveHome", () => {
  test("uses $HOME when set", () => {
    expect(resolveHome({ HOME: "/home/x" })).toBe("/home/x");
  });

  test("falls back to the passwd entry when there is no environment at all", () => {
    // `env -i` is the primary contract: no HOME, and every ~-derived path still has to resolve.
    const h = resolveHome({});
    // Absolute on this platform: `/home/x` on POSIX, `C:\Users\x` on Windows.
    expect(isAbsolute(h)).toBe(true);
    expect(h).not.toBe("");
  });
});

// ── The instance suffix ──────────────────────────────────────────────────────
// The knob that lets a second Briard run beside the first. Its most important property is the one
// that is easiest to lose: ABSENT must stay absent — `null`, never `""` — because every name
// downstream is built by concatenation and an empty suffix would look identical right up until
// something serialises it.

describe("resolveInstance", () => {
  test("no variable, an empty one and whitespace are all the solo instance", () => {
    for (const env of [{}, { BRIARD_INSTANCE: "" }, { BRIARD_INSTANCE: "   " }]) {
      expect(resolveInstance(env)).toBeNull();
    }
  });

  test("a valid suffix needs an explicit port and then resolves to itself", () => {
    expect(resolveInstance({ BRIARD_INSTANCE: "v1", BRIARD_PORT: "8788" })).toBe("v1");
    expect(resolveInstance({ BRIARD_INSTANCE: "next-2", BRIARD_PORT: "9000" })).toBe("next-2");
  });

  test("REFUSES a named instance with no explicit port — two instances would fight for 8787", () => {
    expect(() => resolveInstance({ BRIARD_INSTANCE: "v1" })).toThrow(/explicit BRIARD_PORT/);
    // A non-numeric port is no port: `deriveSettings` would fall back to the default, which is
    // exactly the collision this refusal exists to prevent.
    expect(() => resolveInstance({ BRIARD_INSTANCE: "v1", BRIARD_PORT: "eight" })).toThrow(
      /explicit BRIARD_PORT/,
    );
  });

  test("refuses anything that is not a safe unit name, label and filename", () => {
    for (const bad of ["V1", "v 1", "v/1", "v.1", "../etc", "a".repeat(17), "v1_beta"]) {
      expect(() => resolveInstance({ BRIARD_INSTANCE: bad, BRIARD_PORT: "8788" })).toThrow(
        /not a usable instance name/,
      );
    }
  });
});

describe("instanceSuffix", () => {
  test("the solo instance contributes NOTHING to a name", () => {
    expect(instanceSuffix(null)).toBe("");
    expect(instanceSuffix("v1")).toBe("-v1");
  });
});

// ADR 0052: the CLI reads the mount with the bridge's own normaliser, so the two cannot disagree.
describe("deriveSettings — BRIARD_BASE_PATH", () => {
  test("the root when unset, the slash-wrapped path when set", () => {
    expect(deriveSettings({}, HOME).basePath).toBe("/");
    expect(deriveSettings({ BRIARD_BASE_PATH: "briard" }, HOME).basePath).toBe("/briard/");
    expect(deriveSettings({ BRIARD_BASE_PATH: "/apps/briard/" }, HOME).basePath).toBe("/apps/briard/");
  });
});

describe("Flockr context", () => {
  test("uses Flockr's injected config and socket when explicitly selected", () => {
    const env = { BRIARD_MUX: "flockr", FLOCKR_PLUGIN_CONFIG_DIR: "/flockr-config", HERDR_PLUGIN_CONFIG_DIR: "/wrong-config", FLOCKR_SOCKET_PATH: "/flockr.sock", HERDR_SOCKET_PATH: "/wrong.sock" };
    expect(resolve({ env }).dir).toBe("/flockr-config");
    expect(deriveSettings(env, HOME).socket).toBe("/flockr.sock");
  });
  test("finds Flockr's conventional plugin config without invoking the tool", () => {
    const dir = join(HOME, ".config", "flockr", "plugins", "config", "flockr.briard");
    expect(resolve({ env: { BRIARD_MUX: "flockr" }, files: [join(dir, ".env")] }).dir).toBe(dir);
  });
});
