# -*- coding: utf-8 -*-
"""상세내용 보강 2차 — 원문 key_benefit 매칭 실패한 정액/주유/마일/포인트 행을
benefits_structured.json의 구조화 텍스트(targets·point_name·airline)로 채운다.
percent(카테고리 할인율)는 합성이 요율 재진술뿐이라 제외(빈칸 유지, review.html이 원문 병기).

빈 상세내용만 채운다. 기본 dry-run, 적용 --apply.
"""
import sqlite3, json, io, os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')
DB = os.path.join(ROOT, 'benefit_calculator_wide.sqlite')
JS = os.path.join(ROOT, 'benefits_structured.json')


def num(v):
    return v if isinstance(v, (int, float)) else 0


def desc_for(b, cat, kind):
    if kind == 'fixed_won':
        for f in (b.get('fixed_discounts') or []):
            if (f.get('category') or '') == cat and num(f.get('won')) > 0:
                t = f.get('targets') or ''
                lim = f.get('count_limit') or ''
                return f"정액 {int(num(f.get('won'))):,}원 할인" + (f" ({t})" if t else '') + (f" [{lim}]" if lim else '')
    if kind == 'won_per_liter':
        for f in (b.get('fuel_discounts') or []):
            if num(f.get('won_per_liter')) > 0:
                t = f.get('targets') or ''
                return f"주유 리터당 {int(num(f.get('won_per_liter')))}원 할인" + (f" ({t})" if t else '')
    if kind == 'mile_per_won' and num(b.get('miles_per_won')) > 0:
        air = b.get('airline') or ''
        return f"{air+' ' if air else ''}마일 적립 {round(num(b.get('miles_per_won'))*1000,2)}마일/1천원"
    if kind == 'point_per_won' and num(b.get('points_per_won')) > 0:
        pn = b.get('point_name') or '포인트'
        return f"{pn} 적립 {round(num(b.get('points_per_won'))*1000,2)}{pn}/1천원"
    return None


def main():
    apply = '--apply' in sys.argv
    js = json.load(io.open(JS, encoding='utf-8'))
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    cur = con.cursor()
    rows = cur.execute("""SELECT seq, card_idx, 혜택카테고리, 요율종류 FROM 혜택계산기
                          WHERE (상세내용 IS NULL OR TRIM(상세내용)='')
                            AND 요율종류 IN ('fixed_won','won_per_liter','mile_per_won','point_per_won')""").fetchall()
    updates = []
    for r in rows:
        b = js.get(str(int(r['card_idx'])))
        if not b:
            continue
        d = desc_for(b, r['혜택카테고리'], r['요율종류'])
        if d:
            updates.append((d[:400], r['seq']))
    print(f'정액/주유/마일/포인트 상세내용 채울 행: {len(updates)} / 대상 {len(rows)}')
    if apply:
        cur.executemany('UPDATE 혜택계산기 SET 상세내용=? WHERE seq=?', updates)
        con.commit(); print('[적용] 완료.')
    else:
        for d, seq in updates[:6]:
            print('  ', d[:90])
        print('적용: --apply')


if __name__ == '__main__':
    main()
