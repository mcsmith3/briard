import { homedir } from "node:os";
import { HOST, type Host } from "../../host.ts";
import { HERDR_LOGO_SVG } from "./logo.ts";
import { FLOCKR_LOGO_SVG } from "../flockr/logo.ts";

/** Names and host conventions of the two implementations of socket protocol 22. */
export interface HerdrFamilyProfile {
  readonly mux: string;
  readonly displayName: string;
  readonly binary: string;
  readonly configDirName: string;
  readonly socketFile: string;
  readonly envPrefix: string;
  readonly pluginManifest: string;
  readonly pluginId: string;
  readonly worktreeFolder: string;
  readonly hookShell: string;
  readonly hookTypeScript: string;
  readonly hookOmp: string;
  readonly logoSvg: string;
  readonly minWindowsVersion?: string;
}

export const HERDR_PROFILE: HerdrFamilyProfile = {
  mux: "herdr",
  displayName: "Herdr", binary: "herdr", configDirName: "herdr",
  socketFile: "herdr.sock", envPrefix: "HERDR_", pluginManifest: "herdr-plugin.toml",
  pluginId: "herdr.briard", worktreeFolder: ".herdr",
  hookShell: "herdr-agent-state.sh", hookTypeScript: "herdr-agent-state.ts", hookOmp: "herdr-omp-agent-state.ts",
  logoSvg: HERDR_LOGO_SVG, minWindowsVersion: "0.9.3",
};

export const FLOCKR_PROFILE: HerdrFamilyProfile = {
  mux: "flockr",
  displayName: "Flockr", binary: "flockr", configDirName: "flockr",
  socketFile: "flockr.sock", envPrefix: "FLOCKR_", pluginManifest: "flockr-plugin.toml",
  pluginId: "flockr.briard", worktreeFolder: ".flockr",
  hookShell: "flockr-agent-state.sh", hookTypeScript: "flockr-agent-state.ts", hookOmp: "flockr-omp-agent-state.ts",
  logoSvg: FLOCKR_LOGO_SVG,
};

export const HERDR_FAMILY_PROFILES: readonly HerdrFamilyProfile[] = [HERDR_PROFILE, FLOCKR_PROFILE];

export function herdrFamilyProfileFor(mux: string | undefined): HerdrFamilyProfile | null {
  return HERDR_FAMILY_PROFILES.find((profile) => profile.mux === mux) ?? null;
}

/** Explicit selection wins; a plugin action identifies its owner even before config is loaded. */
export function familyProfileFromEnv(env: Readonly<Record<string, string | undefined>>): HerdrFamilyProfile | null {
  const selected = env.BRIARD_MUX?.trim();
  if (selected) return herdrFamilyProfileFor(selected);
  return HERDR_FAMILY_PROFILES.find((profile) => env[`${profile.envPrefix}PLUGIN_CONFIG_DIR`]?.trim() || env[`${profile.envPrefix}PLUGIN_ROOT`]?.trim()) ?? HERDR_PROFILE;
}

/**
 * The family member the environment names outright, or null when nothing does. Unlike
 * {@link familyProfileFromEnv} this never falls back to Herdr, so a caller can tell "the operator
 * chose Herdr" from "nobody said".
 */
export function explicitFamilyProfile(env: Readonly<Record<string, string | undefined>>): HerdrFamilyProfile | null {
  const selected = env.BRIARD_MUX?.trim();
  if (selected) return herdrFamilyProfileFor(selected);
  return HERDR_FAMILY_PROFILES.find((profile) => env[`${profile.envPrefix}PLUGIN_CONFIG_DIR`]?.trim() || env[`${profile.envPrefix}PLUGIN_ROOT`]?.trim()) ?? null;
}

/**
 * Every family member, the one this shell runs inside first. Each tool exports `<PREFIX>ENV=1` and its
 * socket path into the panes it runs, so a `briard` typed in a Flockr pane looks at Flockr's plugin
 * dir before Herdr's. Order only: a later member is still searched.
 */
export function familyProfilesByAmbient(env: Readonly<Record<string, string | undefined>>): readonly HerdrFamilyProfile[] {
  const inside = (profile: HerdrFamilyProfile): boolean =>
    env[`${profile.envPrefix}ENV`]?.trim() === "1" || Boolean(env[`${profile.envPrefix}SOCKET_PATH`]?.trim());
  return [...HERDR_FAMILY_PROFILES.filter(inside), ...HERDR_FAMILY_PROFILES.filter((profile) => !inside(profile))];
}

/** Windows uses Roaming; Unix preserves the existing ~/.config socket convention. */
export function familyDefaultSocket(profile: HerdrFamilyProfile, host: Host = HOST, env: Readonly<Record<string, string | undefined>> = process.env, home = homedir()): string {
  const base = host.platform === "win32" ? env.APPDATA ?? host.path.join(home, "AppData", "Roaming") : host.path.join(home, ".config");
  return host.path.join(base, profile.configDirName, profile.socketFile);
}

export function familySocket(profile: HerdrFamilyProfile, env: Readonly<Record<string, string | undefined>>, home = homedir(), host: Host = HOST): string {
  return env[`BRIARD_MUX_ENDPOINT_${profile.mux.toUpperCase()}`]?.trim() || env[`${profile.envPrefix}SOCKET_PATH`]?.trim() || familyDefaultSocket(profile, host, env, home);
}
