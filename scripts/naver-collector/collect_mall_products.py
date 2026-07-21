# -*- coding: utf-8 -*-
"""
네이버쇼핑 검색 API로 5개 KOSIS상품군(의복/신발/가방/패션용품 및 액세서리/화장품)을
수집해 shopping_dashboard.html의 DATA.products와 동일한 tuple 배열 형태로 저장합니다.

네이버쇼핑 검색 API는 카테고리 브라우징이 아니라 검색어 기반이라, 카테고리당
대표 검색어 5개(display=50)로 조회해 250개씩 모은다 (카테고리당 5회, 총 25회 호출 —
일일 한도 25,000회 대비 0.1% 수준). 응답의 category1/category2로 실제 매칭 카테고리를
재검증해, 검색어가 의도한 카테고리 밖 결과를 반환하면 제외한다.

가격 필드는 lprice(최저가) 하나뿐이라(정가/할인가 구분 없음), 가격=할인가=lprice로
매핑한다. productId 기준 중복 제거(같은 상품이 여러 검색어에 중복 노출될 수 있음).

사용법:
    python scripts/naver-collector/collect_mall_products.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

SRC_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SRC_DIR))

from common import clean_text  # noqa: E402
from naver_api import NaverAPIError, search_shopping  # noqa: E402

REPO_ROOT = SRC_DIR.parent.parent
load_dotenv(REPO_ROOT / ".env")

DATA_DIR = REPO_ROOT / "data"
OUT_PATH = DATA_DIR / "naver_products.json"

DISPLAY_PER_KEYWORD = 50
REQUEST_DELAY = 1.0

# KOSIS상품군 -> 대표 검색어 5개 (수동 큐레이션 - 카테고리당 다양한 결과를 위해 유지)
KEYWORD_PLAN: dict[str, list[str]] = {
    "의복": ["여성원피스", "여성니트", "여성팬츠", "남성셔츠", "남성아우터"],
    "신발": ["여성스니커즈", "여성구두", "남성운동화", "남성로퍼", "여성부츠"],
    "가방": ["숄더백", "크로스백", "백팩", "토트백", "클러치백"],
    "패션용품 및 액세서리": ["목걸이", "귀걸이", "가죽벨트", "손목시계", "볼캡"],
    "화장품": ["수분크림", "선크림", "토너", "에센스", "클렌징폼"],
}


def validate_category(kosis_cat: str, category1: str, category2: str) -> bool:
    """검색어로 얻은 결과가 실제로도 의도한 KOSIS상품군에 속하는지 category1/2로 재검증."""
    if kosis_cat == "의복":
        return category1 == "패션의류"
    if kosis_cat == "화장품":
        return category1 == "화장품/미용"
    if category1 != "패션잡화":
        return False
    if kosis_cat == "신발":
        return "신발" in category2
    if kosis_cat == "가방":
        return "가방" in category2
    if kosis_cat == "패션용품 및 액세서리":
        return "신발" not in category2 and "가방" not in category2
    return False


def collect() -> pd.DataFrame:
    client_id = os.getenv("NAVER_CLIENT_ID", "").strip()
    client_secret = os.getenv("NAVER_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise SystemExit("naver-api-app/.env 에 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 필요합니다.")

    collected_at = datetime.now().astimezone().isoformat(timespec="seconds")
    rows: list[dict] = []
    call_count = 0

    for kosis_cat, keywords in KEYWORD_PLAN.items():
        for kw in keywords:
            call_count += 1
            print(f"[{call_count}/25] {kosis_cat} <- '{kw}' 검색 중...", end=" ")
            try:
                result = search_shopping(client_id, client_secret, kw, display=DISPLAY_PER_KEYWORD)
            except NaverAPIError as e:
                print(f"실패: {e}")
                continue

            items = result.get("items", [])
            kept = 0
            for item in items:
                cat1 = item.get("category1", "")
                cat2 = item.get("category2", "")
                if not validate_category(kosis_cat, cat1, cat2):
                    continue
                lprice = pd.to_numeric(item.get("lprice"), errors="coerce")
                if pd.isna(lprice) or lprice <= 0:
                    continue
                rows.append({
                    "쇼핑몰명": "네이버쇼핑",
                    "몰유형": "종합몰",
                    "상품명": clean_text(item.get("title", "")),
                    "KOSIS상품군": kosis_cat,
                    "자체카테고리": f"{cat2}>{item.get('category3', '')}",
                    "가격": lprice,
                    "할인가": lprice,
                    "링크": item.get("link"),
                    "수집일": collected_at,
                    "item_id": item.get("productId"),
                    "brand_name": item.get("brand") or item.get("maker") or "",
                    "seller_mall_name": item.get("mallName"),
                    "maker": item.get("maker"),
                    "product_type": item.get("productType"),
                    "search_keyword": kw,
                })
                kept += 1
            print(f"{len(items)}건 중 {kept}건 채택")
            time.sleep(REQUEST_DELAY)

    return pd.DataFrame(rows)


def main() -> None:
    df = collect()
    if df.empty:
        raise SystemExit("수집된 데이터가 없습니다.")

    before = len(df)
    df = df.drop_duplicates(subset="item_id", keep="first").reset_index(drop=True)
    dup_removed = before - len(df)

    # shopping_dashboard.html의 DATA.products와 동일한 tuple 배열 형태로 저장
    # [쇼핑몰명, 상품명, 자체카테고리, 가격, 할인가, 할인율, 링크, brand, KOSIS상품군]
    products = df.apply(
        lambda r: [
            r["쇼핑몰명"],
            r["상품명"],
            r["자체카테고리"],
            r["가격"],
            r["할인가"],
            0,
            r["링크"],
            r["brand_name"],
            r["KOSIS상품군"],
        ],
        axis=1,
    ).tolist()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False)

    print(f"\n원본(검증 통과) {before}행 -> 중복(item_id) {dup_removed}행 제거 -> {len(df)}행 저장 ({OUT_PATH})")
    print("KOSIS상품군 분포:")
    print(df["KOSIS상품군"].value_counts().to_string())


if __name__ == "__main__":
    main()
