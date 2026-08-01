import sqlite3
import json
import os

# Build SQLite DB in both root directory and src/picking directory
base_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(base_dir, '..', '..'))

db_paths = [
    os.path.join(root_dir, 'calculator_db.sqlite'),
    os.path.join(base_dir, 'calculator_db.sqlite')
]

# Read calculator_data.json created by auto screening pipeline
json_data_path = os.path.join(base_dir, 'calculator_data.json')
with open(json_data_path, 'r', encoding='utf-8') as f:
    db_data = json.load(f)

cards_full_path = os.path.join(root_dir, 'cards_full.json')
full_cards = []
if os.path.exists(cards_full_path):
    with open(cards_full_path, 'r', encoding='utf-8') as f:
        full_cards = json.load(f)

for db_path in db_paths:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Drop existing tables
    cursor.executescript('''
        DROP TABLE IF EXISTS All_Cards_Raw;
        DROP TABLE IF EXISTS Benefit_Items;
        DROP TABLE IF EXISTS Benefit_Groups;
        DROP TABLE IF EXISTS Performance_Tiers;
        DROP TABLE IF EXISTS Cards;
    ''')

    # 2. Create Master Table Schemas (PRD 3-Tier Capping Compliant)
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
            item_limit TEXT,            -- Tier 1: Item Limit
            group_id TEXT,              -- Tier 2: Group ID
            group_limit TEXT,           -- Tier 2: Group Limit
            total_limit_tiers TEXT,     -- Tier 3: Total Limit Tiers
            is_calc_supported TEXT DEFAULT 'FALSE'
        );

        CREATE TABLE Cards (
            card_id INTEGER PRIMARY KEY,
            card_name TEXT,
            company TEXT,
            annual_fee INTEGER,
            capping_mode TEXT DEFAULT 'HYBRID',
            total_limit_tiers TEXT,
            is_calc_supported TEXT DEFAULT 'TRUE'
        );

        -- Tier 3: Total Monthly Limit Tiers Table
        CREATE TABLE Performance_Tiers (
            tier_id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id INTEGER,
            perf INTEGER,               -- 전월 실적 조건 (원)
            total_limit INTEGER,        -- Tier 3: 총 통합 월 한도 (원/점)
            FOREIGN KEY(card_id) REFERENCES Cards(card_id)
        );

        -- Tier 2: Benefit Group Limit Table
        CREATE TABLE Benefit_Groups (
            group_id TEXT PRIMARY KEY,
            card_id INTEGER,
            group_name TEXT,
            group_limit INTEGER,        -- Tier 2: 그룹별 공통 한도 (원/점)
            FOREIGN KEY(card_id) REFERENCES Cards(card_id)
        );

        -- Tier 1: Individual Item Limit Table
        CREATE TABLE Benefit_Items (
            item_id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id INTEGER,
            title TEXT,
            detail TEXT,
            group_id TEXT,              -- Tier 2 매핑 외래키
            rate TEXT,                  -- 할인/적립 요율 JSON 배열
            item_limit TEXT,            -- Tier 1: 개별 항목 한도 (원/점)
            fixedAmount INTEGER,        -- 정액 할인/적립 금액
            minPayment INTEGER,         -- 최소 결제액 조건
            max_count_per_month INTEGER DEFAULT -1, -- 월 최대 제공 횟수 (-1: 제한없음)
            benefit_type TEXT DEFAULT 'DISCOUNT',  -- 혜택 유형 (DISCOUNT, POINT_REWARD, CASHBACK 등)
            FOREIGN KEY(card_id) REFERENCES Cards(card_id),
            FOREIGN KEY(group_id) REFERENCES Benefit_Groups(group_id)
        );
    ''')

    # 3. Insert All_Cards_Raw Data
    if full_cards:
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
                json.dumps(card.get('total_limit_tiers'), ensure_ascii=False) if isinstance(card.get('total_limit_tiers'), (dict, list)) else card.get('total_limit_tiers'),
                card.get('is_calc_supported', 'FALSE')
            ))

        cursor.executemany('''
            INSERT INTO All_Cards_Raw (
                idx, card_name, company, card_type, cate, brands, annual_fee, annual_fee_detail,
                pre_month_money, pre_month_condition, only_online, release_dt, card_img, top_benefit,
                key_benefit, benefit_categories, detail_url, top_benefit_summary, detailed_benefits,
                item_limit, group_id, group_limit, total_limit_tiers, is_calc_supported
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', raw_insert_data)

    # 4. Insert Cards
    cards_insert_data = [
        (
            c['card_id'],
            c['card_name'],
            c['company'],
            c.get('annual_fee', 0),
            c.get('capping_mode', 'HYBRID'),
            json.dumps(c.get('total_limit_tiers'), ensure_ascii=False) if isinstance(c.get('total_limit_tiers'), (dict, list)) else c.get('total_limit_tiers'),
            c.get('is_calc_supported', 'TRUE')
        )
        for c in db_data['cards']
    ]
    cursor.executemany('INSERT INTO Cards (card_id, card_name, company, annual_fee, capping_mode, total_limit_tiers, is_calc_supported) VALUES (?, ?, ?, ?, ?, ?, ?)', cards_insert_data)

    # 5. Insert Performance_Tiers (Tier 3 Total Limits)
    tiers_insert_data = [
        (t['card_id'], t['perf'], t['total_limit'])
        for t in db_data.get('performance_tiers', [])
    ]
    cursor.executemany('INSERT INTO Performance_Tiers (card_id, perf, total_limit) VALUES (?, ?, ?)', tiers_insert_data)

    # 6. Insert Benefit_Groups (Tier 2 Group Limits)
    groups_insert_data = [
        (g['group_id'], g['card_id'], g.get('group_name', '그룹'), g['group_limit'])
        for g in db_data.get('benefit_groups', [])
    ]
    if groups_insert_data:
        cursor.executemany('INSERT INTO Benefit_Groups VALUES (?, ?, ?, ?)', groups_insert_data)

    # 7. Insert Benefit_Items (Tier 1 Item Limits)
    items_insert_data = [
        (
            b['card_id'],
            b['title'],
            b.get('detail', ''),
            b.get('group_id'),
            json.dumps(b['rate'], ensure_ascii=False) if isinstance(b['rate'], (dict, list)) else str(b['rate']),
            json.dumps(b['item_limit'], ensure_ascii=False) if isinstance(b['item_limit'], (dict, list)) else str(b['item_limit']),
            b.get('fixedAmount', 0),
            b.get('minPayment', 0),
            b.get('max_count_per_month', -1),
            b.get('benefit_type', 'DISCOUNT')
        )
        for b in db_data.get('benefit_items', [])
    ]
    cursor.executemany('''
        INSERT INTO Benefit_Items (card_id, title, detail, group_id, rate, item_limit, fixedAmount, minPayment, max_count_per_month, benefit_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', items_insert_data)

    conn.commit()
    conn.close()
    print(f"[SUCCESS] 3-Tier Capping Structured SQLite DB loaded at: {db_path}")
