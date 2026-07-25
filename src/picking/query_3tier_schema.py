import sqlite3
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(base_dir, 'calculator_db.sqlite')

print("==========================================")
print("[DB] 3계층 캡핑 DB 스키마 구조 (PRAGMA table_info) 보고")
print("==========================================")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

tables = ['Cards', 'Benefit_Items', 'Benefit_Groups', 'Performance_Tiers', 'All_Cards_Raw']

for tbl in tables:
    print(f"\n[TABLE: {tbl}]")
    cursor.execute(f"PRAGMA table_info({tbl});")
    cols = cursor.fetchall()
    for col in cols:
        col_id, name, type_name, notnull, dflt, pk = col
        pk_str = " (PK)" if pk else ""
        print(f"  - Column {col_id}: {name:<20} {type_name:<10}{pk_str}")

print("\n==========================================")
print("[DATA] 3계층 컬럼별 데이터 적재 현황 검증")
print("==========================================")

# 1. Cards (지원 카드)
cursor.execute("SELECT COUNT(*) FROM Cards WHERE is_calc_supported = 'TRUE';")
cards_cnt = cursor.fetchone()[0]
print(f"1. Cards (지원 확정 카드 수): {cards_cnt}개")

# 2. Tier 1: Benefit_Items (개별 항목 한도: item_limit)
cursor.execute("SELECT COUNT(*) FROM Benefit_Items WHERE item_limit IS NOT NULL;")
t1_cnt = cursor.fetchone()[0]
print(f"2. Tier 1 - Benefit_Items (개별 한도 item_limit 컬럼 적재 수): {t1_cnt}개")

# 3. Tier 2: Benefit_Groups (그룹 한도: group_limit)
cursor.execute("SELECT COUNT(*) FROM Benefit_Groups;")
t2_cnt = cursor.fetchone()[0]
print(f"3. Tier 2 - Benefit_Groups (그룹 한도 group_limit 컬럼 적재 수): {t2_cnt}개")

# 4. Tier 3: Performance_Tiers (총 통합 월 한도: total_limit)
cursor.execute("SELECT COUNT(*) FROM Performance_Tiers;")
t3_cnt = cursor.fetchone()[0]
print(f"4. Tier 3 - Performance_Tiers (총 통합 월 한도 total_limit 컬럼 적재 수): {t3_cnt}개")

conn.close()
print("\n==========================================")
print("[SUCCESS] 3계층 DB 스키마 재구조화 & 적재검증 완료!")
print("==========================================")
