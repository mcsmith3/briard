import { describe, expect, test } from "bun:test";
import { hostFor } from "../../host.ts";
import { herdrConfigPath, herdrWorktreeDir } from "../../worktree-folder.ts";
import { HERDR_FAMILY_PROFILES, familyDefaultSocket, familyProfileFromEnv, familySocket, herdrFamilyProfileFor } from "./profile.ts";

describe.each([...HERDR_FAMILY_PROFILES])("$displayName host conventions", (profile) => {
  test("uses its own Unix root and Windows Roaming root", () => {
    expect(familyDefaultSocket(profile, hostFor("linux"), {}, "/home/probe")).toBe(`/home/probe/.config/${profile.configDirName}/${profile.socketFile}`);
    expect(familyDefaultSocket(profile, hostFor("win32"), { APPDATA: "C:\\Roaming" }, "C:\\Users\\probe")).toBe(`C:\\Roaming\\${profile.configDirName}\\${profile.socketFile}`);
  });
  test("endpoint overrides native socket; plugin ownership selects the profile", () => {
    expect(familySocket(profile, { [`${profile.envPrefix}SOCKET_PATH`]: "/native.sock", [`BRIARD_MUX_ENDPOINT_${profile.mux.toUpperCase()}`]: "/explicit.sock" })).toBe("/explicit.sock");
    expect(familyProfileFromEnv({ [`${profile.envPrefix}PLUGIN_CONFIG_DIR`]: "/cfg" })).toBe(profile);
    expect(familyProfileFromEnv({ BRIARD_MUX: "tmux", [`${profile.envPrefix}PLUGIN_CONFIG_DIR`]: "/cfg" })).toBeNull();
  });
  test("reads its config and chooses its own default worktree folder", () => {
    expect(herdrConfigPath({}, "/home/probe", profile)).toBe(`/home/probe/.config/${profile.configDirName}/config.toml`);
    expect(herdrConfigPath({ [`${profile.envPrefix}CONFIG_PATH`]: "/custom.toml" }, "/home/probe", profile)).toBe("/custom.toml");
    expect(herdrWorktreeDir(null, "/home/probe", profile)).toBe(`/home/probe/${profile.worktreeFolder}/worktrees`);
  });
});

test("non-family multiplexers have no family profile", () => {
  expect(herdrFamilyProfileFor("tmux")).toBeNull();
});
