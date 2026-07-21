"""페이지 공통 유틸리티: HTML 클린징 등."""
from __future__ import annotations

import re
import html as html_lib

_TAG_RE = re.compile(r"<[^>]+>")


def clean_text(text: str) -> str:
    """검색 결과에 포함된 <b> 태그와 HTML 엔티티를 제거합니다."""
    if not text:
        return ""
    return html_lib.unescape(_TAG_RE.sub("", text))
