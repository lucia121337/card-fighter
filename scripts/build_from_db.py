# -*- coding: utf-8 -*-
"""M4: DB → benefits_structured.json 빌드 (설계 B 하이브리드).

이번 1차 빌드의 역할:
  - 베이스 = 현행 benefits_structured.json (rich 필드 전부 그대로 보존 → 무회귀)
  - 오버레이 = DB 구간 한도(cap_tiers) 중 **사람이 검수 완료(검수상태='done')한 카드만**.
    (회귀 테스트에서 미검증 DB 구간은 1·5원 등 아티팩트로 계산을 망가뜨림이 확인됨 →
     검증 안 된 구간은 절대 계산기에 넣지 않는다. 원문 대조로 확정된 것만 반영.)
  - 검수 반영분엔 cap_tiers_src='human' 표기.

안전장치: 기존 파일 안 덮음. 출력은 benefits_structured.rebuilt.json.
아직 검수 전이면 rebuilt ≈ 현행(무변화) — 이것이 파이프라인이 안전하다는 증거.
확정되면 별도로 교체(promote)한다.

사용: python scripts/build_from_db.py
"""
import sqlite3, json, io, os

ROOT = os.path.join(os.path.dirname(__file__), '..')
DB = os.path.join(ROOT, 'benefit_calculator_wide.sqlite')
JS = os.path.join(ROOT, 'benefits_structured.json')
OUT = os.path.join(ROOT, 'benefits_structured.rebuilt.json')


def card_tiers(cur):
    """card_idx -> [[전월실적,한도],...] (오름차순).
    **사람이 검수 완료(검수상태='done')한 행의 구간만** 반영한다."""
    out = {}
    rows = cur.execute("SELECT * FROM 혜택계산기 WHERE 검수상태='done'").fetchall()
    for r in rows:
        idx = int(r['card_idx'])
        t = [(r[f'구간{i}_전월실적'], r[f'구간{i}_한도'])
             for i in range(1, 11)
             if r[f'구간{i}_전월실적'] is not None and r[f'구간{i}_한도'] is not None]
        if not t:
            continue
        t = sorted(set(t))
        if idx not in out or len(t) > len(out[idx]):
            out[idx] = t
    return {k: [[a, b] for a, b in v] for k, v in out.items()}


def main():
    js = json.load(io.open(JS, encoding='utf-8'))
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    cur = con.cursor()
    tiers = card_tiers(cur)

    added = 0; replaced = 0; kept = 0
    for k, b in js.items():
        idx = int(k)
        dbt = tiers.get(idx)
        cur_t = b.get('cap_tiers') or []
        if not dbt:
            continue
        if cur_t:
            kept += 1          # 기존 JSON tier가 있으면 보존(LLM 추출 우선)
            continue
        b['cap_tiers'] = dbt
        b['cap_tiers_src'] = 'human'
        added += 1

    json.dump(js, io.open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'빌드 완료 → {os.path.basename(OUT)}')
    print(f'  DB clean tier 보유 카드: {len(tiers)}')
    print(f'  cap_tiers 신규 백필(기존 비어있던 카드): {added}')
    print(f'  기존 JSON tier 보존(안 덮음): {kept}')
    print(f'  카드 수: {len(js)}')


if __name__ == '__main__':
    main()
