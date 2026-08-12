# -*- coding: utf-8 -*-
"""cards_updated.csv 데이터 기반 1:N 혜택 정규화 DB 구축 스크립트.

생성 DB: data/cards_normalized.sqlite
테이블:
  1. Cards_Master: 카드 기본 마스터 정보
  2. Card_Benefits_Normalized: 정규화된 혜택 정보 (카테고리, 표준카테고리, 혜택유형, 할인율 %, 정액 금액 원)
"""

import os
import sqlite3
import pandas as pd
import re

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT_DIR, "cards_updated.csv")
if not os.path.exists(CSV_PATH):
    CSV_PATH = os.path.join(ROOT_DIR, "cards.csv")

DB_PATH = os.path.join(ROOT_DIR, "data", "cards_normalized.sqlite")

# 12대 표준 카테고리 매핑 규칙
STD_CATEGORY_RULES = [
    ("주유", ["주유", "주유소", "충전", "lpg", "전기차", "오일"]),
    ("대중교통", ["교통", "대중교통", "택시", "철도", "버스", "지하철", "코레일", "ktx", "srt"]),
    ("쇼핑", ["쇼핑", "백화점", "아울렛", "면세점", "소매점", "온라인", "e커머스", "쿠팡", "11번가", "g마켓", "옥션", "ssg", "홈쇼핑"]),
    ("편의점/마트", ["편의점", "마트", "ssm", "다이소", "올리브영", "잡화", "이마트", "홈플러스", "롯데마트", "코스트코"]),
    ("외식/배달", ["외식", "배달", "푸드", "요식", "음식점", "맛집", "패밀리레스토랑", "한식", "양식", "일식", "중식", "패스트푸드"]),
    ("카페", ["카페", "베이커리", "커피", "디저트", "스타벅스", "투썸", "이디야", "할리스", "빽다방", "폴바셋"]),
    ("통신", ["통신", "휴대폰", "스마트폰", "skt", "kt", "lgu+", "알뜰폰", "이동통신"]),
    ("구독/디지털", ["넷플릭스", "ott", "구독", "디지털", "스트리밍", "유튜브", "디즈니", "티빙", "영화", "wavve"]),
    ("문화/여가", ["도서", "공연", "문화", "전시", "서점", "경기관람", "스포츠", "골프", "놀이공원", "테마파크"]),
    ("여행/숙박", ["해외", "여행", "숙박", "항공", "호텔", "아시아나", "대한항공", "펜션", "콘도", "라운지"]),
    ("공과금", ["공과금", "납부", "관리비", "가스", "전기", "수도", "보험", "세금"]),
    ("교육/육아", ["교육", "학원", "육아", "유치원", "학습지", "에듀", "어린이집"]),
]

def map_std_category(cat_name, detail_text):
    text = (str(cat_name) + " " + str(detail_text)).lower()
    for std_name, keywords in STD_CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return std_name
    return "기타"

def parse_benefit_details(detail_str):
    """
    혜택설명 텍스트에서 혜택 유형, 할인율(%), 정액 금액(원/마일/P)을 파싱합니다.
    """
    benefit_type = "할인"
    if "적립" in detail_str:
        benefit_type = "적립"
    elif "청구할인" in detail_str:
        benefit_type = "청구할인"
    elif "캐시백" in detail_str:
        benefit_type = "캐시백"
    elif "바우처" in detail_str or "입장권" in detail_str:
        benefit_type = "바우처/서비스"

    # 1. 할인율(%) 파싱 (예: 10%, 1.2%, 50% 등)
    discount_rate = None
    rate_match = re.search(r'(\d+(?:\.\d+)?)\s*%', detail_str)
    if rate_match:
        try:
            discount_rate = float(rate_match.group(1))
        except ValueError:
            pass

    # 2. 정액 금액(원, 마일, P, L) 파싱 (예: 15,000원, 2만원, 60원, 1.5만마일)
    discount_amount = None
    unit = None

    # 만원 패턴 (예: 2만원, 1.5만원, 2만)
    man_match = re.search(r'(\d+(?:\.\d+)?)\s*만\s*(?:원|마일|P)?', detail_str)
    if man_match:
        try:
            discount_amount = int(float(man_match.group(1)) * 10000)
            unit = "원"
            if "마일" in detail_str:
                unit = "마일"
            elif "P" in detail_str or "포인트" in detail_str:
                unit = "P"
        except ValueError:
            pass

    if discount_amount is None:
        # 천/원 패턴 (예: 15,000원, 7,000원, 60원/L)
        won_match = re.search(r'([\d,]+)\s*(원|마일|P|포인트)', detail_str)
        if won_match:
            try:
                amt_str = won_match.group(1).replace(",", "")
                discount_amount = int(amt_str)
                unit = won_match.group(2)
                if unit == "포인트":
                    unit = "P"
            except ValueError:
                pass

    return benefit_type, discount_rate, discount_amount, unit

def main():
    if not os.path.exists(CSV_PATH):
        print(f"오류: CSV 파일이 없습니다: {CSV_PATH}")
        return

    print(f"CSV 파일 로드 중: {CSV_PATH}")
    df = pd.read_csv(CSV_PATH)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. 테이블 생성
    cursor.execute("DROP TABLE IF EXISTS Card_Benefits_Normalized;")
    cursor.execute("DROP TABLE IF EXISTS Cards_Master;")

    cursor.execute("""
        CREATE TABLE Cards_Master (
            card_id INTEGER PRIMARY KEY,
            card_name TEXT NOT NULL,
            company TEXT NOT NULL,
            card_type TEXT,
            brands TEXT,
            annual_fee TEXT,
            pre_month_money INTEGER DEFAULT 0,
            pre_month_condition TEXT,
            card_img TEXT,
            detail_url TEXT
        );
    """)

    cursor.execute("""
        CREATE TABLE Card_Benefits_Normalized (
            benefit_id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id INTEGER NOT NULL,
            category TEXT,
            std_category TEXT NOT NULL,
            benefit_type TEXT NOT NULL,
            discount_rate REAL,
            discount_amount INTEGER,
            unit TEXT,
            detail_summary TEXT NOT NULL,
            FOREIGN KEY (card_id) REFERENCES Cards_Master(card_id) ON DELETE CASCADE
        );
    """)

    # 2. 데이터 마이그레이션 & 파싱
    cards_inserted = 0
    benefits_inserted = 0

    for idx, row in df.iterrows():
        card_id = int(row['idx'])
        card_name = str(row['card_name']) if pd.notna(row['card_name']) else ''
        company = str(row['company']) if pd.notna(row['company']) else ''
        card_type = str(row['card_type']) if pd.notna(row['card_type']) else ''
        brands = str(row['brands']) if pd.notna(row['brands']) else ''
        annual_fee = str(row['annual_fee']) if pd.notna(row['annual_fee']) else ''
        
        try:
            pre_month_money = int(row['pre_month_money']) if pd.notna(row['pre_month_money']) else 0
        except (ValueError, TypeError):
            pre_month_money = 0
            
        pre_month_condition = str(row['pre_month_condition']) if pd.notna(row['pre_month_condition']) else ''
        card_img = str(row['card_img']) if pd.notna(row['card_img']) else ''
        detail_url = str(row['detail_url']) if pd.notna(row['detail_url']) else ''

        cursor.execute("""
            INSERT INTO Cards_Master (card_id, card_name, company, card_type, brands, annual_fee, pre_month_money, pre_month_condition, card_img, detail_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (card_id, card_name, company, card_type, brands, annual_fee, pre_month_money, pre_month_condition, card_img, detail_url))
        cards_inserted += 1

        # 혜택 정규화 분리 (top_benefit_summary)
        benefit_summary = str(row['top_benefit_summary']) if pd.notna(row['top_benefit_summary']) else ''
        if benefit_summary:
            items = [item.strip() for item in benefit_summary.split("|") if item.strip()]
            for item in items:
                category = "기타"
                detail_text = item

                if ":" in item:
                    parts = item.split(":", 1)
                    cat_candidate = parts[0].strip()
                    detail_candidate = parts[1].strip()
                    if cat_candidate and detail_candidate:
                        category = cat_candidate
                        detail_text = detail_candidate

                std_cat = map_std_category(category, detail_text)
                b_type, d_rate, d_amount, unit = parse_benefit_details(detail_text)

                cursor.execute("""
                    INSERT INTO Card_Benefits_Normalized (card_id, category, std_category, benefit_type, discount_rate, discount_amount, unit, detail_summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, (card_id, category, std_cat, b_type, d_rate, d_amount, unit, detail_text))
                benefits_inserted += 1

    # 3. 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cbn_card_id ON Card_Benefits_Normalized(card_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cbn_std_cat ON Card_Benefits_Normalized(std_category);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cbn_btype ON Card_Benefits_Normalized(benefit_type);")

    conn.commit()
    conn.close()

    print(f"🎉 신규 DB 구축 성공! (DB 경로: {DB_PATH})")
    print(f" - Cards_Master: {cards_inserted}개 카드 저장")
    print(f" - Card_Benefits_Normalized: {benefits_inserted}개 정규화 혜택 레코드 저장 (할인율 및 금액 수치 파싱 완료)")

if __name__ == "__main__":
    main()
