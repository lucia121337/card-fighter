# -*- coding: utf-8 -*-
"""M2: 요율 적재 — benefits_structured.json → DB 행. (idempotent)

(card_idx, 혜택카테고리) 기준 매핑. 카테고리 어휘는 JSON·DB 동일 체계.
  - category_rates[cat]        → 요율(percent)
  - fixed_discounts[cat]       → 정액원 + 카테고리_전월실적 (fixed_won)
  - fuel_discounts             → '주유' 행 리터당원 (won_per_liter)
  - 카드 단위(대표행 1개: 모든가맹점 > 무실적):
      base_rate     → percent
      points_per_won→ point_per_won   ← (M2 최초 누락 → 포인트카드 요율 0이던 버그 수정)
      miles_per_won → mile_per_won ('항공마일리지' 행 있으면 그쪽 우선)

대표행/주유행/마일행이 없으면 --insert-missing 시 행을 추가한다(이미 있으면 재삽입 안 함=idempotent).

기본 dry-run. 적용은 --apply. 누락행 삽입은 --insert-missing.
"""
import sqlite3, json, io, os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')
DB = os.path.join(ROOT, 'benefit_calculator_wide.sqlite')
JS = os.path.join(ROOT, 'benefits_structured.json')
META = ['card_idx', '카드사', '카드명', '신용체크', '카드유형']


def num(v):
    return v if isinstance(v, (int, float)) else 0


def per_category(b, cat):
    """카테고리 고유 매핑(모호성 없음): percent/fixed/fuel. 대표행류(base/point/mile)는 제외."""
    cr = b.get('category_rates') or {}
    if cat in cr and num(cr[cat]) > 0:
        return dict(요율=num(cr[cat]), 요율종류='percent', 카테고리_전월실적=int(num(b.get('pre_month_money'))))
    for f in (b.get('fixed_discounts') or []):
        if (f.get('category') or '') == cat and num(f.get('won')) > 0:
            return dict(정액원=int(num(f.get('won'))), 요율종류='fixed_won',
                        카테고리_전월실적=int(num(f.get('min_prev_spend'))))
    if cat == '주유':
        best = 0; mp = 0
        for f in (b.get('fuel_discounts') or []):
            if num(f.get('won_per_liter')) > best:
                best = num(f.get('won_per_liter')); mp = num(f.get('min_prev_spend'))
        if best > 0:
            return dict(리터당원=int(best), 요율종류='won_per_liter', 카테고리_전월실적=int(mp))
    return None


def card_level(b):
    """카드 단위 대표 적립/기본율 (대표행 1곳에만). 우선순위: base > point (할인이 우선)."""
    if num(b.get('base_rate')) > 0:
        return dict(요율=num(b.get('base_rate')), 요율종류='percent', 카테고리_전월실적=0)
    if num(b.get('points_per_won')) > 0:
        return dict(요율=num(b.get('points_per_won')), 요율종류='point_per_won',
                    카테고리_전월실적=int(num(b.get('pre_month_money'))))
    return None


def apply_set(cur, seq, vals):
    cols = {'요율': None, '요율종류': None, '정액원': None, '리터당원': None, '카테고리_전월실적': None}
    cols.update(vals)
    sets = ', '.join(f'"{k}"=?' for k in cols)
    cur.execute(f'UPDATE 혜택계산기 SET {sets} WHERE seq=?', list(cols.values()) + [seq])


def ensure_row(cur, base_row, cat):
    """(idx,cat) 행이 없으면 만들고 seq 반환. 있으면 기존 seq."""
    idx = base_row['card_idx']
    ex = cur.execute('SELECT seq FROM 혜택계산기 WHERE card_idx=? AND 혜택카테고리=?', (idx, cat)).fetchone()
    if ex:
        return ex[0]
    cols = META + ['혜택카테고리', '구간출처', '검수상태']
    vals = [base_row[c] for c in META] + [cat, 'json-insert', 'unreviewed']
    ph = ','.join('?' * len(cols))
    cur.execute(f'INSERT INTO 혜택계산기 ({",".join(chr(34)+c+chr(34) for c in cols)}) VALUES ({ph})', vals)
    return cur.lastrowid


def main():
    apply = '--apply' in sys.argv
    insert_missing = '--insert-missing' in sys.argv
    js = json.load(io.open(JS, encoding='utf-8'))
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    cur = con.cursor()

    rows = cur.execute('SELECT seq, card_idx, 혜택카테고리 FROM 혜택계산기').fetchall()
    cards = {}
    base_meta = {}
    for r in rows:
        idx = int(r['card_idx'])
        cards.setdefault(idx, {})[r['혜택카테고리']] = r['seq']
    for r in cur.execute('SELECT * FROM 혜택계산기 GROUP BY card_idx'):
        base_meta[int(r['card_idx'])] = r

    stat = {'percent': 0, 'fixed_won': 0, 'won_per_liter': 0, 'point_per_won': 0, 'mile_per_won': 0}
    n_cardlevel = 0; n_missing_fill = 0

    for idx, catmap in cards.items():
        b = js.get(str(idx))
        if not b:
            continue
        # 1) 카테고리 고유 매핑
        for cat, seq in catmap.items():
            v = per_category(b, cat)
            if v:
                stat[v['요율종류']] += 1
                if apply:
                    apply_set(cur, seq, v)
        # 2) 마일: '항공마일리지' 행
        if num(b.get('miles_per_won')) > 0:
            seq = catmap.get('항공마일리지')
            if seq is None and insert_missing and apply:
                seq = ensure_row(cur, base_meta[idx], '항공마일리지'); catmap['항공마일리지'] = seq
            if seq is not None:
                stat['mile_per_won'] += 1
                if apply:
                    apply_set(cur, seq, dict(요율=num(b.get('miles_per_won')), 요율종류='mile_per_won',
                                             카테고리_전월실적=int(num(b.get('pre_month_money')))))
        # 3) 카드 단위 base/point → 대표행 1곳 (모든가맹점 > 무실적)
        cl = card_level(b)
        if cl:
            target = catmap.get('모든가맹점') or catmap.get('무실적')
            if target is None and insert_missing and apply:
                target = ensure_row(cur, base_meta[idx], '모든가맹점'); catmap['모든가맹점'] = target
            if target is not None:
                stat[cl['요율종류']] += 1; n_cardlevel += 1
                if apply:
                    apply_set(cur, target, cl)

    print('요율 종류별 적재:', stat)
    print('카드단위(base/point) 적재:', n_cardlevel)
    if apply:
        con.commit(); print('[적용] 완료.')
    else:
        print('[dry-run] 변경 없음. 적용: --apply  (누락행 추가: --insert-missing)')


if __name__ == '__main__':
    main()
