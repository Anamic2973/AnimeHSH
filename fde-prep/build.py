"""Compile src/ into one standalone HTML file per track.

Usage: python3 build.py
Each output inlines the shared CSS/engine plus that track's data, so any
single file can be opened, moved or shared on its own.
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"

TRACKS = [
    ("track-a.js", "track-a-fde-core.html", "FDE Core Track", "A"),
    ("track-b.js", "track-b-dsa.html", "DSA Patterns Track", "B"),
    ("track-c.js", "track-c-system-design.html", "System Design Track", "C"),
]


def main() -> None:
    shell = (SRC / "shell.html").read_text()
    css = (SRC / "engine.css").read_text()
    engine = (SRC / "engine.js").read_text()
    for data_file, out, title, badge in TRACKS:
        data = (SRC / data_file).read_text()
        html = (
            shell.replace("{{TITLE}}", title)
            .replace("{{BADGE}}", badge)
            .replace("{{CSS}}", css)
            .replace("{{DATA}}", data)
            .replace("{{ENGINE}}", engine)
        )
        (ROOT / out).write_text(html)
        print(f"wrote {out} ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
