import sqlite3
import json
import os

# 1. DB 연결 (로컬 파일로 생성)
db_path = os.path.join(os.path.dirname(__file__), 'calculator_db.sqlite')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 2. 기존 테이블 초기화
cursor.executescript('''
    DROP TABLE IF EXISTS All_Cards_Raw;
    DROP TABLE IF EXISTS Benefit_Items;
    DROP TABLE IF EXISTS Benefit_Groups;
    DROP TABLE IF EXISTS Performance_Tiers;
    DROP TABLE IF EXISTS Cards;
''')

# 3. 전체 원본 테이블 (All_Cards_Raw) 및 4대 마스터 테이블 스키마 생성
cursor.executescript('''
    CREATE TABLE All_Cards_Raw (
        idx INTEGER PRIMARY KEY,
        card_name TEXT,
        company TEXT,
        card_type TEXT,
        cate TEXT,
        brands TEXT,
        annual_fee TEXT,
        annual_fee_detail TEXT,
        pre_month_money INTEGER,
        pre_month_condition TEXT,
        only_online INTEGER,
        release_dt TEXT,
        card_img TEXT,
        top_benefit TEXT,          -- JSON string
        key_benefit TEXT,          -- JSON string
        benefit_categories TEXT,
        detail_url TEXT,
        top_benefit_summary TEXT,
        detailed_benefits TEXT,    -- JSON string
        item_limit TEXT,           -- JSON string or text
        group_id TEXT,
        group_limit TEXT,
        total_limit_tiers TEXT     -- JSON string
    );

    CREATE TABLE Cards (
        card_id INTEGER PRIMARY KEY,
        card_name TEXT,
        company TEXT,
        annual_fee INTEGER
    );

    CREATE TABLE Performance_Tiers (
        tier_id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER,
        perf INTEGER,
        total_limit INTEGER,
        FOREIGN KEY(card_id) REFERENCES Cards(card_id)
    );

    CREATE TABLE Benefit_Groups (
        group_id TEXT PRIMARY KEY,
        card_id INTEGER,
        group_limit INTEGER,
        FOREIGN KEY(card_id) REFERENCES Cards(card_id)
    );

    CREATE TABLE Benefit_Items (
        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER,
        title TEXT,
        detail TEXT,
        group_id TEXT,
        rate TEXT,         -- JSON 배열 저장 (실적별 요율)
        item_limit TEXT,   -- JSON 배열 또는 정수 저장 (실적별 한도)
        fixedAmount INTEGER, -- 정액 할인 금액
        minPayment INTEGER,  -- 최소 결제액 (표준 단가)
        FOREIGN KEY(card_id) REFERENCES Cards(card_id),
        FOREIGN KEY(group_id) REFERENCES Benefit_Groups(group_id)
    );
''')

# 4. All_Cards_Raw 테이블에 원본 카드 데이터(cards_full.json) 그대로 적재
cards_full_path = os.path.join('..', '..', 'cards_full.json')
if os.path.exists(cards_full_path):
    with open(cards_full_path, 'r', encoding='utf-8') as f:
        full_cards = json.load(f)

    raw_insert_data = []
    for card in full_cards:
        raw_insert_data.append((
            card.get('idx'),
            card.get('card_name'),
            card.get('company'),
            card.get('card_type'),
            card.get('cate'),
            card.get('brands'),
            card.get('annual_fee'),
            card.get('annual_fee_detail'),
            card.get('pre_month_money'),
            card.get('pre_month_condition'),
            1 if card.get('only_online') else 0,
            card.get('release_dt'),
            card.get('card_img'),
            json.dumps(card.get('top_benefit'), ensure_ascii=False) if isinstance(card.get('top_benefit'), (dict, list)) else card.get('top_benefit'),
            json.dumps(card.get('key_benefit'), ensure_ascii=False) if isinstance(card.get('key_benefit'), (dict, list)) else card.get('key_benefit'),
            card.get('benefit_categories'),
            card.get('detail_url'),
            card.get('top_benefit_summary'),
            json.dumps(card.get('detailed_benefits'), ensure_ascii=False) if isinstance(card.get('detailed_benefits'), (dict, list)) else card.get('detailed_benefits'),
            json.dumps(card.get('item_limit'), ensure_ascii=False) if isinstance(card.get('item_limit'), (dict, list)) else card.get('item_limit'),
            card.get('group_id'),
            card.get('group_limit'),
            json.dumps(card.get('total_limit_tiers'), ensure_ascii=False) if isinstance(card.get('total_limit_tiers'), (dict, list)) else card.get('total_limit_tiers')
        ))

    cursor.executemany('''
        INSERT INTO All_Cards_Raw (
            idx, card_name, company, card_type, cate, brands, annual_fee, annual_fee_detail,
            pre_month_money, pre_month_condition, only_online, release_dt, card_img, top_benefit,
            key_benefit, benefit_categories, detail_url, top_benefit_summary, detailed_benefits,
            item_limit, group_id, group_limit, total_limit_tiers
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', raw_insert_data)
    print(f"[RAW DATA] Inserted {len(raw_insert_data)} raw card records into All_Cards_Raw.")

# 5. 카드 마스터 데이터 적재 (5개 검증 완료 카드)
cards_data = [
    (2523, 'LG U+ 우리카드', '우리카드', 15000),
    (2525, '만나 우리카드', '우리카드', 12000),
    (2862, 'MG+ S 하나카드', 'MG새마을금고', 17000),
    (2300, '내맘대로 쁨 카드', '하나카드', 12000),
    (2455, '카카오뱅크 우리카드', '우리카드', 12000)
]
cursor.executemany('INSERT INTO Cards VALUES (?, ?, ?, ?)', cards_data)

# 6. Performance_Tiers 적재
tiers_data = [
    (2862, 300000, 180000)
]
cursor.executemany('INSERT INTO Performance_Tiers (card_id, perf, total_limit) VALUES (?, ?, ?)', tiers_data)

# 7. Benefit_Groups 적재
groups_data = [
    ('group_ppeum', 2300, 20000)
]
cursor.executemany('INSERT INTO Benefit_Groups VALUES (?, ?, ?)', groups_data)

# 8. Benefit_Items 적재
items_data = [
    # 2523 (LG U+ 우리카드)
    (2523, 'LGU+', 'LG U+ 통신요금 자동이체 결제액 100% 할인', None, json.dumps([{"perf": 300000, "rate": 1.0}]), json.dumps([{"perf": 300000, "limit": 10000}, {"perf": 700000, "limit": 15000}]), 0, 0),
    (2523, '영화', '12,000원 이상 결제 시 3,000원 정액 청구할인', None, json.dumps([{"perf": 300000, "rate": 0}]), '3000', 3000, 12000),
    (2523, '카페', '스타벅스, 투썸플레이스 20% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.20}]), '10000', 0, 0),
    (2523, '패밀리레스토랑', '아웃백, TGIF 10% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.10}]), '10000', 0, 0),

    # 2525 (만나 우리카드)
    (2525, '주유소', '리터당 60~100원 할인 (유가 1,600원 기준 % 치환)', None, json.dumps([{"perf": 300000, "rate": 0.0375}, {"perf": 500000, "rate": 0.0500}, {"perf": 1000000, "rate": 0.0625}]), json.dumps([{"perf": 300000, "limit": 7000}, {"perf": 500000, "limit": 10000}, {"perf": 1000000, "limit": 15000}]), 0, 0),
    (2525, '대중교통', '버스, 지하철 10% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.10}]), '3000', 0, 0),
    (2525, '카페', '스타벅스, 폴바셋 10% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.10}]), '5000', 0, 0),
    (2525, '모든가맹점', '국내 가맹점 0.7% 기본 할인', None, json.dumps([{"perf": 0, "rate": 0.007}]), '-1', 0, 0),

    # 2862 (MG+ S 하나카드)
    (2862, '간편결제', '네이버페이 등 10% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.10}]), '-1', 0, 0),
    (2862, '디지털구독', '유튜브 등 50% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.50}]), '-1', 0, 0),

    # 2300 (내맘대로 쁨 카드)
    (2300, '모든가맹점', '국내외 전 가맹점 0.5% 적립', None, json.dumps([{"perf": 0, "rate": 0.005}]), '-1', 0, 0),
    (2300, '간편결제 (기본)', '페이결제 건 1% 적립', None, json.dumps([{"perf": 0, "rate": 0.010}]), '-1', 0, 0),
    (2300, '간편결제 (추가)', '페이결제 0.5% 추가 적립', None, json.dumps([{"perf": 0, "rate": 0.005}]), '5000', 0, 0),
    (2300, '쇼핑 (쁨 서비스)', '백화점, 홈쇼핑, 마트 5% 적립', 'group_ppeum', json.dumps([{"perf": 500000, "rate": 0.050}]), '-1', 0, 0),
    (2300, '트렌디쇼핑 (쁨 서비스)', '패션, 명품 5% 적립', 'group_ppeum', json.dumps([{"perf": 500000, "rate": 0.050}]), '-1', 0, 0),
    (2300, '모빌리티 (쁨 서비스)', '주유 5%, EV충전 20% 적립', 'group_ppeum', json.dumps([{"perf": 500000, "rate": 0.050}]), '-1', 0, 0),
    (2300, '에듀 (내맘대로 서비스)', '학원, 헬스장 5% 적립', None, json.dumps([{"perf": 500000, "rate": 0.050}]), json.dumps([{"perf": 500000, "limit": 10000}, {"perf": 1000000, "limit": 20000}]), 0, 0),
    (2300, '골프 (내맘대로 서비스)', '골프장 10% 적립', None, json.dumps([{"perf": 500000, "rate": 0.100}]), json.dumps([{"perf": 500000, "limit": 10000}, {"perf": 1000000, "limit": 20000}]), 0, 0),
    (2300, '여행 (내맘대로 서비스)', '숙박, KTX, 항공 10% 적립', None, json.dumps([{"perf": 500000, "rate": 0.100}]), json.dumps([{"perf": 500000, "limit": 10000}]), 0, 0),
    (2300, '케어 (내맘대로 서비스)', '병원, 동물병원 10% 적립', None, json.dumps([{"perf": 500000, "rate": 0.100}]), json.dumps([{"perf": 500000, "limit": 10000}]), 0, 0),

    # 2455 (카카오뱅크 우리카드)
    (2455, '카카오톡 선물하기', '카카오톡 선물하기 50% 할인', None, json.dumps([{"perf": 400000, "rate": 0.50}]), '10000', 0, 0),
    (2455, '카카오페이', '카카오페이 결제 10% 할인', None, json.dumps([{"perf": 400000, "rate": 0.10}]), '10000', 0, 0)
]

cursor.executemany('''
    INSERT INTO Benefit_Items (card_id, title, detail, group_id, rate, item_limit, fixedAmount, minPayment) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
''', items_data)

# 9. 커밋 및 종료
conn.commit()
conn.close()

print("[SUCCESS] Dual Schema SQLite DB built successfully.")

