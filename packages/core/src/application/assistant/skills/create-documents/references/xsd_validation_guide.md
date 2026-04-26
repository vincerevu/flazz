# DOCX Validation Guide

Use the Python validator for normal DOCX package checks:

    "%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_validate.py" output.docx

Then inspect visible structure:

    "%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_analyze.py" output.docx

The validator checks:

- Required DOCX package parts exist.
- XML and relationship parts are well-formed.
- The file is a valid zip/docx package.

For advanced OpenXML validation, inspect the changed XML part directly with lxml and the references:

- openxml_element_order.md
- openxml_namespaces.md
- openxml_units.md

If validation fails:

1. Unzip the DOCX into a temporary directory.
2. Parse the failing XML part with lxml.
3. Fix element order, namespaces, or relationships.
4. Rezip the package.
5. Rerun docx_validate.py and docx_analyze.py.
