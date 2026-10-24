# 0021 — The name on PATH is a pointer, never a copy

Status: **Accepted** (2026-08-19)

Related: [ADR 0006](./0006-update-advances-the-checkout-herdr-installed.md) — extended, not superseded.
That ADR settled that **the checkout is the plugin**: `update` advances it in place, and everything
Briard is comes from it. This one says what a name outside the checkout may be, given that.

## Context

`briard` is reachable today only as `bin/briard` inside the checkout, or as a Herdr action. Both
require knowing where the checkout is. That was fine while every verb was about the service running
beside it.

It stops being fine for the direction 1.0 is headed. The standalone-multiplexer work
([discussion #67](https://github.com/mcsmith3/briard/discussions/67)) puts mux drivers — zellij, tmux —
behind the same surface Herdr sits behind today, and a multiplexer front-end that can only be invoked
from one directory is not a tool the operator has; it is a script they remember the path to. `briard`
needs to be a word you can type. The operator asked for it as part of 1.0.

The question an ADR is for is not *whether* — it is **what lands in `~/.local/bin`**, because that
answer decides whether a second artifact lifecycle now exists.

## Decision

**`briard link` publishes a SYMLINK at `~/.local/bin/briard` pointing at `<checkout>/bin/briard`, and
the checkout stays the single source of truth.**

`build` compiles to `bin/briard.new` and **renames it into place** (`cli/build.ts`). A rename gives
the path a new inode under a name that does not move, so a symlink to it resolves to the new binary
the instant the build lands. That is the whole mechanism: the pointer is never refreshed, because it
was never stale. There is no second artifact, nothing to drift, and no self-update path to secure.

**`unlink` removes the name only when it points at this checkout's binary.** This is
[ADR 0001](./0001-one-managed-front-door.md)'s rule — tear down only what matches your own record —
applied to a name instead of a front door. Here the record is the destination's *shape*: a symlink to
some checkout's `bin/briard` is a name Briard published, so `link` may replace it and says what it
pointed at before; anything else is refused untouched, and `unlink` refuses even a Briard link that
belongs to another instance.

**Linking is never a side effect.** No build, update or install path publishes the name. Putting a
word into the operator's PATH is the operator's act, and a `link` that happened during a `build`
would be a tool deciding on its own to occupy a name in a directory it does not own. For the same
reason `link` never edits a shell profile: when `~/.local/bin` is not on PATH it prints the fact and
stops.

## Consequences

- **Side-by-side instances share one name.** The link points at exactly one checkout, so a host
  running a stable Briard and a `BRIARD_INSTANCE=v1` one beside it has one bare `briard`. `link` from
  the other replaces it and names what it displaced; `doctor`'s `path-link` line says which checkout
  a bare `briard` currently reaches. Suffixing the published name per instance was rejected: the
  point of the verb is a word you can type, and `briard-v1` is the path problem again with fewer
  characters.
- **A moved or deleted checkout leaves a dangling link.** `doctor` reports it and `unlink` clears it;
  nothing self-heals, because self-healing here means guessing which checkout the operator meant.
- **`link` needs a built checkout.** It refuses otherwise rather than publishing a name for a binary
  that does not exist yet.

### Alternatives considered

- **Copy the binary into `~/.local/bin`.** It drifts the moment `update` rebuilds — and the fix for
  that drift is a second updater, watching the checkout and re-copying, which is exactly the artifact
  lifecycle this decision exists to avoid. Copying also doubles ~95 MB per instance.
- **A wrapper script that `exec`s the checkout's binary.** A second place implementing dispatch —
  precisely what ADR 0006 forbids `scripts/briard-ctl.sh` to become. Every verb is implemented once,
  in `cli/`, and a wrapper is a standing invitation to teach it something.
- **Auto-link during `build` or `update`.** Publishing into the operator's PATH as a build side
  effect. It would also mean an `update` on a second instance silently stealing the name from the
  first.

### What would justify revisiting

- **Briard ships as something other than a checkout** — a real package, a single downloaded binary.
  Then `bin/briard` is not a stable path to point at, and where the binary lives becomes the packager's
  question rather than this one.
- **Per-instance names turn out to be what operators actually run.** Evidence, not anticipation: the
  consequence above is the thing to watch.
