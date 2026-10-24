/** Find the product mark among the other SVG icons on a screen. */
export function briardMark(root: ParentNode): SVGSVGElement | null {
  return root.querySelector<SVGSVGElement>('svg[data-slot="briard-drawing"]');
}

/** The loading prop stays available to the final artwork. */
export function markIsLoading(root: ParentNode): boolean {
  return briardMark(root)?.getAttribute("data-loading") === "true";
}

export function markPaper(root: ParentNode): string {
  return briardMark(root)?.querySelector('[data-part="halo"]')?.getAttribute("stroke") ?? "";
}
