import sqlite3
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(base_dir, '..', '..'))

db_paths = [
    ("Root SQLite DB", os.path.join(root_dir, 'calculator_db.sqlite')),
    ("Picking Module SQLite DB", os.path.join(base_dir, 'calculator_db.sqlite'))
]

print("==========================================")
print("[DB] SQLite DB Data Mart Validation Report")
print("==========================================")

for label, db_path in db_paths:
    print(f"\n[{label}] {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Cards 테이블 COUNT 조회
    cursor.execute("SELECT COUNT(*) FROM Cards;")
    cards_count = cursor.fetchone()[0]

    # 2. Cards 테이블 is_calc_supported = 'TRUE' COUNT 조회
    cursor.execute("SELECT COUNT(*) FROM Cards WHERE is_calc_supported = 'TRUE';")
    supported_count = cursor.fetchone()[0]

    # 3. Benefit_Items 테이블 COUNT 조회
    cursor.execute("SELECT COUNT(*) FROM Benefit_Items;")
    items_count = cursor.fetchone()[0]

    # 4. Performance_Tiers 테이블 COUNT 조회
    cursor.execute("SELECT COUNT(*) FROM Performance_Tiers;")
    tiers_count = cursor.fetchone()[0]

    # 5. All_Cards_Raw 테이블 COUNT 및 지원 카드 COUNT 조회
    cursor.execute("SELECT COUNT(*) FROM All_Cards_Raw;")
    raw_total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM All_Cards_Raw WHERE is_calc_supported = 'TRUE';")
    raw_supported = cursor.fetchone()[0]

    print(f" 1. SELECT COUNT(*) FROM Cards: {cards_count}개")
    print(f" 2. SELECT COUNT(*) FROM Cards WHERE is_calc_supported = 'TRUE': {supported_count}개")
    print(f" 3. SELECT COUNT(*) FROM Benefit_Items: {items_count}개")
    print(f" 4. SELECT COUNT(*) FROM Performance_Tiers: {tiers_count}개")
    print(f" 5. SELECT COUNT(*) FROM All_Cards_Raw: {raw_total}개 (지원: {raw_supported}개)")

    # 6. 상위 5개 카드 샘플 조회
    print("\n [Cards 테이블 상위 5개 샘플 조회]")
    cursor.execute("SELECT card_id, card_name, company, capping_mode, is_calc_supported FROM Cards LIMIT 5;")
    for row in cursor.fetchall():
        print(f"   - Card ID: {row[0]} | Name: {row[1]} | Company: {row[2]} | CappingMode: {row[3]} | Supported: {row[4]}")

    conn.close()

print("\n==========================================")
print("[SUCCESS] SQLite DB validation completed successfully!")
print("==========================================")
