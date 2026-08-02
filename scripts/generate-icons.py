#!/usr/bin/env python3
"""Regenerate AppClimb favicon + app icons from the mountain brand mark.

Run: python3 scripts/generate-icons.py

Writes:
  public/icon.svg, public/favicon.ico, public/apple-touch-icon.png,
  public/icon-192.png, public/icon-512.png
  public/icons/v2/* (versioned cache-bust copies)
  src/app/favicon.ico (Next.js app icon convention)
"""

from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
V2 = PUBLIC / "icons" / "v2"
APP_FAVICON = ROOT / "src" / "app" / "favicon.ico"

BG = (248, 251, 250, 255)
TEAL_LIGHT = (25, 168, 156, 255)
TEAL_DARK = (8, 120, 125, 255)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="AppClimb">
  <rect width="64" height="64" rx="14" fill="#f8fbfa"/>
  <path d="M6 52 24 14l16 38Z" fill="#19a89c"/>
  <path d="M22 52 42 12l16 40Z" fill="#08787d"/>
</svg>
"""


def draw_logo(size: int, pad_ratio: float = 0.12) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = max(2, int(size * 0.22))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG)
    pad = size * pad_ratio
    box = size - 2 * pad

    def sx(x: float) -> float:
        return pad + (x / 64.0) * box

    def sy(y: float) -> float:
        return pad + (y / 64.0) * box

    def poly(pts: list[tuple[float, float]], fill: tuple[int, int, int, int]) -> None:
        draw.polygon([(sx(x), sy(y)) for x, y in pts], fill=fill)

    # Clean dual-peak mountain (matches BrandMark silhouette).
    poly([(6, 52), (24, 14), (40, 52)], TEAL_LIGHT)
    poly([(22, 52), (42, 12), (58, 52)], TEAL_DARK)
    return img


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_ico(path: Path, images: list[Image.Image]) -> None:
    pngs = [png_bytes(im.convert("RGBA")) for im in images]
    count = len(images)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries: list[bytes] = []
    data = b""
    for im, png in zip(images, pngs):
        w = 0 if im.width >= 256 else im.width
        h = 0 if im.height >= 256 else im.height
        entries.append(struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png), offset))
        data += png
        offset += len(png)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + b"".join(entries) + data)


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


def main() -> None:
    V2.mkdir(parents=True, exist_ok=True)
    imgs = {
        16: draw_logo(16, 0.08),
        32: draw_logo(32, 0.10),
        48: draw_logo(48, 0.11),
        64: draw_logo(64, 0.12),
        180: draw_logo(180, 0.13),
        192: draw_logo(192, 0.13),
        512: draw_logo(512, 0.13),
        1024: draw_logo(1024, 0.12),
    }

    for size, name in (
        (180, "apple-touch-icon.png"),
        (192, "icon-192.png"),
        (512, "icon-512.png"),
    ):
        save_png(imgs[size], PUBLIC / name)
        save_png(imgs[size], V2 / name)

    save_png(imgs[48], V2 / "icon-48.png")
    save_png(imgs[64], V2 / "icon-64.png")
    save_png(imgs[1024], V2 / "icon-1024.png")

    (PUBLIC / "icon.svg").write_text(SVG, encoding="utf-8")
    (V2 / "icon.svg").write_text(SVG, encoding="utf-8")

    ico_frames = [imgs[16], imgs[32], imgs[48], imgs[64]]
    for path in (APP_FAVICON, PUBLIC / "favicon.ico", V2 / "favicon.ico"):
        write_ico(path, ico_frames)
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} B)")

    print("icon set regenerated")


if __name__ == "__main__":
    main()
