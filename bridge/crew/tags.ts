import { herdTagFor } from "../sessions.ts";

// The notification slot, extended by the host dimension (CREW_PROTOCOL.md §4, §11).
//
// ── WHY A SEPARATE FILE, AND WHY IT ONLY EVER *ADDS* ─────────────────────────
// `herdTagFor()` is a live contract with notifications currently sitting on somebody's lock screen:
// the primary keeps the bare `briard:herd` deliberately, "so notifications outstanding from before
// this feature don't orphan" (`bridge/sessions.ts`). The crew owes that same discipline one level
// up — a solo user who upgrades and never joins a crew must see literally no change — so this module
// DELEGATES to `herdTagFor()` for anything on this machine and only mints a new shape for a peer.
// `bridge/solo-baseline.test.ts` pins the local strings; `tags.test.ts` pins that this file is a
// pass-through for them.

/**
 * Separates the base tag from the host that owns the slot. `@` and not `:` on purpose — see
 * {@link crewHerdTagFor} for the injectivity argument, which is the whole reason this constant is
 * not a free choice.
 */
export const HOST_TAG_SEP = "@";

/**
 * The herd notification slot for one `(host, session)` pair.
 *
 * - `host === undefined` — this briard's own session. Byte-for-byte `herdTagFor()`, forever: the
 *   lead's own tags must not move when it grows a crew, or every alert outstanding on the operator's
 *   phone at `briard join` time orphans into a slot nothing will ever clear.
 * - a peer — `briard:herd@<host>` for that peer's primary session, `briard:herd@<host>:<name>` for
 *   any other, mirroring the local `:`-suffix rule one level out.
 *
 * **Why the two families can never collide.** A member id is `[a-z0-9][a-z0-9-]{0,62}`
 * (`bridge/crew/identity.ts`), so it contains neither `@` nor `:`. The character immediately after
 * `briard:herd` is therefore the discriminator: `@` ⇒ a peer's slot, `:` ⇒ a local named session,
 * nothing ⇒ the local primary. A session name is a directory name and may contain anything, but it
 * only ever appears AFTER that discriminator — so a local session cleverly named `@laptop` yields
 * `briard:herd:@laptop`, which is not `briard:herd@laptop`. Pure + exported so this argument is a
 * test rather than a comment.
 */
export function crewHerdTagFor(host: string | undefined, isPrimary: boolean, name: string): string {
  const local = herdTagFor(isPrimary, name);
  if (host === undefined) return local;
  // `herdTagFor(true, …)` is the bare base — the peer's host segment replaces the session segment as
  // the first qualifier, and the session name (when there is one) follows it.
  return isPrimary
    ? `${herdTagFor(true, name)}${HOST_TAG_SEP}${host}`
    : `${herdTagFor(true, name)}${HOST_TAG_SEP}${host}:${name}`;
}
