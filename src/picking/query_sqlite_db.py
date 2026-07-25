import sqlite3
import os
import json

db_path = os.path.join(os.path.dirname(__file__), 'calculator_db.sqlite')
if not os.path.exists(db_path):
    db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'calculator_db.sqlite')

print(f"=== [Physical SQLite Database Query Verification] ===")
print(f"Target DB Path: {os.path.abspath(db_path)}\n")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Verify Master Tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print(f"1. Existing Master Tables in SQLite DB: {tables}")

# 2. SELECT Query on Cards table
print("\n2. [SELECT * FROM Cards WHERE is_calc_supported = 'TRUE']")
cursor.execute("SELECT card_id, card_name, company, annual_fee, is_calc_supported FROM Cards WHERE is_calc_supported = 'TRUE';")
cards = cursor.fetchall()
for c in cards:
    print(f"   - Card ID: {c[0]} | Name: {c[1]} | Company: {c[2]} | Fee: {c[3]}원 | Supported: {c[4]}")

# 3. SELECT Query on Performance_Tiers table
print("\n3. [SELECT * FROM Performance_Tiers]")
cursor.execute("SELECT tier_id, card_id, perf, total_limit FROM Performance_Tiers;")
tiers = cursor.fetchall()
for t in tiers:
    print(f"   - Tier ID: {t[0]} | Card ID: {t[1]} | Perf: {t[2]:,}원 | Total Limit: {t[3]:,}원")

# 4. SELECT Query on Benefit_Items table for 7 Golden Cards
print("\n4. [SELECT * FROM Benefit_Items GROUP BY card_id]")
cursor.execute("SELECT item_id, card_id, title, detail, rate, item_limit FROM Benefit_Items;")
items = cursor.fetchall()
for it in items:
    print(f"   - Item ID: {it[0]} | Card ID: {it[1]} | Title: {it[2]} | Detail: {it[3]} | Rate: {it[4]} | Limit: {it[5]}")

conn.close()
print("\n==========================================")
