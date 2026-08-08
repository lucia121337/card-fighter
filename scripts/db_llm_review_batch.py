# -*- coding: utf-8 -*-
"""LLM 맥락검수 배치 — 원문을 읽고 사람처럼 이해해서 구간을 채운 결과.
구간출처='llm-review'(무한도는 'llm-review-nocap'), 검수상태='reviewing'(사람 최종확인 후 done→계산기 반영).
근거는 검수메모에 원문 요약. 확신하는 카드만 포함.
"""
import sqlite3, os

DB = os.path.join(os.path.dirname(__file__), '..', 'benefit_calculator_wide.sqlite')
NG_TH = [f'구간{i}_전월실적' for i in range(1, 11)]
NG_CAP = [f'구간{i}_한도' for i in range(1, 11)]

# (idx, 카테고리, [[전월실적,한도]...], 메모)
FILLS = [
    (89, '주유', [[300000, 20000], [1000000, 30000]], '원문: 전월30만~100만 월할인한도 2만, 100만↑ 3만 (Most 140→200/SK 60→80원L)'),
    (89, 'OTT/영화/문화', [[300000, 5000]], '원문: 영화관 5,000원 청구할인, 월한도 5천, 전월30만↑'),
    (127, '교통', [[400000, 15000], [800000, 25000]], '원문: Basic(교통·통신·주유) 통합 적립한도 40만↑ 1.5만점 / 80만↑ 2.5만점'),
    (127, '통신', [[400000, 15000], [800000, 25000]], 'Basic 통합 적립한도(교통·통신·주유 공유)'),
    (127, '주유', [[400000, 15000], [800000, 25000]], 'Basic 통합 적립한도(공유). 별도 주유이용한도 20/30만'),
    (191, '카페/디저트', [[400000, 10000]], '원문: 카페·영화 통합할인한도 월 1만, 전월40만↑, 1만원↑ 이용건'),
    (191, 'OTT/영화/문화', [[400000, 10000]], '카페·영화 통합할인한도 월 1만(공유)'),
]
# (idx, [카테고리...], 메모) — 원문상 한도 없음(무한도) 확인 → 구간 비움
NOCAP = [
    (333, ['모든가맹점', '교통', '통신', '카페/디저트', 'OTT/영화/문화', '쇼핑'], '원문: 적립한도 제한없음(무한도)'),
    (333, ['마트/편의점'], '원문: GS25 0.3% 적립, 이용금액 월 20만까지'),
]


def set_tiers(cur, idx, cat, tiers, memo):
    cols = {}
    for i in range(10):
        cols[NG_TH[i]] = tiers[i][0] if i < len(tiers) else None
        cols[NG_CAP[i]] = tiers[i][1] if i < len(tiers) else None
    cols['구간출처'] = 'llm-review'
    cols['검수상태'] = 'reviewing'
    cols['검수메모'] = memo
    sets = ', '.join(f'"{k}"=?' for k in cols)
    cur.execute(f'UPDATE 혜택계산기 SET {sets} WHERE card_idx=? AND 혜택카테고리=?',
                list(cols.values()) + [idx, cat])
    return cur.rowcount


def main():
    con = sqlite3.connect(DB); cur = con.cursor()
    n = 0
    for idx, cat, tiers, memo in FILLS:
        n += set_tiers(cur, idx, cat, tiers, memo)
    m = 0
    for idx, cats, memo in NOCAP:
        for cat in cats:
            r = cur.execute("""UPDATE 혜택계산기 SET 구간출처='llm-review-nocap', 검수상태='reviewing', 검수메모=?
                               WHERE card_idx=? AND 혜택카테고리=?""", (memo, idx, cat))
            m += r.rowcount
    con.commit()
    print(f'구간 채움(llm-review): {n}행 · 무한도 확인(llm-review-nocap): {m}행')
    print('검수상태=reviewing (사람 최종확인 후 done 처리 시 계산기 반영)')


if __name__ == '__main__':
    main()
