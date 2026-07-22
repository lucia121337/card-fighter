# -*- coding: utf-8 -*-
"""card_detail/*.json 의 상세 혜택(key_benefit HTML) → LLM 구조화 (benefits_llm.json)

정규식으론 못 잡는 복합 조건(리터당 할인·매장별 차등·통합할인한도 표·발레파킹/바우처 등)을
Claude 로 구조화한다. 출력은 계산기가 바로 소비하는 benefits[] 스키마.

■ 사전 준비
    pip install anthropic
    $env:ANTHROPIC_API_KEY = "sk-ant-..."   (PowerShell)   또는  export ANTHROPIC_API_KEY=...

■ 사용법
    python calc/extract_benefits.py --sample 3     # 3장만 즉시 추출(품질 확인, 저렴)
    python calc/extract_benefits.py --batch        # 전체를 Batch API로(50% 할인) → benefits_llm.json
    python calc/extract_benefits.py --batch --model claude-opus-4-8   # 품질 우선(비쌈)

■ 비용 (전체 1,563장, 대략)
    Haiku 4.5 + Batch : 입력~5M·출력~1.3M → 약 $5~6
    Opus  4.8 + Batch : 약 $25~35
    → 먼저 --sample 로 품질 보고, 괜찮으면 --batch. 이미 뽑은 카드는 건너뜀(재개 가능).
"""
import io, sys, os, re, json, time, argparse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETAIL_DIR = os.path.join(ROOT, "card_detail")
OUT_PATH = os.path.join(ROOT, "benefits_llm.json")

DEFAULT_MODEL = "claude-haiku-4-5"   # 저렴·빠름. 품질 우선이면 --model claude-opus-4-8

# ── 출력 스키마 (structured output; 계산기가 소비) ──────────────────────────
BENEFIT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["monthly_cap_won", "cap_note", "benefits"],
    "properties": {
        "monthly_cap_won": {
            "type": ["integer", "null"],
            "description": "카드 전체 월 통합할인한도(원)의 최댓값. 전월실적별 표면 최고 tier값. 없으면 null",
        },
        "cap_note": {"type": "string", "description": "한도 설명 한 줄. 예: '전월실적별 1만~10만원'. 없으면 빈 문자열"},
        "benefits": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["category", "type", "unit", "value", "targets",
                             "per_txn_cap_won", "monthly_cap_won", "count_limit",
                             "airline", "min_prev_spend", "computable", "label"],
                "properties": {
                    "category": {"type": "string", "description": "혜택 카테고리(쇼핑/주유/푸드/카페/영화/통신/여행/해외/적립/프리미엄 등)"},
                    "type": {"type": "string", "enum": ["할인", "적립", "마일", "바우처", "서비스", "면제"]},
                    "unit": {"type": "string", "enum": ["percent", "won_fixed", "won_per_liter",
                                                        "mile_per_won", "mile_per_1000", "voucher_won", "none"]},
                    "value": {"type": ["number", "null"], "description": "percent=%, won_fixed/voucher_won=원, won_per_liter=리터당 원, mile_per_1000=1000원당 마일. 서비스는 null"},
                    "targets": {"type": "array", "items": {"type": "string"}, "description": "대상 가맹점/브랜드. 매장별 차등이면 '스타벅스20%'처럼 표기"},
                    "per_txn_cap_won": {"type": ["integer", "null"], "description": "건당 한도(원). 없으면 null"},
                    "monthly_cap_won": {"type": ["integer", "null"], "description": "이 혜택 개별 월한도(원). 없으면 null"},
                    "count_limit": {"type": "string", "description": "'월1회'/'일2회'/'연3회'/'무제한' 등. 모르면 빈 문자열"},
                    "airline": {"type": "string", "description": "항공사 직접적립 마일이면 '대한항공'/'아시아나'. 카드사 자체 마일/그 외 ''"},
                    "min_prev_spend": {"type": ["integer", "null"], "description": "이 혜택 받기 위한 전월실적 조건(원). 없으면 null"},
                    "computable": {"type": "boolean", "description": "소비금액으로 금액을 계산할 수 있으면 true. 발레파킹/라운지/할부 등 방문·서비스형은 false"},
                    "label": {"type": "string", "description": "화면 표시용 한 줄 요약"},
                },
            },
        },
    },
}

SYSTEM = """너는 한국 신용카드 혜택 약관을 구조화하는 파서다.
카드 한 장의 상세 혜택 텍스트를 받아, 계산기가 쓸 수 있는 benefits[] 로 변환한다.

규칙:
1) 각 혜택을 하나의 객체로. 한 카테고리에 매장별 차등이 있으면 최댓값을 value 로 하고 targets 에 '스타벅스20%'처럼 병기.
2) unit 을 정확히: 퍼센트 할인/적립→percent, 정액 할인(영화 7천원)→won_fixed, 리터당(주유 60원/L)→won_per_liter,
   마일(1000원당 N마일)→mile_per_1000, 연 바우처/상품권→voucher_won, 발레파킹·라운지·무료주차 등 서비스→none.
3) computable: 소비지출로 금액 계산이 가능하면 true. 방문형(테마파크/공연)·서비스형(발레파킹/라운지/할부/무이자)·연 1회성 바우처는 false 로 두되 label 로 남긴다.
4) 상한: 건당 한도→per_txn_cap_won, 개별 월한도→monthly_cap_won. 카드 전체 '통합할인한도'(전월실적별 표 포함)는 최상위 monthly_cap_won 에 최고 tier 금액, cap_note 에 '전월실적별 1만~10만원'처럼 요약.
5) 마일 airline: '대한항공/스카이패스'→대한항공, '아시아나'→아시아나. 그 외(트래블마일 등 카드사 자체)는 '' 로.
6) 적립/할인율의 '최대 N%'는 value 에 N. 기본적립과 카테고리 적립을 구분해 각각 객체로.
7) 확실치 않은 수치는 넣지 말고 null/''. 지어내지 말 것.
8) 유의사항/부가서비스 변경/국제브랜드 안내 같은 약관 잡설은 혜택으로 만들지 말 것."""


def strip_html(h):
    h = re.sub(r"<[^>]+>", " ", h or "")
    h = h.replace("&nbsp;", " ").replace("&amp;", "&").replace("&middot;", "·").replace("&times;", "×")
    h = re.sub(r"&[a-z]+;", " ", h)
    return re.sub(r"\s+", " ", h).strip()


def card_input_text(card):
    """LLM 입력용: 카드명 + 카테고리 + 연회비 + 상세혜택(HTML 제거)."""
    parts = [f"카드명: {card.get('card_name','')}",
             f"카드사: {card.get('company','')}",
             f"연회비: {card.get('annual_fee','')}",
             f"전월실적조건: {card.get('pre_month_condition','') or card.get('pre_month_money','')}",
             f"혜택카테고리: {card.get('benefit_categories','')}", "", "── 상세 혜택 ──"]
    for k in (card.get("key_benefit") or []):
        title = k.get("title", "")
        if title in ("유의사항",):   # 통합할인한도 표는 유의사항에 있으므로 title만 스킵 못함 → 본문 포함하되 잡설은 프롬프트가 거름
            pass
        body = strip_html(k.get("info"))
        if body:
            parts.append(f"[{title}] {body}")
    return "\n".join(parts)


def load_cards():
    files = sorted(int(f[:-5]) for f in os.listdir(DETAIL_DIR) if f.endswith(".json") and f[:-5].isdigit())
    for idx in files:
        try:
            yield idx, json.load(open(os.path.join(DETAIL_DIR, f"{idx}.json"), encoding="utf-8"))
        except Exception:
            continue


def load_out():
    if os.path.isfile(OUT_PATH):
        try:
            return json.load(open(OUT_PATH, encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_out(out):
    json.dump(out, open(OUT_PATH, "w", encoding="utf-8"), ensure_ascii=False)


# ── 즉시(비배치) 소량 추출: 품질 확인용 ──────────────────────────────────
def run_sample(n, model):
    import anthropic
    client = anthropic.Anthropic()
    out = load_out()
    done = 0
    for idx, card in load_cards():
        if done >= n:
            break
        if str(idx) in out:
            continue
        resp = client.messages.create(
            model=model, max_tokens=4000,
            system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
            output_config={"format": {"type": "json_schema", "schema": BENEFIT_SCHEMA}},
            messages=[{"role": "user", "content": card_input_text(card)}],
        )
        text = next((b.text for b in resp.content if b.type == "text"), "{}")
        out[str(idx)] = json.loads(text)
        done += 1
        print(f"\n=== {idx} {card.get('card_name','')} ===")
        print(json.dumps(out[str(idx)], ensure_ascii=False, indent=2))
    save_out(out)
    print(f"\n[sample] {done}장 추출 → {OUT_PATH}")


# ── 전체 Batch API 추출 (50% 저렴) ───────────────────────────────────────
def run_batch(model):
    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    client = anthropic.Anthropic()
    out = load_out()

    requests = []
    for idx, card in load_cards():
        if str(idx) in out:
            continue
        requests.append(Request(
            custom_id=str(idx),
            params=MessageCreateParamsNonStreaming(
                model=model, max_tokens=4000,
                system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
                output_config={"format": {"type": "json_schema", "schema": BENEFIT_SCHEMA}},
                messages=[{"role": "user", "content": card_input_text(card)}],
            ),
        ))
    if not requests:
        print("추출할 카드 없음(모두 완료). benefits_llm.json 확인.")
        return
    print(f"Batch 제출: {len(requests)}장 (model={model})")
    batch = client.messages.batches.create(requests=requests)
    print(f"  batch id = {batch.id} · 진행상황: 1시간 이내 대부분 완료")

    while True:
        b = client.messages.batches.retrieve(batch.id)
        if b.processing_status == "ended":
            break
        print(f"  ...{b.processing_status} (처리중 {b.request_counts.processing})")
        time.sleep(30)

    ok = err = 0
    for result in client.messages.batches.results(batch.id):
        if result.result.type == "succeeded":
            msg = result.result.message
            text = next((x.text for x in msg.content if x.type == "text"), None)
            if text:
                try:
                    out[result.custom_id] = json.loads(text)
                    ok += 1
                    continue
                except json.JSONDecodeError:
                    pass
        err += 1
        print(f"  실패: {result.custom_id} ({result.result.type})")
    save_out(out)
    print(f"[batch] 성공 {ok} · 실패 {err} · 누적 {len(out)}장 → {OUT_PATH}")
    qa()


def qa():
    out = load_out()
    n = len(out)
    if not n:
        return
    types, computable, service, mile, capped = {}, 0, 0, 0, 0
    for b in out.values():
        if b.get("monthly_cap_won"):
            capped += 1
        for x in b.get("benefits", []):
            types[x.get("type")] = types.get(x.get("type"), 0) + 1
            if x.get("computable"):
                computable += 1
            if x.get("type") == "서비스":
                service += 1
            if x.get("type") == "마일":
                mile += 1
    print(f"\n[QA] {n}장 · 통합한도 파싱 {capped} · 계산가능 혜택 {computable} · 서비스 {service} · 마일 {mile}")
    print(f"  혜택 type 분포: {types}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0, help="즉시 N장만 추출(품질 확인)")
    ap.add_argument("--batch", action="store_true", help="전체를 Batch API로 추출")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--qa", action="store_true", help="현재 benefits_llm.json 통계만")
    a = ap.parse_args()
    if a.qa:
        qa()
    elif a.sample:
        run_sample(a.sample, a.model)
    elif a.batch:
        run_batch(a.model)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
