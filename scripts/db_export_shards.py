# -*- coding: utf-8 -*-
"""M5: DB → 사람별 검수 샤드 JSON 내보내기 (3인 균등 분담).

카드사 단위로 장수를 ~균등하게 3개 버킷에 그리디 배분(대형사도 통째 1인에게).
각 샤드는 review.html이 읽어 원문(card_detail) 대조 검수에 쓴다.

출력: data/review_shards/담당{1,2,3}.json  +  data/review_shards/_assignment.json

사용: python scripts/db_export_shards.py [--owners 이름1,이름2,이름3]
"""
import sqlite3, json, io, os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')
DB = os.path.join(ROOT, 'benefit_calculator_wide.sqlite')
OUTDIR = os.path.join(ROOT, 'data', 'review_shards')
# 인원수: --owners 이름목록 우선, 아니면 --n 값, 기본 5
N = (len(sys.argv[sys.argv.index('--owners') + 1].split(',')) if '--owners' in sys.argv
     else int(sys.argv[sys.argv.index('--n') + 1]) if '--n' in sys.argv else 5)


def owners():
    if '--owners' in sys.argv:
        return [s.strip() for s in sys.argv[sys.argv.index('--owners') + 1].split(',')]
    return [f'담당{i+1}' for i in range(N)]


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    cur = con.cursor()

    names = owners()

    # 카드별 행 모으기
    rows = cur.execute('''SELECT card_idx, 카드사, 카드명, 혜택카테고리, 요율, 요율종류,
                                 정액원, 리터당원, 카테고리_전월실적, 검수상태, 검수메모,
                                 구간출처, 상세내용,
                                 구간1_전월실적,구간1_한도,구간2_전월실적,구간2_한도,
                                 구간3_전월실적,구간3_한도,구간4_전월실적,구간4_한도,
                                 구간5_전월실적,구간5_한도,구간6_전월실적,구간6_한도
                          FROM 혜택계산기 ORDER BY card_idx''').fetchall()
    cards = {}
    for r in rows:
        idx = int(r['card_idx'])
        tiers = [[r[f'구간{i}_전월실적'], r[f'구간{i}_한도']] for i in range(1, 7)
                 if r[f'구간{i}_전월실적'] is not None and r[f'구간{i}_한도'] is not None]
        c = cards.setdefault(idx, {'idx': idx, 'company': r['카드사'], 'name': r['카드명'], 'rows': []})
        c['rows'].append({
            'cat': r['혜택카테고리'], '요율': r['요율'], '종류': r['요율종류'],
            '정액원': r['정액원'], '리터당원': r['리터당원'], '전월실적': r['카테고리_전월실적'],
            '구간': tiers, '출처': r['구간출처'] or '', '상세': (r['상세내용'] or '')[:300],
            '검수상태': r['검수상태'] or 'unreviewed', '메모': r['검수메모'] or ''
        })

    # 활성 목록(cards.json, main 정식)만 남긴다 — 단종 카드 제외
    active = set(int(c['idx']) for c in json.load(io.open(os.path.join(ROOT, 'cards.json'), encoding='utf-8')))
    before = len(cards)
    cards = {idx: c for idx, c in cards.items() if idx in active}
    print(f'[active] 단종 제외: {before} → {len(cards)}장 (cards.json 활성목록 기준)')

    # JSON의 계산불가 혜택(마일·포인트·바우처·서비스·무이자)을 카드에 붙인다 — review에서 표시용
    js = json.load(io.open(os.path.join(ROOT, 'benefits_structured.json'), encoding='utf-8'))

    def num(v):
        return v if isinstance(v, (int, float)) else 0
    for idx, cobj in cards.items():
        b = js.get(str(idx)) or {}
        ex = {}
        if num(b.get('miles_per_won')) > 0:
            ex['mile'] = f"{b.get('airline') or '카드'} {round(num(b['miles_per_won'])*1500,2)}마일/1500원"
        if num(b.get('points_per_won')) > 0:
            ex['point'] = f"{b.get('point_name') or '포인트'} {round(num(b['points_per_won'])*1000,2)}P/1천원"
        if num(b.get('voucher_won')) > 0:
            ex['voucher'] = f"연 {int(num(b['voucher_won'])):,}원 바우처 ({(b.get('voucher_label') or '')[:30]})"
        svc = [s.get('label', '') for s in (b.get('service_benefits') or []) if s.get('label')]
        if svc:
            ex['services'] = svc[:6]
        if b.get('installment_free'):
            ex['installment'] = (b['installment_free'].get('label') or '무이자할부')
        cobj['extras'] = ex

    # --needs-review: 사람 판단 필요분만(자동 json-*·무혜택 제외)
    needs_review = '--needs-review' in sys.argv
    NEEDS = {'llm-review-complex', 'db-est', 'llm-review', 'llm-review-nocap'}
    if needs_review:
        keep = set(r['card_idx'] for r in cur.execute(
            'SELECT DISTINCT card_idx FROM 혜택계산기 WHERE 구간출처 IN (%s)' %
            ','.join('?' * len(NEEDS)), tuple(NEEDS)))
        cards = {idx: c for idx, c in cards.items() if idx in keep}
        print(f'[needs-review] 검수 대상 {len(cards)}장만 포함(자동 채움·무혜택 제외)')

    # 카드사를 N명에게 균등 배분 — 최종(활성+검수대상) 카드수 기준 (회사 단위 유지)
    from collections import Counter
    comp_cnt = Counter(c['company'] for c in cards.values())
    buckets = [[] for _ in range(N)]; load = [0] * N
    for company, cnt in comp_cnt.most_common():
        j = load.index(min(load)); buckets[j].append(company); load[j] += cnt
    assign, comp2owner = {}, {}
    for i, comps in enumerate(buckets):
        assign[names[i]] = {'companies': comps}
        for co in comps:
            comp2owner[co] = names[i]

    # 담당별로 샤드 쓰기
    per = {name: [] for name in names}
    for idx, c in cards.items():
        owner = comp2owner.get(c['company'], names[0])
        per[owner].append(c)

    for name in names:
        clist = sorted(per[name], key=lambda x: x['idx'])
        shard = {'owner': name, 'companies': assign[name]['companies'],
                 'card_count': len(clist), 'cards': clist}
        json.dump(shard, io.open(os.path.join(OUTDIR, f'{name}.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)

    for name in names:
        assign[name]['review_cards'] = len(per[name])
    json.dump({'owners': assign, 'total_cards': sum(len(per[n]) for n in names)},
              io.open(os.path.join(OUTDIR, '_assignment.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    print(f'=== {N}인 분담 (검수 대상 균등) ===')
    for name in names:
        print(f'  {name}: 검수 {len(per[name])}장  ← {", ".join(assign[name]["companies"][:6])}'
              + (' …' if len(assign[name]['companies']) > 6 else ''))
    print(f'  검수 합계: {sum(len(per[n]) for n in names)}장')
    print(f'샤드 파일: {OUTDIR}')


if __name__ == '__main__':
    main()
