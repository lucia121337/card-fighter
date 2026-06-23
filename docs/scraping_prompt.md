# card-gorilla 스크래핑 프롬프트

## 1) HTTP 요청정보

```
Method : GET
URL    : https://api.card-gorilla.com/v1/cards
출처    : https://www.card-gorilla.com/card?cate=CRD (Vue SPA가 호출하는 목록 API)
도구    : Scrapling Fetcher (impersonate="chrome", stealthy_headers=True)

Request Headers
  Accept   : application/json
  Referer  : https://www.card-gorilla.com/card?cate=CRD
  Origin   : https://www.card-gorilla.com
```

## 2) Payload 정보

GET 쿼리 파라미터(Query String)로 전달:

```
cate     = CRD        # 카드 종류 (CRD=신용카드)
p        = 1          # 페이지 번호 (1 ~ 12)
perPage  = 100        # 페이지당 카드 수
sort     = ranking    # 정렬 기준 (인기순)
```

전체 URL 예시:
```
https://api.card-gorilla.com/v1/cards?cate=CRD&p=1&perPage=100&sort=ranking
```

## 3) Response 일부 (샘플)

응답 구조: `{ "page", "perPage", "total", "data": [ ... ] }` — `data` 배열의 카드 1건 발췌(일부 필드만):

```json
{
  "page": 1,
  "perPage": 100,
  "total": 1111,
  "data": [
    {
      "idx": 2962,
      "cid": "2962",
      "cate": "CRD",
      "corp": {
        "idx": 2,
        "name": "신한카드",
        "name_eng": "shinhan"
      },
      "name": "더한섬 신한카드",
      "brands_txt": "Mastercard",
      "annual_fee_basic": "국내전용 [15,000]원 / 해외겸용 [18,000]원",
      "pre_month_money": 400000,
      "top_benefit": [
        {
          "idx": 85,
          "title": "할인",
          "tags": ["더한섬, EQL,직영매장", "5%", "할인"]
        }
      ],
      "only_online": false,
      "release_dt": "2025-08-14"
    }
  ]
}
```

## 4) 한 페이지 수집 성공 확인

```
[2026-06-23 09:36:32] INFO: Fetched (200) <GET https://api.card-gorilla.com:8080/v1/cards?cate=CRD&p=1&perPage=30&sort=ranking>
HTTP status: 200
전체 카드 수(total): 1111 | 이번 페이지 수신: 30
======================================================================
카드명     : 더한섬 신한카드
카드사     : 신한카드
연회비     : 국내전용 [15,000]원 / 해외겸용 [18,000]원
전월실적   : 400,000원
주요혜택   : 할인:더한섬, EQL,직영매장 5% 할인 / 적립:더한섬 특별 적립처 3% 적립 / 적립:그 외 국내외 가맹점 0.5% 적립
```

확인 포인트:
- HTTP status `200`
- `total = 1111` (전체 카드 수)
- 한 페이지 데이터 정상 수신 및 핵심 필드(카드명·카드사·연회비·전월실적·주요혜택) 파싱 성공
