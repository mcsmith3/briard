import { describe, expect, test } from "bun:test";

import { hostFor } from "../bridge/host.ts";
import { fakeFiles, posixKey } from "./fakes.ts";

describe("posixKey", () => {
  test("folds a Windows path to the POSIX key a fake filesystem stores", () => {
    expect(posixKey("C:\\opt\\briard\\bin\\briard.exe", hostFor("win32"))).toBe("/opt/briard/bin/briard.exe");
    expect(posixKey("\\opt\\briard", hostFor("win32"))).toBe("/opt/briard");
  });

  test("without a host it folds, so a Windows host pinned on Linux still finds its files", () => {
    expect(posixKey("C:\\opt\\briard")).toBe("/opt/briard");
    expect(posixKey("/opt/briard")).toBe("/opt/briard");
  });

  test("leaves a path alone off Windows, where a backslash is a legal name character", () => {
    expect(posixKey("/opt/co\\llie", hostFor("linux"))).toBe("/opt/co\\llie");
  });
});

describe("fakeFiles", () => {
  test("answers a path seeded by its POSIX key", () => {
    const files = fakeFiles({ "/opt/briard/VERSION": "1.0.0\n" });
    expect(files.read("/opt/briard/VERSION")).toBe("1.0.0\n");
    expect(files.exists("/opt/briard")).toBe(true);
  });
});
