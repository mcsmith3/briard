// The Briard mark: a front-facing Briard head, shaggy coat, fringe over the eyes.
//
// The same shapes are drawn into the favicons and app icons in `web/public/` by the icon generator
// (`scripts/brand/briard-icons.py`); change them there and regenerate, or the two drift apart.
// The drawing lives on a 512 grid. The `full` weight carries the fur strands; `header` drops them
// and crops tighter, because at 40px a 4-unit strand is a tenth of a pixel.

/** Props shared by the header, splash, idle cover and handoff mark. */
export interface BriardMarkProps {
  /** Rendered width and height, in pixels. */
  size?: number;
  /** While something is fetching, the head tilts (not under reduced motion). */
  loading?: boolean;
  /** Whatever the mark sits on: the colour of the thin halo that separates the coat from it. */
  paper?: string;
  /** An accessible name. Without one the mark is decorative and hidden from assistive tech. */
  title?: string;
  /** Forwarded to the element. */
  className?: string;
  /** `header` below about 80px: no strands, a tighter crop. */
  weight?: "full" | "header";
}

const SILHOUETTE =
  "M256 58 L276 70 L298 62 L312 80 L336 78 L344 100 L368 106 L370 130 C392 150 404 190 410 236 C416 290 418 350 424 404 L410 396 L414 432 L398 414 L396 450 L382 424 L372 456 L362 422 L350 446 L346 400 C334 360 328 320 322 300 L190 300 C184 320 178 360 166 400 L162 446 L150 422 L140 456 L130 424 L116 450 L114 414 L98 432 L102 396 L88 404 C94 350 96 290 102 236 C108 190 120 150 142 130 L144 106 L168 100 L176 78 L200 80 L214 62 L236 70 Z";
const CROWN =
  "M256 78 C204 80 166 110 154 158 C148 186 150 206 156 226 L150 250 L166 236 L170 224 L342 224 L346 236 L362 250 L356 226 C362 206 364 186 358 158 C346 110 308 80 256 78 Z";
const BEARD =
  "M186 236 C176 290 180 350 196 398 L206 384 L210 424 L224 398 L230 446 L244 410 L256 468 L268 410 L282 446 L288 398 L302 424 L306 384 L316 398 C332 350 336 290 326 236 Z";
const MUZZLE =
  "M256 252 C226 256 206 276 202 306 L216 298 L214 326 L230 308 L236 336 L248 312 L256 340 L264 312 L276 336 L282 308 L298 326 L296 298 L310 306 C306 276 286 256 256 252 Z";
const FRINGE =
  "M256 92 C216 94 182 118 168 160 C160 186 160 210 164 232 L174 214 L176 248 L190 222 L194 254 L206 226 L214 250 L222 224 L232 246 L240 214 L250 228 L256 182 L262 228 L272 214 L280 246 L290 224 L298 250 L306 226 L318 254 L322 222 L336 248 L338 214 L348 232 C352 210 352 186 344 160 C330 118 296 94 256 92 Z";
const PART =
  "M256 94 C251 130 251 160 256 184 C261 160 261 130 256 94 Z";
const NOSE =
  "M230 272 C228 256 284 256 282 272 C280 290 266 300 256 300 C246 300 232 290 230 272 Z";
const EAR_STRANDS: readonly string[] = [
  "M128 200 C122 260 120 330 126 400",
  "M146 230 C140 290 140 350 146 420",
  "M384 200 C390 260 392 330 386 400",
  "M366 230 C372 290 372 350 366 420",
  "M110 260 C106 310 106 350 108 390",
  "M402 260 C406 310 406 350 404 390",
];
const FRINGE_STRANDS: readonly string[] = [
  "M250 104 C232 130 214 170 204 214",
  "M236 108 C212 132 192 168 184 212",
  "M262 104 C280 130 298 170 308 214",
  "M276 108 C300 132 320 168 328 212",
  "M218 118 C196 140 180 170 174 200",
  "M294 118 C316 140 332 170 338 200",
];
const BEARD_STRANDS: readonly string[] = [
  "M232 340 C228 370 230 400 236 430",
  "M256 344 C254 380 254 410 256 450",
  "M280 340 C284 370 282 400 276 430",
];

const VIEW = { full: "80 50 352 426", header: "84 54 344 418" } as const;

function Strands({ paths, colour, width }: { paths: readonly string[]; colour: string; width: number }) {
  return (
    <g fill="none" stroke={colour} strokeWidth={width} strokeLinecap="round">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

export function BriardMark({
  size = 32,
  loading = false,
  paper = "var(--background)",
  title,
  className,
  weight = "full",
}: BriardMarkProps) {
  const detail = weight === "full";
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW[weight]}
      data-slot="briard-drawing"
      data-loading={loading}
      className={className}
      role={title === undefined ? "presentation" : "img"}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
      style={{ display: "block", flex: "none" }}
    >
      <g className="briard-mark__head">
        <path data-part="halo" d={SILHOUETTE} fill="none" stroke={paper} strokeWidth={detail ? 10 : 14} strokeLinejoin="round" />
        <path d={BEARD} fill="none" stroke={paper} strokeWidth={detail ? 10 : 14} strokeLinejoin="round" />
        <path d={SILHOUETTE} fill="#7d5130" />
        <path d={CROWN} fill="#b07a45" />
        {detail && <Strands paths={EAR_STRANDS} colour="#5c3a21" width={5} />}
        <path d={BEARD} fill="#33231a" />
        <path d={MUZZLE} fill="#8e5f36" />
        <ellipse cx="212" cy="240" rx="14" ry="10" fill="#0f0a07" />
        <ellipse cx="300" cy="240" rx="14" ry="10" fill="#0f0a07" />
        <circle cx="216" cy="237" r="3.5" fill="#f2e6d6" />
        <circle cx="304" cy="237" r="3.5" fill="#f2e6d6" />
        <path d={FRINGE} fill="#c38c54" />
        {detail && <Strands paths={FRINGE_STRANDS} colour="#9b6a3c" width={4} />}
        <path d={PART} fill="#7d5130" />
        <path d={NOSE} fill="#0a0705" />
        <ellipse cx="246" cy="267" rx="7" ry="3.5" fill="#4d4239" />
        {detail && <Strands paths={BEARD_STRANDS} colour="#1f150f" width={4} />}
      </g>
    </svg>
  );
}
