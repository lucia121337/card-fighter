# -*- coding: utf-8 -*-
"""상세내용(혜택 설명) 되채우기 — DB 빌드 때 날아간 원문 설명을 card_detail에서 복원.

각 카드의 card_detail key_benefit(제목+본문)을 카테고리로 매핑해, 해당 (card_idx, 혜택카테고리) 행의
빈 상세내용을 "제목: 본문" 으로 채운다. 매핑은 build_benefits.py의 map_category/cats_from_text 재사용
(제목만으로 안 되면 본문 텍스트로 카테고리 추정 — 예 'KT'는 본문 '이동통신'으로 통신 매핑).

기존 상세내용은 덮지 않는다(빈 것만). 기본 dry-run, 적용 --apply.
"""
import sqlite3, json, io, os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, os.path.join(ROOT, 'calc'))
import build_benefits as bb  # map_category, cats_from_text, strip_html, LABEL_ALIAS

DB = os.path.join(ROOT, 'benefit_calculator_wide.sqlite')
DETAIL = os.path.join(ROOT, 'card_detail')


def key_benefits(idx):
    p = os.path.join(DETAIL, f'{idx}.json')
    if not os.path.isfile(p):
        return []
    try:
        return json.load(io.open(p, encoding='utf-8')).get('key_benefit') or []
    except Exception:
        return []


def main():
    apply = '--apply' in sys.argv
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    cur = con.cursor()

    # 카드별 (카테고리 -> seq), 빈 상세내용 여부
    cards = {}
    for r in cur.execute("SELECT seq, card_idx, 혜택카테고리, 상세내용 FROM 혜택계산기"):
        idx = int(r['card_idx'])
        empty = (r['상세내용'] is None or str(r['상세내용']).strip() == '')
        cards.setdefault(idx, {})[r['혜택카테고리']] = (r['seq'], empty)

    n_fill = 0; n_cards = 0; n_nomatch = 0
    updates = []
    for idx, catmap in cards.items():
        kbs = key_benefits(idx)
        if not kbs:
            continue
        covered = list(catmap.keys())
        per_cat = {}
        SKIP_TITLE = ('유의', '안내', '주의', '참고', '알아두기', '필독')
        for k in kbs:
            title = (k.get('title') or '').strip()
            info = bb.strip_html(k.get('info'))
            if not (title or info):
                continue
            if any(s in title for s in SKIP_TITLE):
                continue  # 혜택 설명 아닌 안내/유의문 제외
            cat = bb.map_category(title, covered)
            if not cat:
                cts = bb.cats_from_text(title + ' ' + info[:80], covered)
                cat = cts[0] if cts else None
            if not cat or cat not in catmap:
                continue
            txt = (f'{title}: {info}' if title else info).strip()
            per_cat.setdefault(cat, []).append(txt)
        if not per_cat:
            n_nomatch += 1
            continue
        touched = False
        for cat, texts in per_cat.items():
            seq, empty = catmap[cat]
            if not empty:
                continue  # 기존 상세내용 보존
            joined = ' / '.join(dict.fromkeys(texts))[:400]
            updates.append((joined, seq)); n_fill += 1; touched = True
        if touched:
            n_cards += 1

    print(f'상세내용 채울 행: {n_fill}  (카드 {n_cards}) | 원문매칭 실패카드 {n_nomatch}')
    if apply:
        cur.executemany('UPDATE 혜택계산기 SET 상세내용=? WHERE seq=?', updates)
        con.commit(); print('[적용] 완료.')
    else:
        print('[dry-run] 예시:')
        for txt, seq in updates[:6]:
            r = cur.execute('SELECT card_idx, 혜택카테고리 FROM 혜택계산기 WHERE seq=?', (seq,)).fetchone()
            print(f'  idx {r[0]} {r[1]} → {txt[:80]}')
        print('적용: --apply')


if __name__ == '__main__':
    main()
