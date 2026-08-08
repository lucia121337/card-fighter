# -*- coding: utf-8 -*-
"""유령 구간 제거 — 요율/정액/리터 다 없는(실제 금액혜택 없는) 행에 붙은 구간(한도)을 비운다.
카드 통합한도가 서비스·무혜택 카테고리 행에까지 복제된 노이즈. 한도는 '혜택이 있는 행'에만 의미 있음.
행 자체(카테고리/상세내용)는 유지, 구간과 구간출처만 정리. 기본 dry-run, --apply."""
import sqlite3, os, sys

DB = os.path.join(os.path.dirname(__file__), '..', 'benefit_calculator_wide.sqlite')
NG = [f'구간{i}_전월실적' for i in range(1, 11)] + [f'구간{i}_한도' for i in range(1, 11)]

COND = ("요율 IS NULL AND 정액원 IS NULL AND 리터당원 IS NULL "
        "AND 구간1_한도 IS NOT NULL")


def main():
    apply = '--apply' in sys.argv
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row; cur = con.cursor()
    rows = cur.execute(f'SELECT card_idx, 혜택카테고리, 상세내용 FROM 혜택계산기 WHERE {COND}').fetchall()
    print(f'유령 구간 행(요율없는데 구간있음): {len(rows)}')
    for r in rows[:8]:
        cat = r['혜택카테고리']; det = (r['상세내용'] or '(상세없음)')[:40]
        print('  idx', r['card_idx'], cat, '—', det)
    if not apply:
        print('[dry-run] --apply 로 정리')
        return
    sets = ', '.join(f'"{c}"=NULL' for c in NG) + ", 구간출처=NULL"
    n = cur.execute(f'UPDATE 혜택계산기 SET {sets} WHERE {COND}').rowcount
    con.commit()
    print(f'[적용] {n}행의 유령 구간 제거')


if __name__ == '__main__':
    main()
