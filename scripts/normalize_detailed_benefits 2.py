# -*- coding: utf-8 -*-
"""calculator_db.sqlite 내 All_Cards_Raw.detailed_benefits 정규화 스크립트.

기능:
  1. All_Cards_Raw 테이블의 비정형 detailed_benefits 텍스트(파이프 '|' 및 콜론 ':' 구분)를 파싱합니다.
  2. 신규 정규화 테이블 Card_Detailed_Benefits (benefit_id, card_idx, category, std_category, detail)를 생성합니다.
  3. 12대 표준 소비 카테고리(std_category) 자동 매핑 및 데이터 인서트/인덱싱을 진행합니다.
"""

import os
import sqlite3
import re

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT_DIR, "data", "calculator_db.sqlite")

# 12대 표준 카테고리 매핑 규칙
STD_CATEGORY_RULES = [
    ("주유", ["주유", "주유소", "충전", "lpg", "전기차", "오일"]),
    ("대중교통", ["교통", "대중교통", "택시", "철도", "버스", "지하철", "코레일", "ktx", "srt"]),
    ("쇼핑", ["쇼핑", "백화점", "아울렛", "면세점", "소매점", "온라인", "e커머스", "쿠팡", "11번가", "g마켓", "옥션", "ssg"]),
    ("편의점/마트", ["편의점", "마트", "ssm", "다이소", "올리브영", "잡화", "이마트", "홈플러스", "롯데마트", "코스트코"]),
    ("외식/배달", ["외식", "배달", "푸드", "요식", "음식점", "맛집", "패밀리레스토랑", "한식", "양식", "일식", "중식", "패스트푸드"]),
    ("카페", ["카페", "베이커리", "커피", "디저트", "스타벅스", "투썸", "이디야", "할리스", "빽다방"]),
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

def main():
    if not os.path.exists(DB_PATH):
        print(f"오류: DB 파일이 존재하지 않습니다: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. 신규 정규화 테이블 생성
    cursor.execute("DROP TABLE IF EXISTS Card_Detailed_Benefits;")
    cursor.execute("""
        CREATE TABLE Card_Detailed_Benefits (
            benefit_id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_idx INTEGER NOT NULL,
            category TEXT,
            std_category TEXT NOT NULL,
            detail TEXT NOT NULL,
            FOREIGN KEY (card_idx) REFERENCES All_Cards_Raw(idx) ON DELETE CASCADE
        );
    """)

    # 2. All_Cards_Raw 데이터 조회
    cursor.execute("SELECT idx, detailed_benefits FROM All_Cards_Raw WHERE detailed_benefits IS NOT NULL AND detailed_benefits != '';")
    rows = cursor.fetchall()

    inserted_count = 0
    card_count = len(rows)

    print(f"대상 카드 수: {card_count}건. detailed_benefits 정규화 파싱을 시작합니다...")

    records_to_insert = []

    for card_idx, benefits_str in rows:
        # 파이프(|) 구분자로 각 혜택 항목 분리
        items = [item.strip() for item in benefits_str.split("|") if item.strip()]
        
        for item in items:
            category = "기타"
            detail = item
            
            # 콜론(:) 구분자로 카테고리명과 상세설명 분리
            if ":" in item:
                parts = item.split(":", 1)
                cat_candidate = parts[0].strip()
                detail_candidate = parts[1].strip()
                if cat_candidate and detail_candidate:
                    category = cat_candidate
                    detail = detail_candidate
            
            std_cat = map_std_category(category, detail)
            records_to_insert.append((card_idx, category, std_cat, detail))

    # 3. 데이터 일괄 인서트
    cursor.executemany("""
        INSERT INTO Card_Detailed_Benefits (card_idx, category, std_category, detail)
        VALUES (?, ?, ?, ?);
    """, records_to_insert)

    inserted_count = len(records_to_insert)

    # 4. 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cdb_card_idx ON Card_Detailed_Benefits(card_idx);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cdb_std_cat ON Card_Detailed_Benefits(std_category);")

    conn.commit()
    conn.close()

    print(f"🎉 정규화 완료! 총 {card_count}개 카드에서 {inserted_count}개의 혜택 항목이 'Card_Detailed_Benefits' 테이블로 정규화 인서트 되었습니다.")

if __name__ == "__main__":
    main()
