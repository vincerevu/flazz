#!/usr/bin/env python
"""Lightweight DOCX package validator."""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

from lxml import etree

REQUIRED_PARTS = {
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/_rels/document.xml.rels",
}


def validate(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"File not found: {path}"]
    try:
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            for part in REQUIRED_PARTS:
                if part not in names:
                    errors.append(f"Missing required part: {part}")
            for name in names:
                if name.endswith(".xml") or name.endswith(".rels"):
                    try:
                        etree.fromstring(zf.read(name))
                    except Exception as exc:
                        errors.append(f"Invalid XML in {name}: {exc}")
    except zipfile.BadZipFile:
        return ["Not a valid zip/docx package"]
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a DOCX package.")
    parser.add_argument("input", type=Path)
    args = parser.parse_args()

    errors = validate(args.input)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("DOCX package validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
