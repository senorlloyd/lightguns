#!/usr/bin/env python3
"""
TRIGGER HAPPY ARCADE - game scanner
Looks through games/ and writes games/catalog.js, which the launcher reads.

Run it after you add or remove a game folder:
  Pi:       ./start-arcade.sh            (runs this, then opens the arcade)
  Windows:  double-click scan-games.bat
  Anywhere: python3 tools/scan-games.py

A folder shows up in the menu if it has an index.html. Optional extras in the folder:
  game.json    {"title": "Zombie Ranch", "genre": "Farm Defense", "blurb": "One line.",
                "players": [1, 2], "colors": ["#ff3b6b", "#3bd5ff"], "hidden": false}
  thumb.png    card art (thumb.jpg / .jpeg / .webp also work)
  preview.mp4  short gameplay clip shown as the demo (preview.webm also works)
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES = os.path.join(ROOT, "games")
OUT = os.path.join(GAMES, "catalog.js")

THUMBS = ["thumb.png", "thumb.jpg", "thumb.jpeg", "thumb.webp"]
VIDEOS = ["preview.mp4", "preview.webm"]
KEYS = ["title", "genre", "blurb", "players", "colors", "hidden"]


def first_present(folder, names):
    files = {f.lower(): f for f in os.listdir(folder)}
    for n in names:
        if n in files:
            return files[n]
    return None


def main():
    if not os.path.isdir(GAMES):
        sys.exit("No games/ folder next to index.html")
    catalog, problems = [], []
    for name in sorted(os.listdir(GAMES)):
        folder = os.path.join(GAMES, name)
        if not os.path.isdir(folder) or name.startswith((".", "_")):
            continue
        if not os.path.isfile(os.path.join(folder, "index.html")):
            problems.append(f"  skipped {name}/ (no index.html)")
            continue
        entry = {"folder": name}
        meta_file = os.path.join(folder, "game.json")
        if os.path.isfile(meta_file):
            try:
                with open(meta_file, encoding="utf-8-sig") as f:
                    meta = json.load(f)
                entry["meta"] = {k: meta[k] for k in KEYS if k in meta}
            except (ValueError, OSError) as e:
                problems.append(f"  {name}/game.json could not be read ({e}); using the folder name")
        thumb, video = first_present(folder, THUMBS), first_present(folder, VIDEOS)
        if thumb:
            entry["thumb"] = thumb
        if video:
            entry["video"] = video
        catalog.append(entry)

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Written by tools/scan-games.py - do not edit by hand, just run the scan again.\n")
        f.write("window.ARCADE_CATALOG = ")
        json.dump(catalog, f, ensure_ascii=False, indent=1)
        f.write(";\n")

    print(f"Found {len(catalog)} games -> games/catalog.js")
    for e in catalog:
        extras = [k for k in ("meta", "thumb", "video") if k in e]
        print(f"  {e['folder']:<24} {' + '.join(extras) if extras else ''}")
    for p in problems:
        print(p)


if __name__ == "__main__":
    main()
