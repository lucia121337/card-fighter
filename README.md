# card-gorilla 신용카드 정보 수집

[Scrapling](https://scrapling.readthedocs.io/en/latest/) 으로 카드고릴라 신용카드 목록을 전수 수집한 결과입니다.

- **대상 페이지**: https://www.card-gorilla.com/card?cate=CRD
- **데이터 출처**: `https://api.card-gorilla.com/v1/cards` (페이지가 호출하는 공식 JSON API)
- **수집량**: 신용카드(CRD) **1,111건** 전체 (카드사 25곳)

## 수집 방식
페이지는 Vue SPA로, 카드 목록을 `/v1/cards?cate=CRD&p=N&perPage=100&sort=ranking`
JSON API로 불러옵니다. Scrapling `Fetcher`(브라우저 TLS 지문 위장)로 12개 페이지를
순회해 전체를 받아 정제했습니다.

## 파일
| 파일 | 설명 |
|------|------|
| `scrape_cards.py` | 전체 수집 스크립트 |
| `verify_firstpage.py` | 첫 페이지 5개 필드 정확도 검증 스크립트 |
| `cards_raw.json` | API 원본(전체 필드) 1,111건 |
| `cards.json` | 핵심 필드 정제본 |
| `cards.csv` | 엑셀용(UTF-8 BOM) |

## 핵심 필드
카드명(`card_name`) · 카드사(`company`) · 연회비(`annual_fee`) ·
전월실적(`pre_month_money` / `pre_month_condition`) ·
주요 혜택 요약(`top_benefit_summary`) · 혜택 카테고리(`benefit_categories`) · 상세 URL

## 실행
```bash
pip install "scrapling[fetchers]"
py -3.12 scrape_cards.py
```
