#!/usr/bin/env python3
"""Bundles Chrono Echo into a single zero-dependency standalone HTML file."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
JS_ORDER = [
    "js/math.js",
    "js/audio.js",
    "js/grid.js",
    "js/upgrades.js",
    "js/weapons.js",
    "js/enemies.js",
    "js/game.js",
]


def build() -> Path:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css/style.css").read_text(encoding="utf-8")

    js_parts = []
    for rel in JS_ORDER:
        src = (ROOT / rel).read_text(encoding="utf-8")
        js_parts.append(f"/* === {rel} === */\n{src}")
    combined_js = "\n\n".join(js_parts)

    out_html = html.replace(
        '<link rel="stylesheet" href="css/style.css" />',
        f"<style>\n{css}\n</style>",
    )
    out_html = re.sub(
        r'(\s*<script src="js/[^"]+"></script>\s*)+',
        f"\n  <script>\n{combined_js}\n  </script>\n",
        out_html,
    )

    out_path = ROOT / "dist" / "chrono-echo-standalone.html"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out_html, encoding="utf-8")
    print(f"Built {out_path} ({out_path.stat().st_size:,} bytes)")
    return out_path


if __name__ == "__main__":
    build()
