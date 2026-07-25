import sqlite3
import json
import os

# Create SQLite database in both root and src/picking for double verification
db_paths = [
    os.path.join(os.path.dirname(__file__), 'calculator_db.sqlite'),
    os.path.join(os.path.dirname(__file__), '..', '..', 'calculator_db.sqlite')
]

for db_path in db_paths:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Clear existing tables
    cursor.executescript('''
        DROP TABLE IF EXISTS All_Cards_Raw;
        DROP TABLE IF EXISTS Benefit_Items;
        DROP TABLE IF EXISTS Benefit_Groups;
        DROP TABLE IF EXISTS Performance_Tiers;
        DROP TABLE IF EXISTS Cards;
    ''')

    # 2. Create Master Tables
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
            top_benefit TEXT,
            key_benefit TEXT,
            benefit_categories TEXT,
            detail_url TEXT,
            top_benefit_summary TEXT,
            detailed_benefits TEXT,
            item_limit TEXT,
            group_id TEXT,
            group_limit TEXT,
            total_limit_tiers TEXT,
            is_calc_supported TEXT DEFAULT 'FALSE'
        );

        CREATE TABLE Cards (
            card_id INTEGER PRIMARY KEY,
            card_name TEXT,
            company TEXT,
            annual_fee INTEGER,
            is_calc_supported TEXT DEFAULT 'TRUE'
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
            rate TEXT,
            item_limit TEXT,
            fixedAmount INTEGER,
            minPayment INTEGER,
            FOREIGN KEY(card_id) REFERENCES Cards(card_id),
            FOREIGN KEY(group_id) REFERENCES Benefit_Groups(group_id)
        );
    ''')

    # 3. Insert Raw Cards from cards_full.json
    cards_full_path = os.path.join(os.path.dirname(__file__), '..', '..', 'cards_full.json')
    if os.path.exists(cards_full_path):
        with open(cards_full_path, 'r', encoding='utf-8') as f:
            full_cards = json.load(f)

        raw_insert_data = []
        golden_idxs = [2455, 2718, 2522, 2296, 2297, 2298, 2299]
        for card in full_cards:
            is_calc = 'TRUE' if card.get('idx') in golden_idxs else 'FALSE'
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
                json.dumps(card.get('total_limit_tiers'), ensure_ascii=False) if isinstance(card.get('total_limit_tiers'), (dict, list)) else card.get('total_limit_tiers'),
                is_calc
            ))

        cursor.executemany('''
            INSERT INTO All_Cards_Raw (
                idx, card_name, company, card_type, cate, brands, annual_fee, annual_fee_detail,
                pre_month_money, pre_month_condition, only_online, release_dt, card_img, top_benefit,
                key_benefit, benefit_categories, detail_url, top_benefit_summary, detailed_benefits,
                item_limit, group_id, group_limit, total_limit_tiers, is_calc_supported
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', raw_insert_data)

    # 4. Insert Cards (7 Golden Cards)
    cards_data = [
        (2455, '카카오뱅크 우리카드', '우리카드', 12000, 'TRUE'),
        (2718, '모바일엔디지로카', '롯데카드', 15000, 'TRUE'),
        (2522, 'KT NU우리카드', '우리카드', 20000, 'TRUE'),
        (2296, '톡톡M 카드', 'KB국민카드', 12000, 'TRUE'),
        (2297, '톡톡F 카드', 'KB국민카드', 12000, 'TRUE'),
        (2298, '톡톡O 카드', 'KB국민카드', 12000, 'TRUE'),
        (2299, '톡톡D 카드', 'KB국민카드', 12000, 'TRUE')
    ]
    cursor.executemany('INSERT INTO Cards VALUES (?, ?, ?, ?, ?)', cards_data)

    # 5. Performance_Tiers
    tiers_data = [
        (2718, 400000, 18000),
        (2718, 800000, 20000),
        (2522, 400000, 10000),
        (2522, 800000, 15000),
        (2522, 1200000, 20000)
    ]
    cursor.executemany('INSERT INTO Performance_Tiers (card_id, perf, total_limit) VALUES (?, ?, ?)', tiers_data)

    # 6. Benefit_Items
    items_data = [
        # ① 2455 (카카오뱅크 우리카드) - 실적 40만
        (2455, '카카오톡 선물하기', '카카오톡 선물하기 50% 할인', None, json.dumps([{"perf": 400000, "rate": 0.50}]), '10000', 0, 0),
        (2455, '카카오페이', '카카오페이 결제 10% 할인', None, json.dumps([{"perf": 400000, "rate": 0.10}]), '10000', 0, 0),

        # ② 2718 (모바일엔디지로카) - 실적 40만/80만
        (2718, '통신요금', 'SKT, KT, LG U+ 및 알뜰폰 이동통신 요금 자동납부 결제일 할인', None, json.dumps([{"perf": 400000, "rate": 1.0}]), json.dumps([{"perf": 400000, "limit": 18000}, {"perf": 800000, "limit": 20000}]), 0, 0),

        # ③ 2522 (KT NU우리카드) - 실적 40만/80만/120만
        (2522, 'KT통신요금', 'KT 통신요금(이동통신, 인터넷, IPTV 등) 자동납부 청구할인', None, json.dumps([{"perf": 400000, "rate": 1.0}]), json.dumps([{"perf": 400000, "limit": 10000}, {"perf": 800000, "limit": 15000}, {"perf": 1200000, "limit": 20000}]), 0, 0),

        # ④ 2296 (톡톡M 카드) - 실적 30만
        (2296, '디지털구독', '멤버십(네이버플러스, 쿠팡 로켓와우 등) 100% 청구할인', None, json.dumps([{"perf": 300000, "rate": 1.0}]), '10000', 0, 0),
        (2296, '간편결제', '온라인 간편결제(KB Pay, 삼성페이, 네이버페이 등) 10% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.10}]), '3000', 0, 0),
        (2296, '편의점', '편의점 업종 5% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.05}]), '3000', 0, 0),
        (2296, '대중교통', '버스, 지하철 5% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.05}]), '3000', 0, 0),

        # ⑤ 2297 (톡톡F 카드) - 실적 30만
        (2297, '쇼핑', '패션플랫폼(지그재그, 무신사, 브랜디, 에이블리) 50% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.50}]), '10000', 0, 0),
        (2297, '간편결제', '온라인 간편결제 10% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.10}]), '3000', 0, 0),
        (2297, '편의점', '편의점 업종 5% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.05}]), '3000', 0, 0),
        (2297, '대중교통', '버스, 지하철 5% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.05}]), '3000', 0, 0),

        # ⑥ 2298 (톡톡O 카드) - 실적 30만
        (2298, '디지털구독', 'OTT 플랫폼(넷플릭스, 디즈니+, 유튜브 프리미엄 등) 100% 청구할인', None, json.dumps([{"perf": 300000, "rate": 1.0}]), '10000', 0, 0),
        (2298, '간편결제', '온라인 간편결제 10% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.10}]), '3000', 0, 0),
        (2298, '편의점', '편의점 업종 5% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.05}]), '3000', 0, 0),
        (2298, '대중교통', '버스, 지하철 5% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.05}]), '3000', 0, 0),

        # ⑦ 2299 (톡톡D 카드) - 실적 30만
        (2299, '배달앱', '배달의민족, 요기요, 쿠팡이츠, 마켓컬리 50% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.50}]), '10000', 0, 0),
        (2299, '간편결제', '온라인 간편결제 10% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.10}]), '3000', 0, 0),
        (2299, '편의점', '편의점 업종 5% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.05}]), '3000', 0, 0),
        (2299, '대중교통', '버스, 지하철 5% 청구할인', None, json.dumps([{"perf": 300000, "rate": 0.05}]), '3000', 0, 0)
    ]

    cursor.executemany('''
        INSERT INTO Benefit_Items (card_id, title, detail, group_id, rate, item_limit, fixedAmount, minPayment) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', items_data)

    conn.commit()
    conn.close()
    print(f"[SUCCESS] Physical SQLite DB built at: {db_path}")
