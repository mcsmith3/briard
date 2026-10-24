import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetOperatorBusy, beginBusy } from "@/lib/busy";
import { clearStatus } from "@/lib/status";
import { markIsLoading } from "@/test/brand-mark";
import { savedAtLabel } from "@/lib/format";
import { BriardHome } from "./briard-home";

describe("BriardHome — pending work", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearStatus();
    __resetOperatorBusy();
  });
  afterEach(() => {
    act(() => clearStatus());
    act(() => __resetOperatorBusy());
    vi.useRealTimers();
  });

  it("passes loading while work is in flight and clears it when released", () => {
    const { container } = render(<BriardHome trouble={false} />);
    expect(markIsLoading(container)).toBe(false);

    let release!: () => void;
    act(() => {
      release = beginBusy();
    });
    expect(markIsLoading(container)).toBe(true);

    // Work remains pending until its owner releases it.
    act(() => void vi.advanceTimersByTime(5000));
    expect(markIsLoading(container)).toBe(true);

    act(() => release());
    expect(markIsLoading(container)).toBe(false);
  });

  // A lost connection outranks pending work.
  it("does not report pending work while the connection is lost", () => {
    const { container } = render(<BriardHome trouble lost />);
    act(() => void beginBusy());
    expect(markIsLoading(container)).toBe(false);
  });
});


describe("BriardHome — the lost badge", () => {
  const badge = (root: ParentNode) => root.querySelector<SVGElement>('[data-slot="briard-lost-badge"]');

  it("is absent while the connection is not lost, even in trouble", () => {
    expect(badge(render(<BriardHome trouble={false} />).container)).toBeNull();
    expect(badge(render(<BriardHome trouble online={false} />).container)).toBeNull();
  });

  it("wears CloudOff when lost and the phone reports online", () => {
    const { container } = render(<BriardHome trouble lost online />);
    expect(badge(container)?.getAttribute("data-icon")).toBe("cloud-off");
    expect(badge(container)?.getAttribute("class")).toMatch(/lucide-cloud-off/);
  });

  it("wears CloudOff by default, since online is the unremarkable case", () => {
    const { container } = render(<BriardHome trouble lost />);
    expect(badge(container)?.getAttribute("data-icon")).toBe("cloud-off");
  });

  it("wears WifiOff when lost and the phone reports offline", () => {
    const { container } = render(<BriardHome trouble lost online={false} />);
    expect(badge(container)?.getAttribute("data-icon")).toBe("wifi-off");
    expect(badge(container)?.getAttribute("class")).toMatch(/lucide-wifi-off/);
  });

  it("is decorative: hidden from assistive tech, the button's label names the state", () => {
    const { container, getByRole } = render(<BriardHome trouble lost online={false} />);
    expect(badge(container)?.getAttribute("aria-hidden")).toBe("true");
    expect(getByRole("button", { name: "Briard home, not connected" })).toBeInTheDocument();
  });

  // What remains of the strip's "Showing what was saved at <time>" once it is dismissed: the badge
  // for the eye, and the time in the button's name for a screen reader. Only while lost, and only
  // when a stamp is known; without one the plain lost name stays.
  it("speaks the saved time in the button's name while lost and a stamp is known", () => {
    const at = new Date(2026, 9, 7, 12, 21).getTime();
    const { getByRole } = render(<BriardHome trouble lost lastSeenAt={at} />);
    expect(
      getByRole("button", { name: `Briard home, not connected. Showing what was saved at ${savedAtLabel(at)}.` }),
    ).toBeInTheDocument();
  });

  it("keeps the reconnecting name while merely troubled, stamp or not", () => {
    const { getByRole } = render(<BriardHome trouble lastSeenAt={1_000} />);
    expect(getByRole("button", { name: "Briard home, reconnecting" })).toBeInTheDocument();
  });

  it("sits on the header's band colour (the page colour in Briard) with the ring cut, in the danger token", () => {
    const { container } = render(<BriardHome trouble lost />);
    const cls = badge(container)?.getAttribute("class") ?? "";
    expect(cls).toMatch(/bg-band-ground/);
    expect(cls).toMatch(/ring-band-ground/);
    expect(cls).toMatch(/text-status-blocked/);
  });
});
