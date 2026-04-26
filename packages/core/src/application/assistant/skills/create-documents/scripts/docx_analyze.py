#!/usr/bin/env python
"""Analyze a DOCX package without requiring Microsoft Word."""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

from lxml import etree

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def paragraph_text(p: etree._Element) -> str:
    return "".join(p.xpath(".//w:t/text()", namespaces=NS))


def analyze(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(path)

    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        document_xml = etree.fromstring(zf.read("word/document.xml"))
        paragraphs = [paragraph_text(p) for p in document_xml.xpath("//w:p", namespaces=NS)]
        non_empty = [p for p in paragraphs if p.strip()]
        tables = document_xml.xpath("//w:tbl", namespaces=NS)
        headings = []
        for p in document_xml.xpath("//w:p", namespaces=NS):
            style = p.xpath("./w:pPr/w:pStyle/@w:val", namespaces=NS)
            text = paragraph_text(p).strip()
            if text and style and style[0].lower().startswith("heading"):
                headings.append({"style": style[0], "text": text})

        return {
            "file": str(path),
            "paragraph_count": len(paragraphs),
            "non_empty_paragraph_count": len(non_empty),
            "table_count": len(tables),
            "headings": headings,
            "has_headers": any(n.startswith("word/header") for n in names),
            "has_footers": any(n.startswith("word/footer") for n in names),
            "has_comments": "word/comments.xml" in names,
            "has_numbering": "word/numbering.xml" in names,
            "preview": non_empty[:20],
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze a DOCX file.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    try:
        result = analyze(args.input)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"File: {result['file']}")
        print(f"Paragraphs: {result['paragraph_count']} ({result['non_empty_paragraph_count']} non-empty)")
        print(f"Tables: {result['table_count']}")
        print(f"Headings: {len(result['headings'])}")
        for line in result["preview"]:
            print(f"- {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
