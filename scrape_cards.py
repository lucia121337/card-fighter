# -*- coding: utf-8 -*-
"""
card-gorilla 신용카드(cate=CRD) 전체 정보 수집기 (Scrapling 사용)

대상 페이지 : https://www.card-gorilla.com/card?cate=CRD
데이터 출처 : /v1/cards  (페이지 컴포넌트가 호출하는 공식 JSON API)
수집 필드   : 카드명 / 카드사 / 연회비 / 전월실적 조건 / 주요 혜택 요약 (+ 원본 전체)

출력:
  - cards_raw.json : API 원본 그대로(전체 필드)
  - cards.json     : 핵심 필드 정제본
  - cards.csv      : 핵심 필드 표(엑셀용, UTF-8 BOM)
"""
import io
import sys
import csv
import json
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from scrapling.fetchers import Fetcher

API = "https://api.card-gorilla.com/v1/cards"
HEADERS = {
    "Accept": "application/json",
    "Referer": "https://www.card-gorilla.com/card?cate=CRD",
    "Origin": "https://www.card-gorilla.com",
}
CATE = "CRD"
PER_PAGE = 100      # 페이지당 카드 수 (요청 횟수 절감)
SORT = "ranking"    # card-gorilla 기본 정렬(인기순)
MAX_RETRY = 3
SLEEP = 0.6         # 서버 배려용 페이지 간 대기(초)


def parse_payload(resp):
    """Scrapling 응답에서 JSON 추출 (버전별 속성 차이 대응)"""
    for attr in ("body", "text", "content"):
        raw = getattr(resp, attr, None)
        if raw:
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8", "replace")
            return json.loads(raw)
    j = getattr(resp, "json", None)
    return j() if callable(j) else j


def fetch_page(page):
    params = {"cate": CATE, "p": page, "perPage": PER_PAGE, "sort": SORT}
    last_err = None
    for attempt in range(1, MAX_RETRY + 1):
        try:
            resp = Fetcher.get(API, params=params, headers=HEADERS,
                               impersonate="chrome", stealthy_headers=True,
                               timeout=30)
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status}")
            return parse_payload(resp)
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"  ! page {page} 시도 {attempt} 실패: {e}")
            time.sleep(1.5 * attempt)
    raise RuntimeError(f"page {page} 수집 실패: {last_err}")


def benefit_summary(item):
    """top_benefit 배열 -> '제목:태그' 요약 문자열"""
    out = []
    for b in (item.get("top_benefit") or []):
        title = (b.get("title") or "").strip()
        tags = " ".join(t for t in (b.get("tags") or []) if t).strip()
        piece = f"{title}: {tags}".strip(": ").strip()
        if piece:
            out.append(piece)
    return " | ".join(out)


def benefit_categories(item):
    """search_benefit -> 혜택 카테고리 라벨 목록"""
    labels = []
    for grp in (item.get("search_benefit") or []):
        for opt in (grp.get("options") or []):
            lab = opt.get("label")
            if lab:
                labels.append(lab)
    return ", ".join(labels)


def clean(item):
    return {
        "idx": item.get("idx"),
        "card_name": item.get("name"),
        "company": (item.get("corp") or {}).get("name") or item.get("corp_txt"),
        "card_type": item.get("cate_txt"),
        "brands": item.get("brands_txt"),
        "annual_fee": (item.get("annual_fee_basic") or "").replace("\n", " ").strip(),
        "pre_month_money": item.get("pre_month_money"),
        "pre_month_condition": (
            f"{item['pre_month_money']:,}원" if item.get("pre_month_money") else "없음"
        ),
        "top_benefit_summary": benefit_summary(item),
        "benefit_categories": benefit_categories(item),
        "only_online": item.get("only_online"),
        "release_dt": item.get("release_dt"),
        "card_img": (item.get("card_img") or {}).get("url"),
        "detail_url": f"https://www.card-gorilla.com/card/detail/{item.get('idx')}",
    }


def main():
    print(f"[수집 시작] cate={CATE}, perPage={PER_PAGE}")
    first = fetch_page(1)
    total = first["total"]
    pages = (total + PER_PAGE - 1) // PER_PAGE
    print(f"전체 카드 수: {total}  ->  총 {pages}페이지")

    raw_items = list(first["data"])
    print(f"  page 1/{pages} : 누적 {len(raw_items)}/{total}")

    for p in range(2, pages + 1):
        time.sleep(SLEEP)
        payload = fetch_page(p)
        batch = payload.get("data") or []
        raw_items.extend(batch)
        print(f"  page {p}/{pages} : 누적 {len(raw_items)}/{total}")

    # 중복 제거(idx 기준)
    seen, uniq = set(), []
    for it in raw_items:
        k = it.get("idx")
        if k in seen:
            continue
        seen.add(k)
        uniq.append(it)
    print(f"수집 완료: 원본 {len(raw_items)}건 -> 중복제거 {len(uniq)}건")

    cleaned = [clean(it) for it in uniq]

    with open("cards_raw.json", "w", encoding="utf-8") as f:
        json.dump(uniq, f, ensure_ascii=False, indent=2)
    with open("cards.json", "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False, indent=2)

    cols = ["idx", "card_name", "company", "card_type", "brands", "annual_fee",
            "pre_month_money", "pre_month_condition", "top_benefit_summary",
            "benefit_categories", "only_online", "release_dt", "card_img", "detail_url"]
    with open("cards.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for row in cleaned:
            w.writerow(row)

    print("\n[저장 완료]")
    print(f"  - cards_raw.json ({len(uniq)}건, 전체 필드)")
    print(f"  - cards.json     ({len(cleaned)}건, 정제본)")
    print(f"  - cards.csv      ({len(cleaned)}건, 엑셀용)")


if __name__ == "__main__":
    main()
