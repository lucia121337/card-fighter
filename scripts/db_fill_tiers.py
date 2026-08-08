# -*- coding: utf-8 -*-
"""M3: DB 구간 한도 채우기 — 신뢰 가능한 출처에서 결정론적으로.

DB 자체 파싱은 63% 오염이라 못 쓴다. 대신:
  1) JSON cap_tiers (LLM 추출, 전월실적별 [min,한도]) → DB 구간 (구간출처='json-llm')  [최우선·최고품질]
  2) JSON monthly_cap (단일 한도) → 단일 구간 [[pre_month, cap]] (구간출처='json-llm')
  3) 둘 다 없고 DB에 clean 구간이 남아있으면 그대로 두고 구간출처='db-est' 표기(저신뢰, 검수우선)
채운 값은 검수상태를 바꾸지 않는다(unreviewed 유지) → 사람 확인 전엔 계산기에 안 들어감.

위생 게이트(느슨): 한도>0, 한도<=1,000,000, 전월실적 오름차순.
기본 dry-run. 적용 --apply.
"""
import sqlite3, json, io, os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')
DB = os.path.join(ROOT, 'benefit_calculator_wide.sqlite')
JS = os.path.join(ROOT, 'benefits_structured.json')
NG_TH = [f'구간{i}_전월실적' for i in range(1, 11)]
NG_CAP = [f'구간{i}_한도' for i in range(1, 11)]


def num(v):
    return v if isinstance(v, (int, float)) else 0


def sane(tiers):
    if not tiers:
        return False
    caps = [t[1] for t in tiers]; ths = [t[0] for t in tiers]
    if any(c <= 0 or c > 1_000_000 for c in caps):
        return False
    if ths != sorted(ths):
        return False
    return True


def json_tiers(b):
    ct = b.get('cap_tiers') or []
    tiers = [[int(num(a)), int(num(c))] for a, c in ct if num(c) > 0]
    if tiers and sane(tiers):
        return sorted(tiers), 'json-llm'
    mc = num(b.get('monthly_cap'))
    if mc > 0:
        th = int(num(b.get('pre_month_money')))
        t = [[th, int(mc)]]
        if sane(t):
            return t, 'json-llm'
    return None, None


def has_db_tier(cur, idx):
    r = cur.execute('SELECT 구간1_한도 FROM 혜택계산기 WHERE card_idx=? AND 구간1_한도 IS NOT NULL LIMIT 1', (idx,)).fetchone()
    return r is not None


def _tier_cols(tiers, src):
    cols = {}
    for i in range(10):
        cols[NG_TH[i]] = tiers[i][0] if i < len(tiers) else None
        cols[NG_CAP[i]] = tiers[i][1] if i < len(tiers) else None
    cols['구간출처'] = src
    return cols


def set_card_tiers(cur, idx, tiers, src):
    cols = _tier_cols(tiers, src)
    sets = ', '.join(f'"{k}"=?' for k in cols)
    cur.execute(f'UPDATE 혜택계산기 SET {sets} WHERE card_idx=?', list(cols.values()) + [idx])


def set_row_tier(cur, idx, cat, tiers, src):
    cols = _tier_cols(tiers, src)
    sets = ', '.join(f'"{k}"=?' for k in cols)
    cur.execute(f'UPDATE 혜택계산기 SET {sets} WHERE card_idx=? AND 혜택카테고리=?',
                list(cols.values()) + [idx, cat])


def main():
    apply = '--apply' in sys.argv
    js = json.load(io.open(JS, encoding='utf-8'))
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    cur = con.cursor()
    idxs = [r[0] for r in cur.execute('SELECT DISTINCT card_idx FROM 혜택계산기')]

    n_json = 0; n_catcap = 0; n_dbest = 0; n_empty = 0
    for idx in idxs:
        b = js.get(str(idx))
        tiers, src = (json_tiers(b) if b else (None, None))
        if tiers:
            n_json += 1
            if apply:
                set_card_tiers(cur, idx, tiers, src)
            continue
        # 카드-레벨 통합 tier 없음 → JSON category_caps(카테고리별 한도)를 각 행에 개별 적용
        cc = (b.get('category_caps') or {}) if b else {}
        pm = int(num(b.get('pre_month_money'))) if b else 0
        filled_any = False
        for cat, cap in cc.items():
            if num(cap) <= 0:
                continue
            t = [[pm, int(num(cap))]]
            if not sane(t):
                continue
            filled_any = True
            if apply:
                set_row_tier(cur, idx, cat, t, 'json-catcap')
        if filled_any:
            n_catcap += 1
        elif has_db_tier(cur, idx):
            n_dbest += 1
            if apply:
                cur.execute("UPDATE 혜택계산기 SET 구간출처='db-est' WHERE card_idx=? AND 구간1_한도 IS NOT NULL", (idx,))
        else:
            n_empty += 1

    print(f'구간 채움 결과 (카드 {len(idxs)}):')
    print(f'  JSON 통합 tier(json-llm, 최고품질): {n_json}')
    print(f'  JSON 카테고리별 한도(json-catcap): {n_catcap}')
    print(f'  DB clean만 있음(db-est, 저신뢰·검수우선): {n_dbest}')
    print(f'  여전히 빈칸(원문검수/무한도/할인없음): {n_empty}')
    if apply:
        con.commit(); print('[적용] 완료. (검수상태는 unreviewed 유지 — 계산기엔 검수완료분만 반영)')
    else:
        print('[dry-run] 변경 없음. 적용: --apply')


if __name__ == '__main__':
    main()
