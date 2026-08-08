# -*- coding: utf-8 -*-
"""M1: 오염된 구간(tiered cap) 제거.

benefit_calculator_wide.sqlite `혜택계산기`의 구간1~10_전월실적/한도 중
위생 게이트를 통과 못한(파싱 오염) 구간을 비운다(null).

위생 게이트(구간 집합 단위):
  - 모든 한도 > 0
  - 모든 한도 <= 300,000 (통합 월 할인한도 상한 가정; 초과는 병합 아티팩트)
  - 모든 전월실적 0 <= th <= 3,000,000
  - 전월실적 오름차순
  - 한도 비감소(실적↑ → 한도 같거나↑)

기본은 dry-run(변경 안 함). 실제 적용은 --apply.
원문(card_detail)은 건드리지 않으므로 재파싱으로 언제든 복구 가능.

사용:
  python scripts/db_clean_tiers.py            # dry-run
  python scripts/db_clean_tiers.py --apply     # 적용
"""
import sqlite3, sys, os

DB = os.path.join(os.path.dirname(__file__), '..', 'benefit_calculator_wide.sqlite')
CAP_MIN = 1_000        # 월 할인한도 최소 현실값(1·5·50원 등 자릿수 유출 아티팩트 제거)
CAP_MAX = 150_000      # 통합 월 할인한도 상한 가정(20만·30만 등 요율 유출 제거)
TH_MAX = 3_000_000
NG = [f'구간{i}_전월실적' for i in range(1, 11)] + [f'구간{i}_한도' for i in range(1, 11)]


def tiers_of_row(r):
    return [(r[f'구간{i}_전월실적'], r[f'구간{i}_한도'])
            for i in range(1, 11)
            if r[f'구간{i}_전월실적'] is not None and r[f'구간{i}_한도'] is not None]


def classify(tiers):
    if not tiers:
        return 'empty', None
    ths = [t[0] for t in tiers]
    caps = [t[1] for t in tiers]
    if any(c < CAP_MIN for c in caps):
        return 'dirty', 'cap<1천'
    if any(c > CAP_MAX for c in caps):
        return 'dirty', 'cap>15만'
    if any(th < 0 or th > TH_MAX for th in ths):
        return 'dirty', 'th범위'
    if ths != sorted(ths):
        return 'dirty', 'th비정렬'
    if caps != sorted(caps):
        return 'dirty', 'cap비단조'
    return 'clean', None


def main():
    apply = '--apply' in sys.argv
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    rows = cur.execute('SELECT * FROM 혜택계산기').fetchall()

    stat = {'empty': 0, 'clean': 0, 'dirty': 0}
    reasons = {}
    dirty_rowids = []
    dirty_cards = set()
    examples = []
    for r in rows:
        kind, why = classify(tiers_of_row(r))
        stat[kind] += 1
        if kind == 'dirty':
            reasons[why] = reasons.get(why, 0) + 1
            dirty_rowids.append(r['seq'])
            dirty_cards.add(r['card_idx'])
            if len(examples) < 8:
                examples.append((r['card_idx'], why, tiers_of_row(r)[:3]))

    print(f'전체 행: {len(rows)}')
    print(f'  구간 없음(empty): {stat["empty"]}')
    print(f'  clean(유지): {stat["clean"]}')
    print(f'  dirty(비울 대상): {stat["dirty"]}  (카드 {len(dirty_cards)}종)')
    print(f'  오염 사유: {reasons}')
    print('  예시:')
    for e in examples:
        print(f'    idx {e[0]} ({e[1]}) {e[2]}')

    if not apply:
        print('\n[dry-run] 변경 없음. 적용하려면 --apply')
        return

    set_clause = ', '.join(f'"{c}"=NULL' for c in NG)
    for rid in dirty_rowids:
        cur.execute(f'UPDATE 혜택계산기 SET {set_clause} WHERE seq=?', (rid,))
    con.commit()
    print(f'\n[적용] {len(dirty_rowids)}개 행의 구간을 비웠습니다.')


if __name__ == '__main__':
    main()
