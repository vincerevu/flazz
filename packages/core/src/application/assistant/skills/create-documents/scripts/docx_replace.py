#!/usr/bin/env python
"""Replace text in DOCX XML while preserving unrelated package parts."""

from __future__ import annotations

import argparse
import sys
import tempfile
import zipfile
from pathlib import Path

from lxml import etree

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def replace_in_xml(xml_bytes: bytes, find: str, replace: str) -> tuple[bytes, int]:
    root = etree.fromstring(xml_bytes)
    count = 0
    for text_node in root.xpath("//w:t", namespaces=NS):
        if text_node.text and find in text_node.text:
            count += text_node.text.count(find)
            text_node.text = text_node.text.replace(find, replace)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True), count


def replace_docx(input_path: Path, output_path: Path, find: str, replace: str) -> int:
    if not input_path.exists():
        raise FileNotFoundError(input_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(input_path) as zf:
            zf.extractall(tmp_path)

        changed = 0
        for part in [tmp_path / "word" / "document.xml", *sorted((tmp_path / "word").glob("header*.xml")), *sorted((tmp_path / "word").glob("footer*.xml"))]:
            if part.exists():
                new_xml, part_count = replace_in_xml(part.read_bytes(), find, replace)
                if part_count:
                    part.write_bytes(new_xml)
                    changed += part_count

        with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for file in tmp_path.rglob("*"):
                if file.is_file():
                    zf.write(file, file.relative_to(tmp_path).as_posix())

    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description="Replace text in a DOCX file.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--find", required=True)
    parser.add_argument("--replace", required=True)
    args = parser.parse_args()

    try:
        count = replace_docx(args.input, args.output, args.find, args.replace)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"Replaced {count} occurrence(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
