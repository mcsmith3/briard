import { basePath, mounted, resetBasePathForTests } from "./base-path";

// ADR 0052: the mount is read from the document the bridge served, not from a build constant.
function setMount(content: string | null) {
  document.querySelector('meta[name="briard-base"]')?.remove();
  if (content !== null) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "briard-base");
    meta.setAttribute("content", content);
    document.head.appendChild(meta);
  }
  resetBasePathForTests();
}

afterEach(() => setMount(null));

describe("basePath — where this document is mounted", () => {
  it("is the root with no meta tag, as the dev server and every test serve it", () => {
    setMount(null);
    expect(basePath()).toBe("/");
    expect(mounted("/api/snapshot")).toBe("/api/snapshot");
  });

  it("is the root when the bridge wrote a root", () => {
    setMount("/");
    expect(basePath()).toBe("/");
  });

  it("reads the mount the bridge wrote, and puts it in front of a root-absolute path", () => {
    setMount("/briard/");
    expect(basePath()).toBe("/briard/");
    expect(mounted("/api/snapshot")).toBe("/briard/api/snapshot");
    expect(mounted("/sw.js")).toBe("/briard/sw.js");
    expect(mounted("/")).toBe("/briard/");
  });

  it("normalises a tag written without its slashes to the shape the bridge produces", () => {
    setMount("briard");
    expect(basePath()).toBe("/briard/");
  });

  it("leaves a full URL and a relative path alone", () => {
    setMount("/briard/");
    expect(mounted("https://example.com/x")).toBe("https://example.com/x");
    expect(mounted("sw.js")).toBe("sw.js");
    expect(mounted("")).toBe("");
  });

  it("is read once: a tag that changes after the first read is not seen", () => {
    setMount("/a/");
    expect(basePath()).toBe("/a/");
    document.querySelector('meta[name="briard-base"]')?.setAttribute("content", "/b/");
    expect(basePath()).toBe("/a/");
  });
});
