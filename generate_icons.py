"""Generate simple trash-can icons for the extension."""
from PIL import Image, ImageDraw
import os

OUT_DIR = r"C:\Users\matth\Documents\Codex\2026-07-10\preciso-que-voc-me-ajude-a\outputs\instagram-comment-cleaner"


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded square background with vertical gradient (blue)
    pad = max(1, size // 16)
    radius = size // 5
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(23 + (10 - 23) * t)
        g = int(105 + (47 - 105) * t)
        b = int(224 + (160 - 224) * t)
        d.line([(pad, y), (size - pad, y)], fill=(r, g, b, 255))
    # Re-draw the rounded mask by drawing a transparent corner then overlaying
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bgd = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(23 + (10 - 23) * t)
        g = int(105 + (47 - 105) * t)
        b = int(224 + (160 - 224) * t)
        bgd.line([(0, y), (size, y)], fill=(r, g, b, 255))
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)

    # White trash can, centered
    cx = size / 2
    # Lid
    lid_w = size * 0.56
    lid_h = max(2, size * 0.07)
    lid_y = size * 0.30
    d.rounded_rectangle(
        (cx - lid_w / 2, lid_y, cx + lid_w / 2, lid_y + lid_h),
        radius=lid_h / 2,
        fill=(255, 255, 255, 255),
    )
    # Handle on top of lid
    handle_w = size * 0.22
    handle_h = max(2, size * 0.05)
    handle_y = lid_y - handle_h - max(1, size * 0.02)
    d.rounded_rectangle(
        (cx - handle_w / 2, handle_y, cx + handle_w / 2, handle_y + handle_h),
        radius=handle_h / 2,
        fill=(255, 255, 255, 255),
    )
    # Body
    body_top = lid_y + lid_h + max(1, size * 0.02)
    body_bottom = size * 0.82
    body_w_top = size * 0.46
    body_w_bottom = size * 0.56
    body_left = cx - body_w_top / 2
    body_right = cx + body_w_top / 2
    d.polygon(
        [
            (body_left, body_top),
            (body_right, body_top),
            (cx + body_w_bottom / 2, body_bottom),
            (cx - body_w_bottom / 2, body_bottom),
        ],
        fill=(255, 255, 255, 255),
    )
    # Vertical lines on body (3)
    line_w = max(1, size * 0.04)
    gap = size * 0.10
    line_top = body_top + size * 0.08
    line_bottom = body_bottom - size * 0.05
    for dx in (-gap, 0, gap):
        d.rectangle(
            (cx + dx - line_w / 2, line_top, cx + dx + line_w / 2, line_bottom),
            fill=(23, 105, 224, 255),
        )

    return img


for s in (16, 48, 128):
    out = os.path.join(OUT_DIR, f"icon{s}.png")
    make_icon(s).save(out)
    print(f"Wrote {out}")
