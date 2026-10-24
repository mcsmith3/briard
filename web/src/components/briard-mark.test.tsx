import { render, screen } from "@testing-library/react";
import { briardMark, markIsLoading, markPaper } from "@/test/brand-mark";
import { BriardMark } from "./briard-mark";

describe("BriardMark", () => {
  it("is decorative unless given an accessible title", () => {
    const { rerender } = render(<BriardMark />);
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<BriardMark title="Briard" />);
    expect(screen.getByRole("img", { name: "Briard" })).toBeInTheDocument();
  });

  it("keeps the size, class, loading and paper contract for its callers", () => {
    const { container, rerender } = render(<BriardMark size={40} className="opacity-40" paper="var(--muted)" />);
    const mark = briardMark(container);
    expect(mark).toHaveAttribute("width", "40");
    expect(mark).toHaveAttribute("height", "40");
    expect(mark).toHaveClass("opacity-40");
    expect(markPaper(container)).toBe("var(--muted)");
    expect(markIsLoading(container)).toBe(false);
    rerender(<BriardMark loading weight="header" />);
    expect(briardMark(container)).toBe(mark);
    expect(markIsLoading(container)).toBe(true);
  });
});
