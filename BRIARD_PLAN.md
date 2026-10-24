# Briard fork plan

Briard is a fork of [ColliePWA](https://github.com/AltanS/collie) (MIT). Collie is to Herdr as
Briard is to Flockr: a phone web UI for the coding agents running in your terminal multiplexer.
Briard keeps every multiplexer Collie supports (Herdr, tmux, zellij, tuios, Tern) and adds
**Flockr**. The operator picks one; first run detects what is installed and asks.

Owner: Matthew Smith (`mcsmith3`). Repo target: `github.com/mcsmith3/briard` (not created or pushed
yet). Upstream remote: `upstream` → `AltanS/collie`, fork point `35d3ccf`.

Workflow: Claude plans and reviews, Codex implements in visible Flockr panes. Each phase ends
green (typecheck, lint, bridge/cli/scripts tests, web vitest) and gets a Claude review before its
commit. Phases run in order because Phase 1 touches nearly every file.

## Ground rules (from upstream TRADEMARKS.md and LICENSE)

- A fork needs its own name: no "ColliePWA" or "Collie" as the product name. Saying "a fork of
  ColliePWA" is allowed and the README says so near the top.
- No Collie logo: remove the dog mark, wordmark, favicons, app icons and social card. Ship a new
  Briard mark.
- Keep the MIT copyright notice for Altan Sarisin in `LICENSE`; add a line for Matthew Smith.
- Don't point anything at `colliepwa.dev`, and don't publish as ColliePWA.
- No Claude/Codex attribution in commits (owner's global rule).

## Facts verified on this machine (2026-10-23)

- Flockr 1.0.0 and Herdr 0.9.1 both report **socket protocol 22**. Flockr's API schema is
  Herdr's plus `layout.select`, `layout.sort_by_age`, `pane.clear`, `pane.mark_unread`,
  `pane.link.list` and a few new fields, minus `pane.graphics.*`. Collie never calls graphics.
- A live `session.snapshot` against `~/.config/flockr/flockr.sock` returns the shape Collie's Herdr
  client reads.
- Flockr maps 1:1 onto Herdr's names:

  | Herdr | Flockr |
  | --- | --- |
  | binary `herdr` | `flockr` |
  | `~/.config/herdr/herdr.sock` | `~/.config/flockr/flockr.sock` |
  | named sessions `<root>/sessions/<name>/herdr.sock` | `<root>/sessions/<name>/flockr.sock` (verify) |
  | `HERDR_SOCKET_PATH`, `HERDR_PANE_ID`, `HERDR_ENV` … | `FLOCKR_SOCKET_PATH`, `FLOCKR_PANE_ID`, `FLOCKR_ENV` … |
  | `HERDR_PLUGIN_CONFIG_DIR` / `_STATE_DIR` / `_ROOT` | `FLOCKR_PLUGIN_*` |
  | `herdr-plugin.toml`, `min_herdr_version` | `flockr-plugin.toml`, `min_flockr_version` |
  | `herdr plugin …`, `herdr integration status`, `herdr machine list --json` | same verbs under `flockr` |
  | hooks `herdr-agent-state.sh` / `.ts` | `flockr-agent-state.sh` / `.ts` |
  | `~/.config/herdr/config.toml`, `.herdr/worktrees` | `~/.config/flockr/config.toml`, `.flockr/worktrees` (verify) |

- Version numbers differ (Flockr 1.0.0 vs Herdr 0.9.x). Collie barely gates on the Herdr version
  (`HERDR_MIN_WINDOWS` in `cli/history.ts`); Flockr must not inherit Herdr's numbers.

## Phase 1: Collie → Briard rename (Herdr untouched)

Full rename, internal names included. Every variant:

| From | To |
| --- | --- |
| `ColliePWA`, `Collie`, `collie`, `COLLIE_` | `Briard`, `briard`, `BRIARD_` |
| `colliepwa`, `@colliepwa/durable-sdk` | `briard`, `@briard/durable-sdk` |
| plugin id `herdr.collie` | `herdr.briard` |
| `AltanS/collie` (update check, install URLs, issue links) | `mcsmith3/briard` |
| `colliepwa.dev` links | GitHub repo or docs paths; drop marketing/UTM/demo links |
| file and dir names containing `collie` | `briard` |
| `bin/collie`, `collie.service`, `collie-ctl.sh`, AUR `collie-bin`, Nix `collie.nix` | `briard` equivalents |

Leave alone: `LICENSE` notice (add owner line), the upstream attribution sentence in the README,
`.adr/` *content* references to upstream history where renaming would falsify a record (rename
product name in prose, keep issue numbers), CHANGELOG entries before the fork. Start a fresh
`## [Unreleased]` → `0.1.0` "Forked from ColliePWA 1.24.0" entry; set all three version files to
`0.1.0`.

Remove `.github/FUNDING.yml` sponsorship handles (AltanS / altanbln). Remove or rewrite
`TRADEMARKS.md` as Briard's own short note.

Logo: delete the Collie marks and icons (`web/public/*`, `assets/`, `collie-mark*`, the theme
named `collie`). Add a simple original Briard SVG mark (a shaggy herding dog head, flat, two
colours) and regenerate favicons/app icons from it. The owner can replace it later.

Watch for: the rename must not produce `BRIARD_` collisions or break string-length-sensitive
fixtures/snapshots; i18n strings in all twelve languages; the update check (`bridge/update.ts`)
pointing at a repo with no releases yet must stay quiet, not error.

Done when: `git grep -i -E 'collie|colliepwa'` hits only the allowed attribution/history places,
and the full suite is green.

## Phase 2: Flockr adapter

Don't copy-paste the Herdr adapter. Turn `bridge/mux/herdr/` into one implementation driven by a
**profile**, and register two adapters from it, `herdr` and `flockr`:

```ts
interface HerdrFamilyProfile {
  mux: "herdr" | "flockr";      // registry key, BRIARD_MUX value
  displayName: string;          // "Herdr" | "Flockr"
  binary: string;               // "herdr" | "flockr"
  configDirName: string;        // "herdr" | "flockr"
  socketFile: string;           // "herdr.sock" | "flockr.sock"
  envPrefix: string;            // "HERDR_" | "FLOCKR_"
  pluginManifest: string;       // "herdr-plugin.toml" | "flockr-plugin.toml"
  logoSvg: string;
  minWindowsVersion?: string;   // Herdr only
}
```

Everything Herdr-specific reads from the profile: socket default and session discovery
(`sessions.ts`, `bridge/config.ts`), pane markers (`markers.ts`, `cli/beacon.ts`), machine list,
`--version` and `integration status` in doctor (`cli/history.ts`), plugin `config-dir`/`link`
(`cli/context.ts`, `cli/update.ts`), ACL paths (`bridge/acl-policy.ts`), worktree config
(`bridge/worktree-folder.ts`), hook file names, plugin env vars, logo, UI labels.

Endpoint var: `BRIARD_MUX_ENDPOINT_FLOCKR` (falls out of `muxEndpointVar`). Also honour
`FLOCKR_SOCKET_PATH`, the same way Herdr honours `HERDR_SOCKET_PATH`.

Host detection (`hostCandidates`): both adapters detect independently, so a machine with both
installed (like this one) gets asked which one to use.

Plugin route: add `flockr-plugin.toml` (id `flockr.briard`, `min_flockr_version = "1.0.0"`), same
actions as `herdr-plugin.toml`. Keep both manifests' versions in the version-agreement check.

Tests: run the Herdr adapter's tests against both profiles (parametrise, don't duplicate). Add a
Flockr capture from this machine (`flockr api snapshot`) as a fixture. Add `MUX_CONTRACT.md` rows
for Flockr, and a `FLOCKR_API.md` that lists only the differences from `HERDR_API.md`.

Live check: `BRIARD_MUX=flockr` bridge against the real Flockr socket in an isolated named session
(`flockr --session briard-probe`). The dashboard lists panes, a read returns text, send_text reaches
a shell pane. Repeat once with `BRIARD_MUX=herdr` against an isolated Herdr session.

## Phase 3: Packaging, docs, CI

- README: Briard intro, "a fork of ColliePWA" line, Flockr as a supported multiplexer, install
  from `mcsmith3/briard`.
- `docs/`: rename product, add Flockr to the multiplexer, install and plugin pages.
- `install.sh` / `install.ps1`, release workflow, AUR/Nix packaging point at `mcsmith3/briard`.
- CI workflows run under the new names; remove upstream-only jobs (triage labels, site sync).
- `briard skill` / `briard docs` output mentions Flockr.

## Out of scope for now

Creating the GitHub repo, pushing, tagging a release, a website, app-store anything.

## Open questions for the owner

- Version: start at `0.1.0` (default in this plan) or keep Collie's `1.24.0` line?
- The logo: placeholder from Phase 1, or does the owner have artwork?
