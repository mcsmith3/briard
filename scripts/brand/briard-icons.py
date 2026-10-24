"""Generate every Briard icon from one drawing.

Usage, from the repo root: python3 -I scripts/brand/briard-icons.py

Writes the favicons, app icons, badge and splash marks into web/public/ and the README card into
assets/. Needs rsvg-convert and ImageMagick (magick). The same shapes are drawn by
web/src/components/briard-mark.tsx; change both together.
"""
import subprocess
from pathlib import Path

import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public"
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

# The drawing lives on a 512 grid; the head spans roughly x 88..424, y 58..468.
SILHOUETTE = """M256 58 L276 70 L298 62 L312 80 L336 78 L344 100 L368 106 L370 130
C392 150 404 190 410 236 C416 290 418 350 424 404 L410 396 L414 432 L398 414 L396 450
L382 424 L372 456 L362 422 L350 446 L346 400 C334 360 328 320 322 300 L190 300
C184 320 178 360 166 400 L162 446 L150 422 L140 456 L130 424 L116 450 L114 414 L98 432
L102 396 L88 404 C94 350 96 290 102 236 C108 190 120 150 142 130 L144 106 L168 100
L176 78 L200 80 L214 62 L236 70 Z"""
CROWN = """M256 78 C204 80 166 110 154 158 C148 186 150 206 156 226 L150 250 L166 236 L170 224
L342 224 L346 236 L362 250 L356 226 C362 206 364 186 358 158 C346 110 308 80 256 78 Z"""
EAR_STRANDS = [
    "M128 200 C122 260 120 330 126 400", "M146 230 C140 290 140 350 146 420",
    "M384 200 C390 260 392 330 386 400", "M366 230 C372 290 372 350 366 420",
    "M110 260 C106 310 106 350 108 390", "M402 260 C406 310 406 350 404 390",
]
BEARD = """M186 236 C176 290 180 350 196 398 L206 384 L210 424 L224 398 L230 446 L244 410
L256 468 L268 410 L282 446 L288 398 L302 424 L306 384 L316 398 C332 350 336 290 326 236 Z"""
MUZZLE = """M256 252 C226 256 206 276 202 306 L216 298 L214 326 L230 308 L236 336 L248 312
L256 340 L264 312 L276 336 L282 308 L298 326 L296 298 L310 306 C306 276 286 256 256 252 Z"""
FRINGE = """M256 92 C216 94 182 118 168 160 C160 186 160 210 164 232 L174 214 L176 248 L190 222
L194 254 L206 226 L214 250 L222 224 L232 246 L240 214 L250 228 L256 182 L262 228 L272 214
L280 246 L290 224 L298 250 L306 226 L318 254 L322 222 L336 248 L338 214 L348 232
C352 210 352 186 344 160 C330 118 296 94 256 92 Z"""
FRINGE_STRANDS = [
    "M250 104 C232 130 214 170 204 214", "M236 108 C212 132 192 168 184 212",
    "M262 104 C280 130 298 170 308 214", "M276 108 C300 132 320 168 328 212",
    "M218 118 C196 140 180 170 174 200", "M294 118 C316 140 332 170 338 200",
]
PART = "M256 94 C251 130 251 160 256 184 C261 160 261 130 256 94 Z"
NOSE = "M230 272 C228 256 284 256 282 272 C280 290 266 300 256 300 C246 300 232 290 230 272 Z"
BEARD_STRANDS = [
    "M232 340 C228 370 230 400 236 430", "M256 344 C254 380 254 410 256 450",
    "M280 340 C284 370 282 400 276 430",
]


def strands(paths, colour, width):
    body = "".join(f'<path d="{d}"/>' for d in paths)
    return (f'<g fill="none" stroke="{colour}" stroke-width="{width}" '
            f'stroke-linecap="round">{body}</g>')


def colour_head(detail=True):
    """The full-colour dog, no background."""
    parts = [
        f'<path fill="#7d5130" d="{SILHOUETTE}"/>',
        f'<path fill="#b07a45" d="{CROWN}"/>',
    ]
    if detail:
        parts.append(strands(EAR_STRANDS, "#5c3a21", 5))
    parts += [
        f'<path fill="#33231a" d="{BEARD}"/>',
        f'<path fill="#8e5f36" d="{MUZZLE}"/>',
        '<ellipse cx="212" cy="240" rx="14" ry="10" fill="#0f0a07"/>',
        '<ellipse cx="300" cy="240" rx="14" ry="10" fill="#0f0a07"/>',
        '<circle cx="216" cy="237" r="3.5" fill="#f2e6d6"/>',
        '<circle cx="304" cy="237" r="3.5" fill="#f2e6d6"/>',
        f'<path fill="#c38c54" d="{FRINGE}"/>',
    ]
    if detail:
        parts.append(strands(FRINGE_STRANDS, "#9b6a3c", 4))
    parts += [
        f'<path fill="#7d5130" d="{PART}"/>',
        f'<path fill="#0a0705" d="{NOSE}"/>',
        '<ellipse cx="246" cy="267" rx="7" ry="3.5" fill="#4d4239"/>',
    ]
    if detail:
        parts.append(strands(BEARD_STRANDS, "#1f150f", 4))
    return "".join(parts)


_MASK_N = [0]


def mono_head(paint, ink=None, detail=True):
    """One paint colour; the features are cut out of it with a mask, so they show whatever the
    head sits on. `ink` is accepted for symmetry and unused."""
    del ink
    _MASK_N[0] += 1
    mid = f"bm{_MASK_N[0]}"
    w = 7 if detail else 10
    cut = 'fill="none" stroke="#000" stroke-linejoin="round" stroke-linecap="round"'
    inner = [
        f'<path fill="#fff" d="{SILHOUETTE}"/>',
        f'<path fill="#fff" d="{BEARD}"/>',
        # The beard's edge, the fringe's lower edge and the ear gaps are cut so the face reads.
        f'<path {cut} stroke-width="{w}" d="{BEARD}"/>',
        f'<path {cut} stroke-width="{w}" d="{FRINGE}"/>',
        f'<path {cut} stroke-width="{w}" d="M170 226 C150 300 160 380 166 400 M342 226 C362 300 352 380 346 400"/>',
        f'<path fill="#000" d="{PART}"/>',
        '<ellipse cx="212" cy="246" rx="13" ry="7" fill="#000"/>',
        '<ellipse cx="300" cy="246" rx="13" ry="7" fill="#000"/>',
        f'<path fill="#000" d="{NOSE}"/>',
    ]
    if detail:
        inner.append(strands(BEARD_STRANDS, "#000", 5))
    return (f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">'
            f'{"".join(inner)}</mask>'
            f'<rect width="512" height="512" fill="{paint}" mask="url(#{mid})"/>')


def svg(body, view="0 0 512 512", bg=None, label="Briard"):
    rect = f'<rect width="512" height="512" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" '
            f'aria-label="{label}">{rect}{body}</svg>\n')


def padded(body, scale):
    """Shrink the head about the centre, for maskable safe zones."""
    off = 256 * (1 - scale)
    return f'<g transform="translate({off:.2f} {off:.2f}) scale({scale})">{body}</g>'


BG = "#17130f"
DEV = "#f97316"
PLAY = "#ef4444"

files = {
    # Release channel: full colour on the dark tile.
    "favicon.svg": svg(padded(colour_head(False), 0.96), bg=BG),
    # Dev and playground channels: one paint colour on the dark tile, as Collie did.
    "favicon-dev.svg": svg(padded(mono_head(DEV, BG, False), 0.96), bg=BG),
    "favicon-playground.svg": svg(padded(mono_head(PLAY, BG, False), 0.96), bg=BG),
    # The bare mark, no background, for the README and anywhere else.
    "briard-mark-header-dark.svg": svg(colour_head(False), view="84 54 344 418"),
    "briard-mark-header-light.svg": svg(colour_head(False), view="84 54 344 418"),
}
for name, text in files.items():
    (OUT / name).write_text(text)

work = Path(tempfile.mkdtemp(prefix="briard-icons-"))
sources = {
    "tile": svg(padded(colour_head(), 0.80), bg=BG),          # maskable/app icons: 80% safe zone
    "tile-dev": svg(padded(mono_head(DEV, BG), 0.80), bg=BG),
    "touch": svg(padded(colour_head(), 0.88), bg=BG),
    "touch-dev": svg(padded(mono_head(DEV, BG), 0.88), bg=BG),
    "badge": svg(padded(mono_head("#ffffff", "transparent", False), 0.92)),  # alpha only
    "notify": svg(padded(colour_head(), 0.86), bg=BG),
}
for name, text in sources.items():
    (work / f"{name}.svg").write_text(text)


def png(src, size, name):
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size),
                    str(work / f"{src}.svg"), "-o", str(OUT / name)], check=True)


png("tile", 192, "web-app-manifest-192x192.png")
png("tile", 512, "web-app-manifest-512x512.png")
png("tile-dev", 192, "web-app-manifest-dev-192x192.png")
png("tile-dev", 512, "web-app-manifest-dev-512x512.png")
png("touch", 180, "apple-touch-icon.png")
png("touch-dev", 180, "apple-touch-icon-dev.png")
png("badge", 96, "badge-96x96.png")
png("notify", 192, "notification-icon-192x192.png")

for chan, src in (("", "favicon.svg"), ("-dev", "favicon-dev.svg"),
                  ("-playground", "favicon-playground.svg")):
    for size in (16, 32, 96):
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), str(OUT / src),
                        "-o", str(work / f"fav{chan}-{size}.png")], check=True)
    (OUT / f"favicon{chan}-96x96.png").write_bytes((work / f"fav{chan}-96.png").read_bytes())
    subprocess.run(["magick", str(work / f"fav{chan}-16.png"), str(work / f"fav{chan}-32.png"),
                    str(OUT / f"favicon{chan}.ico")], check=True)

# Social card for the README (1280x640).
card = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640">'
    f'<rect width="1280" height="640" fill="{BG}"/>'
    f'<g transform="translate(110 70) scale(0.98)">{colour_head()}</g>'
    '<text x="640" y="300" font-family="DejaVu Sans, sans-serif" font-weight="700" '
    'font-size="128" fill="#f2e6d6">Briard</text>'
    '<text x="644" y="368" font-family="DejaVu Sans, sans-serif" font-size="30" '
    'fill="#c38c54">your agent flock, from your phone</text>'
    '</svg>\n'
)
(work / "card.svg").write_text(card)
subprocess.run(["rsvg-convert", "-w", "1280", "-h", "640", str(work / "card.svg"),
                "-o", str(ASSETS / "social-card.png")], check=True)
(ASSETS / "briard-mark.svg").write_text(svg(colour_head(), view="80 50 352 426"))
print("wrote icons to", OUT, "and", ASSETS)
