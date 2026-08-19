# -*- coding: utf-8 -*-
"""카드 세그먼트(유형) 학습 — 비지도 군집(KMeans) + 유사 카드(코사인).

의존성 없는 순수 파이썬(팀원 누구나 설치 없이 재실행 가능).
입력:  cards_list.json (1,563장)
출력:  card_segments.json  (프론트가 fetch)
  {
    "segments": [{id,name,icon,desc,count,fee_avg,top_cats,samples:[idx...]}...],
    "card_segment": {idx: seg_id},
    "similar": {idx: [idx,...]}   # 같은 세그먼트 내 코사인 최근접 5장
  }

특징 벡터: 혜택 카테고리(멀티핫) + 로그 연회비 + 전월실적 + 신용/체크.
"""
import io, sys, os, re, json, math, random

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
random.seed(42)  # 재현성

K = 6            # 세그먼트 수
FEE_W = 1.6      # 연회비 축 가중치(프리미엄↔실속)
PRE_W = 1.1      # 전월실적 축
TYPE_W = 0.6     # 신용/체크


def fee_max(s):
    nums = [int(x.replace(",", "")) for x in re.findall(r"[\d,]{3,}", s or "") if int(x.replace(",", "")) >= 1000]
    return max(nums) if nums else 0


def load_cards():
    with open(os.path.join(ROOT, "cards_list.json"), encoding="utf-8") as f:
        return json.load(f)


def build_vectors(cards):
    # 카테고리 사전
    cats = set()
    for c in cards:
        for x in (c.get("benefit_categories") or "").split(","):
            x = x.strip()
            if x:
                cats.add(x)
    cats = sorted(cats)
    cat_idx = {c: i for i, c in enumerate(cats)}
    dim = len(cats)

    vecs, meta = [], []
    LOG_MAX = math.log1p(3_000_000)
    for c in cards:
        v = [0.0] * (dim + 3)
        cl = [x.strip() for x in (c.get("benefit_categories") or "").split(",") if x.strip()]
        for x in cl:
            v[cat_idx[x]] = 1.0
        fee = fee_max(c.get("annual_fee"))
        v[dim] = (math.log1p(fee) / LOG_MAX) * FEE_W
        v[dim + 1] = min((c.get("pre_month_money") or 0) / 1_500_000, 1.0) * PRE_W
        v[dim + 2] = (1.0 if c.get("card_type") == "신용" else 0.0) * TYPE_W
        vecs.append(v)
        meta.append({"idx": c["idx"], "name": c.get("card_name"), "cats": cl,
                     "fee": fee, "pre": c.get("pre_month_money") or 0})
    return vecs, meta, cats, dim


def dist2(a, b):
    return sum((x - y) * (x - y) for x, y in zip(a, b))


def kmeans(vecs, k, iters=40):
    n, d = len(vecs), len(vecs[0])
    # k-means++ 초기화
    centers = [vecs[random.randrange(n)][:]]
    while len(centers) < k:
        dmin = [min(dist2(v, c) for c in centers) for v in vecs]
        tot = sum(dmin) or 1.0
        r = random.random() * tot
        acc = 0.0
        for i, dm in enumerate(dmin):
            acc += dm
            if acc >= r:
                centers.append(vecs[i][:])
                break
    labels = [0] * n
    for _ in range(iters):
        changed = False
        for i, v in enumerate(vecs):
            best, bd = 0, float("inf")
            for ci, c in enumerate(centers):
                dd = dist2(v, c)
                if dd < bd:
                    bd, best = dd, ci
            if labels[i] != best:
                labels[i] = best
                changed = True
        # 센터 갱신
        sums = [[0.0] * d for _ in range(k)]
        cnts = [0] * k
        for i, v in enumerate(vecs):
            l = labels[i]
            cnts[l] += 1
            row = sums[l]
            for j in range(d):
                row[j] += v[j]
        for ci in range(k):
            if cnts[ci]:
                centers[ci] = [s / cnts[ci] for s in sums[ci]]
        if not changed:
            break
    return labels, centers


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


# 테마로 쓰기엔 부적절한 메타 태그(조건/포괄) — 세그먼트 이름 선정에서 제외
META_CATS = {"무실적", "모든가맹점", "프리미엄"}
CAT_ICON = {"여행": "✈️", "해외": "🌍", "항공마일리지": "🛫", "쇼핑": "🛍️", "카페/디저트": "☕",
            "푸드": "🍔", "교통": "🚌", "주유": "⛽", "통신": "📶", "온라인쇼핑": "🛒",
            "마트/편의점": "🏪", "공항라운지/PP": "🛋️", "간편결제": "📲", "OTT/영화/문화": "🎬",
            "공과금/렌탈": "📄", "교육/육아": "✏️", "병원/약국": "💊", "자동차/하이패스": "🚗",
            "레저/스포츠": "⚽", "뷰티/피트니스": "💄", "애완동물": "🐾", "비즈니스": "💼"}


def median(xs):
    s = sorted(xs)
    n = len(s)
    return 0 if n == 0 else (s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2)


def fee_label(med):
    if med < 5000:
        return "무료급"
    if med < 20000:
        return "1~2만원"
    if med < 40000:
        return "2~4만원"
    if med < 100000:
        return "5~10만원"
    return "10만원+"


def pre_label(med):
    if med == 0:
        return "무실적 OK"
    return f"실적 {round(med/10000)}만원대"


def name_segment(members, meta, all_cat_prev):
    # 전체 대비 두드러진(lift) 카테고리 — 메타 태그는 제외
    prev = {}
    for i in members:
        for c in meta[i]["cats"]:
            if c not in META_CATS:
                prev[c] = prev.get(c, 0) + 1
    m = len(members) or 1
    lift = sorted(prev.items(), key=lambda kv: (kv[1] / m) - all_cat_prev.get(kv[0], 0), reverse=True)
    top = [k for k, _ in lift[:2]] or ["생활"]
    lead = top[0].split("/")[0]         # "카페/디저트" → "카페"
    sub = top[1].split("/")[0] if len(top) > 1 else "생활비"

    fee_med = median([meta[i]["fee"] for i in members])
    pre_med = median([meta[i]["pre"] for i in members])
    premium = fee_med >= 100000
    icon = CAT_ICON.get(top[0], "💳")

    name = f"{lead} 프리미엄형" if premium else f"{lead} 특화형"
    desc = (f"{lead}·{sub} 혜택을 크게 챙기는 상위 카드" if premium
            else f"{lead}·{sub}를 중심으로 일상 지출을 챙기는 카드")
    return {"name": name, "icon": icon, "desc": desc,
            "fee_median": round(fee_med), "fee_label": fee_label(fee_med),
            "pre_median": round(pre_med), "pre_label": pre_label(pre_med),
            "top_cats": top}


def main():
    cards = load_cards()
    vecs, meta, cats, dim = build_vectors(cards)
    n = len(cards)
    labels, centers = kmeans(vecs, K)

    # 전체 카테고리 유병률(이름 규칙용)
    all_prev = {}
    for mt in meta:
        for c in mt["cats"]:
            all_prev[c] = all_prev.get(c, 0) + 1
    all_prev = {k: v / n for k, v in all_prev.items()}

    clusters = {ci: [i for i in range(n) if labels[i] == ci] for ci in range(K)}
    segments, card_segment = [], {}
    for ci in sorted(clusters, key=lambda c: -len(clusters[c])):
        members = clusters[ci]
        info = name_segment(members, meta, all_prev)
        # 대표 카드 = 세그먼트 센터에 가까운 6장
        members_sorted = sorted(members, key=lambda i: dist2(vecs[i], centers[ci]))
        samples = [meta[i]["idx"] for i in members_sorted[:6]]
        seg_id = len(segments)
        segments.append({"id": seg_id, **info, "count": len(members), "samples": samples})
        for i in members:
            card_segment[meta[i]["idx"]] = seg_id

    # 유사 카드: 같은 세그먼트 내 코사인 최근접 5장
    similar = {}
    idx_of = {meta[i]["idx"]: i for i in range(n)}
    seg_members = {s["id"]: [] for s in segments}
    for cidx, sid in card_segment.items():
        seg_members[sid].append(cidx)
    for cidx, sid in card_segment.items():
        i = idx_of[cidx]
        sims = []
        for oidx in seg_members[sid]:
            if oidx == cidx:
                continue
            sims.append((cosine(vecs[i], vecs[idx_of[oidx]]), oidx))
        sims.sort(reverse=True)
        similar[cidx] = [o for _, o in sims[:5]]

    out = {"segments": segments, "card_segment": card_segment, "similar": similar,
           "meta": {"total": n, "k": K}}
    with open(os.path.join(ROOT, "card_segments.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)

    print(f"카드 {n}장 → {K}개 세그먼트")
    for s in segments:
        print(f"  [{s['icon']} {s['name']}] {s['count']}장 · 연회비 {s['fee_label']}(중앙 {s['fee_median']:,}원) · {'/'.join(s['top_cats'])}")
    print("저장: card_segments.json")


if __name__ == "__main__":
    main()
