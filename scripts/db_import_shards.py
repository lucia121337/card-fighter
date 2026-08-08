# -*- coding: utf-8 -*-
"""M5: 검수 완료된 샤드 JSON → DB 반영 (라운드트립 닫기).

review.html에서 내보낸 data/review_shards/담당N.json 을 읽어
(card_idx, 혜택카테고리) 기준으로 요율·정액원·리터당원·구간·검수상태·메모를 DB에 씀.
검수상태='done' 인 행은 구간출처='human' 으로 표기(build_from_db가 이것만 계산기에 반영).

기본 dry-run. 적용은 --apply. 특정 담당만: --owner 담당1

사용:
  python scripts/db_import_shards.py                 # 전체 dry-run
  python scripts/db_import_shards.py --apply          # 반영
  python scripts/db_import_shards.py --owner 담당1 --apply
"""
import sqlite3, json, io, os, sys, glob

ROOT = os.path.join(os.path.dirname(__file__), '..')
DB = os.path.join(ROOT, 'benefit_calculator_wide.sqlite')
SHARDDIR = os.path.join(ROOT, 'data', 'review_shards')
NG_TH = [f'구간{i}_전월실적' for i in range(1, 11)]
NG_CAP = [f'구간{i}_한도' for i in range(1, 11)]


def tier_cols(tiers):
    """[[th,cap],...] → {구간i_전월실적:.., 구간i_한도:..} (넘치는 칸은 None)"""
    d = {}
    tiers = (tiers or [])[:10]
    for i in range(10):
        d[NG_TH[i]] = tiers[i][0] if i < len(tiers) else None
        d[NG_CAP[i]] = tiers[i][1] if i < len(tiers) else None
    return d


def main():
    apply = '--apply' in sys.argv
    only = sys.argv[sys.argv.index('--owner') + 1] if '--owner' in sys.argv else None
    files = ([os.path.join(SHARDDIR, only + '.json')] if only
             else [f for f in glob.glob(os.path.join(SHARDDIR, '*.json'))
                   if not os.path.basename(f).startswith('_')])

    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    cur = con.cursor()
    # (idx,cat)->seq
    pair2seq = {(int(r['card_idx']), r['혜택카테고리']): r['seq']
                for r in cur.execute('SELECT seq, card_idx, 혜택카테고리 FROM 혜택계산기')}

    n_upd = 0; n_done = 0; n_miss = 0
    for f in files:
        if not os.path.exists(f):
            print('없음:', f); continue
        s = json.load(io.open(f, encoding='utf-8'))
        for c in s.get('cards', []):
            idx = int(c['idx'])
            for r in c.get('rows', []):
                seq = pair2seq.get((idx, r['cat']))
                if seq is None:
                    n_miss += 1; continue
                status = r.get('검수상태') or 'unreviewed'
                src = 'human' if status == 'done' else None
                cols = {'요율': r.get('요율'), '정액원': r.get('정액원'), '리터당원': r.get('리터당원'),
                        '카테고리_전월실적': r.get('전월실적'), '검수상태': status,
                        '검수메모': r.get('메모') or None, '구간출처': src}
                cols.update(tier_cols(r.get('구간')))
                if status == 'done':
                    n_done += 1
                n_upd += 1
                if apply:
                    sets = ', '.join(f'"{k}"=?' for k in cols)
                    cur.execute(f'UPDATE 혜택계산기 SET {sets} WHERE seq=?', list(cols.values()) + [seq])
        print(f'  {os.path.basename(f)}: 카드 {len(s.get("cards",[]))}')

    print(f'\n반영 대상 행: {n_upd} (검수완료 {n_done}), 매칭실패 {n_miss}')
    if apply:
        con.commit(); print('[적용] DB 반영 완료. 다음: python scripts/build_from_db.py')
    else:
        print('[dry-run] 변경 없음. 적용: --apply')


if __name__ == '__main__':
    main()
