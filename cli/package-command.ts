// NAMING THE MANAGER, never deciding the kind. Every path prefix Briard recognises lives here and
// nowhere else — `install-kind.ts` spells none of them, because a prefix is not evidence (M17
// principle 3). `classifyInstall` has already said `packaged` by the time anything here runs; these
// functions only choose which words to print.

/**
 * The command that takes the new version, when the resolved root names a manager we know — else null.
 *
 * THE PREFIX IS NOT EVIDENCE. By the time this runs the kind is already decided, structurally, by
 * {@link classifyInstall}; this only chooses which words to print. A prefix nobody recognises costs
 * the operator a command, never a wrong kind (M17 principle 3), which is why an unknown prefix is
 * `null` and the caller falls back to `PACKAGED_SENTENCE` (`cli/install-kind.ts`) alone.
 *
 * The roots are the ones our own packages install to (M17 spec 05) plus Homebrew's two prefixes.
 */
export function packageCommand(root: string): string | null {
  const under = (prefix: string): boolean => root === prefix || root.startsWith(`${prefix}/`);
  // Two Arch roots, one package. `/opt/briard` is where `briard-bin` installs since the PKGBUILD
  // took the layout Omarchy's package repository expects; `/usr/lib/briard` is where every copy
  // installed before that, and it stays here for as long as one of those hosts is still running.
  if (under("/opt/briard") || under("/usr/lib/briard")) return "sudo pacman -Syu briard-bin";
  if (under("/nix/store")) return "nix profile upgrade briard";
  if (under("/opt/homebrew") || under("/usr/local/Cellar")) return "brew upgrade briard";
  return null;
}
