# -*- coding: utf-8 -*-
"""병렬 에이전트 검수 결과(review_out/chunk_*.json) → DB 적용.
검수상태=reviewing, 구간출처=llm-review/llm-review-nocap/llm-review-complex.
tiers 위생검사(한도 100~500000, 오름차순) 통과분만 fill. 기본 dry-run, --apply.
"""
import sqlite3, json, io, os, glob, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')
DB = os.path.join(ROOT, 'benefit_calculator_wide.sqlite')
OUTDIR = r'C:/Users/푸른솔/AppData/Local/Temp/claude/C--Users-----Desktop-academyPJ-icb10proj2-card-fighter/1e4fc05f-dc42-4d74-bf9f-3ba0711d69d1/scratchpad/review_out'
NG_TH = [f'구간{i}_전월실적' for i in range(1, 11)]
NG_CAP = [f'구간{i}_한도' for i in range(1, 11)]


def sane(tiers):
    try:
        caps = [int(t[1]) for t in tiers]; ths = [int(t[0]) for t in tiers]
    except Exception:
        return False
    if not tiers or any(c < 100 or c > 500000 for c in caps):
        return False
    if ths != sorted(ths) or caps != sorted(caps):
        return False
    if any(t < 0 or t > 3000000 for t in ths):
        return False
    return True


def main():
    apply = '--apply' in sys.argv
    files = sorted(glob.glob(os.path.join(OUTDIR, 'chunk_*.json')))
    con = sqlite3.connect(DB); cur = con.cursor()
    nf = nn = nc = skipped = 0
    for f in files:
        try:
            d = json.load(io.open(f, encoding='utf-8'))
        except Exception as e:
            print('로드실패', os.path.basename(f), e); continue
        for row in d.get('fills', []):
            idx, cat, tiers, memo = row[0], row[1], row[2], (row[3] if len(row) > 3 else '')
            if not sane(tiers):
                skipped += 1; continue
            cols = {}
            for i in range(10):
                cols[NG_TH[i]] = int(tiers[i][0]) if i < len(tiers) else None
                cols[NG_CAP[i]] = int(tiers[i][1]) if i < len(tiers) else None
            cols.update({'구간출처': 'llm-review', '검수상태': 'reviewing', '검수메모': memo})
            if apply:
                sets = ', '.join(f'"{k}"=?' for k in cols)
                nf += cur.execute(f'UPDATE 혜택계산기 SET {sets} WHERE card_idx=? AND 혜택카테고리=?',
                                  list(cols.values()) + [int(idx), cat]).rowcount
            else:
                nf += 1
        for row in d.get('nocap', []):
            idx, cats, memo = row[0], row[1], (row[2] if len(row) > 2 else '')
            for cat in cats:
                if apply:
                    nn += cur.execute("UPDATE 혜택계산기 SET 구간출처='llm-review-nocap',검수상태='reviewing',검수메모=? WHERE card_idx=? AND 혜택카테고리=?", (memo, int(idx), cat)).rowcount
                else:
                    nn += 1
        for row in d.get('complex', []):
            idx, cats, memo = row[0], row[1], (row[2] if len(row) > 2 else '')
            for cat in cats:
                if apply:
                    nc += cur.execute("UPDATE 혜택계산기 SET 구간출처='llm-review-complex',검수상태='reviewing',검수메모=? WHERE card_idx=? AND 혜택카테고리=?", (memo, int(idx), cat)).rowcount
                else:
                    nc += 1
    if apply:
        con.commit()
    print(f'파일 {len(files)}개 | 구간채움 {nf}행 / 무한도 {nn}행 / 복잡 {nc}행 | 위생탈락 {skipped}')
    print('[적용]' if apply else '[dry-run] --apply 로 반영')


if __name__ == '__main__':
    main()
