import sqlite3
import json

def export_db_to_json(db_path='calculator_db.sqlite', json_path='calculator_data.json'):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cards = [dict(row) for row in cursor.execute("SELECT * FROM Cards").fetchall()]
    tiers = [dict(row) for row in cursor.execute("SELECT * FROM Performance_Tiers").fetchall()]
    groups = [dict(row) for row in cursor.execute("SELECT * FROM Benefit_Groups").fetchall()]
    raw_items = [dict(row) for row in cursor.execute("SELECT * FROM Benefit_Items").fetchall()]

    items = []
    for item in raw_items:
        # JSON 문자열 복원
        try:
            item['rate'] = json.loads(item['rate'])
        except (json.JSONDecodeError, TypeError):
            pass

        try:
            item['item_limit'] = json.loads(item['item_limit'])
        except (json.JSONDecodeError, TypeError):
            pass

        items.append(item)

    data = {
        "cards": cards,
        "performance_tiers": tiers,
        "benefit_groups": groups,
        "benefit_items": items
    }

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[SUCCESS] Exported SQLite data to {json_path}")
    conn.close()

if __name__ == '__main__':
    export_db_to_json()
