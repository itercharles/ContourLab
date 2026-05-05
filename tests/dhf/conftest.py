"""Root conftest: auto-inject medharness metadata into JUnit XML.

For every test that has a recognisable docstring, the following
<property> elements are written into the JUnit XML <testcase> node:

  medharness.id           – from @test_id tag, or extracted from function name
  medharness.title        – from first docstring line (after "TC-XXX: ")
  medharness.links        – from @links tag (comma-separated)
  medharness.reviewer     – from @reviewer tag (optional)
  medharness.review_date  – from @review_date tag (optional)
  medharness.review_status – from @review_status tag (optional)
"""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent / "utils"))
from docstring_parser import parse_docstring, extract_tc_id_from_name


@pytest.fixture(autouse=True)
def _inject_medharness_metadata(request, record_property):
    """Auto-inject medharness.* properties from docstring into JUnit XML."""
    doc = request.function.__doc__ or ""
    if not doc.strip():
        return

    meta = parse_docstring(doc)

    # TC ID: prefer explicit @test_id, fall back to function name
    tc_id = meta.get('test_id') or extract_tc_id_from_name(request.node.name)
    if tc_id:
        record_property("medharness.id", tc_id)

    if meta.get('title'):
        record_property("medharness.title", meta['title'])

    if meta.get('links'):
        record_property("medharness.links", meta['links'])

    if meta.get('reviewer'):
        record_property("medharness.reviewer", meta['reviewer'])

    if meta.get('review_date'):
        record_property("medharness.review_date", meta['review_date'])

    if meta.get('review_status'):
        record_property("medharness.review_status", meta['review_status'])
