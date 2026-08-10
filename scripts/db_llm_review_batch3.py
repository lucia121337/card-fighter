# -*- coding: utf-8 -*-
"""LLM 맥락검수 배치3 (마지막 12장). 검수상태=reviewing."""
import sqlite3, os
DB = os.path.join(os.path.dirname(__file__), '..', 'benefit_calculator_wide.sqlite')
NG_TH = [f'구간{i}_전월실적' for i in range(1, 11)]
NG_CAP = [f'구간{i}_한도' for i in range(1, 11)]

FILLS = [
    (1884, '주유', [[400000, 3000], [700000, 6000]], '주유 3천원 결제일할인 40만↑월1회/70만↑월2회'),
    (1884, '마트/편의점', [[400000, 2000], [700000, 4000]], '할인점 2천원 40만↑1회/70만↑2회'),
    (1884, '병원/약국', [[400000, 1000], [700000, 2000]], '의료 1천원 40만↑1회/70만↑2회'),
    (1884, 'OTT/영화/문화', [[400000, 5000]], '영화 5천원 월1회(40만↑)'),
    (1909, '카페/디저트', [[300000, 4000]], '스타벅스 2천원 월2회(30만↑)'),
    (1909, '교통', [[300000, 2000]], '택시 2천원 월1회(30만↑)'),
    (2181, '레저/스포츠', [[100000, 10000]], '골프 월최대 1만(10만↑)'),
    (2183, '레저/스포츠', [[100000, 10000]], '골프 월최대 1만(10만↑)'),
    (2198, '보험', [[500000, 12000], [1000000, 24000]], '캐롯보험료 50만↑1.2만/100만↑2.4만(24개월내)'),
    (2220, '통신', [[200000, 5000]], '이동통신 5천원 월1회(20만↑)'),
    (2232, '주유', [[300000, 6000]], 'SK 3천원/건 월최대 6천(30만↑)'),
    (2232, '카페/디저트', [[300000, 4000]], '스타벅스/커피빈 월최대 4천(30만↑)'),
]
NOCAP = [
    (1909, ['항공마일리지'], '1마일/1천원 기본적립 한도없음'),
    (2012, ['모든가맹점', '무실적'], '0.2~0.4% 적립 전월실적 무관'),
    (2014, ['모든가맹점', '무실적'], '0.7~0.9% 적립 전월실적 무관'),
    (2181, ['모든가맹점'], '모든가맹점 0.7% 적립/캐시백 한도없음'),
    (2183, ['모든가맹점'], '모든가맹점 0.7% 적립/캐시백 한도없음'),
    (2198, ['모든가맹점'], '업종별 0.5~3% M포인트(당월 rate)'),
    (2211, ['모든가맹점', '무실적'], '기본0.8%+플러스1.5% 할인한도 없음'),
    (2232, ['모든가맹점', '무실적'], '하나머니 기본적립 한도없음(실적별 rate)'),
    (2259, ['모든가맹점'], '기본 1% 적립(당월 rate), 한도없음'),
]
COMPLEX = [
    (1926, ['주유'], 'E1 충전소 87점/L 적립(이용액 기준)'),
    (2220, ['주유'], 'GS칼텍스 100원/L, 월 20만 이용한도'),
    (2232, ['통신', '해외', '공과금/렌탈'], '영역별 월 5천 하나머니(10만↑ 이용 시)'),
]


def main():
    con = sqlite3.connect(DB); cur = con.cursor()
    n = m = k = 0
    for idx, cat, tiers, memo in FILLS:
        cols = {}
        for i in range(10):
            cols[NG_TH[i]] = tiers[i][0] if i < len(tiers) else None
            cols[NG_CAP[i]] = tiers[i][1] if i < len(tiers) else None
        cols.update({'구간출처': 'llm-review', '검수상태': 'reviewing', '검수메모': memo})
        sets = ', '.join(f'"{c}"=?' for c in cols)
        n += cur.execute(f'UPDATE 혜택계산기 SET {sets} WHERE card_idx=? AND 혜택카테고리=?',
                         list(cols.values()) + [idx, cat]).rowcount
    for idx, cats, memo in NOCAP:
        for cat in cats:
            m += cur.execute("UPDATE 혜택계산기 SET 구간출처='llm-review-nocap',검수상태='reviewing',검수메모=? WHERE card_idx=? AND 혜택카테고리=?", (memo, idx, cat)).rowcount
    for idx, cats, memo in COMPLEX:
        for cat in cats:
            k += cur.execute("UPDATE 혜택계산기 SET 구간출처='llm-review-complex',검수상태='reviewing',검수메모=? WHERE card_idx=? AND 혜택카테고리=?", (memo, idx, cat)).rowcount
    con.commit()
    print(f'구간채움 {n}행 / 무한도 {m}행 / 복잡 {k}행 (12장)')


if __name__ == '__main__':
    main()
