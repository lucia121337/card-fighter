# -*- coding: utf-8 -*-
"""card-fighter 로컬 미리보기 서버 (팀 공용).

왜 필요한가:
  이 사이트는 Vercel 배포 시 vercel.json 의 rewrites 로 URL을 바꾼다.
    /detail  -> detail.html,  /compare -> compare.html
  그런데 `python -m http.server` 는 이 리라이트를 안 해줘서,
  '카드 상세보기'(/detail?idx=...) 같은 링크가 로컬에서 404("Error response")가 난다.
  이 서버는 vercel.json 의 rewrites 를 그대로 재현해 배포 환경과 동일하게 보이도록 한다.
  (+ 캐시 방지 헤더로 수정한 내용이 바로 반영되게 한다.)

사용법 (레포 루트에서):
    python serve.py            # http://localhost:5500
    python serve.py 8080       # 포트 지정
  파일 더블클릭(file://)은 cards.json 등 fetch 가 막혀 카드가 안 뜨니 반드시 이 서버로 연다.
  실시간 검색어/트렌드(api/) 까지 보려면 .env 키가 필요하며 `vercel dev` 를 써야 한다.
"""
import http.server
import functools
import json
import os
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))   # 이 스크립트가 있는 폴더 = 레포 루트
DEFAULT_PORT = 5500


def load_rewrites():
    """vercel.json 의 rewrites 를 {source: destination} 로 읽는다."""
    rules = {}
    try:
        with open(os.path.join(ROOT, "vercel.json"), encoding="utf-8") as f:
            for r in (json.load(f).get("rewrites") or []):
                src, dst = r.get("source"), r.get("destination")
                if src and dst:
                    rules[src] = dst
    except (OSError, ValueError):
        pass
    return rules


REWRITES = load_rewrites()


class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    def _rewrite_path(self):
        parts = urllib.parse.urlsplit(self.path)
        p = parts.path
        # 1) vercel.json 에 정의된 정확한 리라이트 우선
        dst = REWRITES.get(p)
        # 2) 없으면: 확장자 없는 경로에 대응하는 .html 이 있으면 그걸로 (일반 규칙)
        if not dst and p and p != "/" and not os.path.splitext(p)[1]:
            candidate = os.path.join(ROOT, p.lstrip("/").replace("/", os.sep) + ".html")
            if os.path.isfile(candidate):
                dst = p + ".html"
        if dst:
            self.path = urllib.parse.urlunsplit(("", "", dst, parts.query, parts.fragment))

    def do_GET(self):
        self._rewrite_path()
        super().do_GET()

    def do_HEAD(self):
        self._rewrite_path()
        super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"포트 번호가 올바르지 않습니다: {sys.argv[1]}")
            sys.exit(1)
    handler = functools.partial(PreviewHandler, directory=ROOT)
    routes = ", ".join(REWRITES) or "(vercel.json 없음)"
    print(f"card-fighter 미리보기: http://localhost:{port}")
    print(f"리라이트: {routes}")
    print("종료: Ctrl+C")
    try:
        http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
    except KeyboardInterrupt:
        print("\n종료했습니다.")


if __name__ == "__main__":
    main()
