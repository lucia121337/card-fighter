# -*- coding: utf-8 -*-
"""M1: 계산·검수용 컬럼 추가 (idempotent).

스펙 §5. 이미 있으면 건너뛴다.
사용: python scripts/db_add_columns.py
"""
import sqlite3, os

DB = os.path.join(os.path.dirname(__file__), '..', 'benefit_calculator_wide.sqlite')

# (컬럼명, 타입, 기본값SQL)
COLS = [
    ('요율', 'REAL', None),
    ('요율종류', 'TEXT', None),           # percent / fixed_won / won_per_liter / mile_per_won / point_per_won
    ('정액원', 'INTEGER', None),
    ('리터당원', 'INTEGER', None),
    ('카테고리_전월실적', 'INTEGER', None),
    ('구간출처', 'TEXT', None),           # db-reparse / db-est / human / null
    ('검수상태', 'TEXT', "'unreviewed'"),  # unreviewed / reviewing / done
    ('검수자', 'TEXT', None),
    ('검수일', 'TEXT', None),
    ('검수메모', 'TEXT', None),
]


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    existing = {c[1] for c in cur.execute('PRAGMA table_info(혜택계산기)')}
    added = []
    for name, typ, default in COLS:
        if name in existing:
            continue
        ddl = f'ALTER TABLE 혜택계산기 ADD COLUMN "{name}" {typ}'
        if default is not None:
            ddl += f' DEFAULT {default}'
        cur.execute(ddl)
        added.append(name)
    con.commit()
    print('추가된 컬럼:', added or '(없음 — 이미 존재)')
    print('현재 컬럼수:', len(list(cur.execute('PRAGMA table_info(혜택계산기)'))))


if __name__ == '__main__':
    main()
