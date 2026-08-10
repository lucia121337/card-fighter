# 디자인 명세 - 카드 타일 UI 표준화 및 버튼 마이크로 인터랙션

## 개요
이 문서는 카드 파이터(`index.html`, `search.html`, `match_game.html`, `detail.html`, `compare.html`, `calculator.html`) 전체에서 카드 타일 UI 구성 요소(`.c-card`, `.c-chip`, `.c-img`)를 표준화하고 버튼 마이크로 인터랙션을 통일하기 위한 디자인 명세입니다.

---

## 1. 전역 컴포넌트 아키텍처 (`common.css`)

### A. 카드 타일 컴포넌트 시스템 (`.c-card`)
- **카드 컨테이너 (`.c-card`, `.card`)**:
  - `background`: `var(--panel)` (라이트 모드 `#FFFFFF`, 다크/프리미엄 테마 `#191B23`)
  - `border`: `1.5px solid var(--line)` (라이트 `#E2E8F0`, 다크 `#3A3320`)
  - `border-radius`: `var(--radius-lg)` (`16px`)
  - `box-shadow`: `var(--shadow-sm)` (`0 2px 8px rgba(15,23,42,0.06)`)
  - `transition`: `transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease`
  - `hover`: `transform: translateY(-3px); border-color: var(--brand); box-shadow: var(--shadow-md);`

- **카드 미디어 & 이미지 (`.c-img-wrap`, `.c-img`)**:
  - 종횡비: `1.586 : 1` (표준 신용카드 비율)
  - 이미지 크기: 가로 `120px` x 세로 `76px`
  - `object-fit`: `contain`
  - 백드롭 방사형 글로우(Backdrop radial glow): `radial-gradient(circle, rgba(233,237,243,0.8) 0%, transparent 72%)`
  - 이미지 드롭 섀도우(Image drop-shadow): `filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.12))`

- **칩 시스템 (`.c-chip`)**:
  - 기본 칩: `padding: 4px 10px; font-size: 11.5px; font-weight: 600; border-radius: var(--radius-sm) (8px);`
  - 연회비 칩 (`.c-chip-fee`, `.chip.fee`): `background: #EFF6FF; border: 1px solid #BFDBFE; color: #1D4ED8;`
  - 캐시백 칩 (`.c-chip-cash`, `.chip.pre`): `background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D;`
  - 체크카드 칩 (`.c-chip-check`, `.chip.chk`): `background: #FFF7ED; border: 1px solid #FED7AA; color: #C2410C;`
  - 프리미엄 칩 (`.c-chip-prem`, `.chip.prem`): `background: linear-gradient(90deg, #B8860B, #E3B448); color: #1A150A; font-weight: 800;`

---

## 2. 버튼 및 마이크로 인터랙션 시스템

- **표준 버튼 (`.c-btn`, `.detail-btn`, `.compare-btn`, `.back`, `.calc-btn`)**:
  - `border-radius`: 일반 액션 버튼은 `var(--radius-sm)` (`8px`), 주요 CTA 버튼은 `var(--radius-md)` (`12px`)
  - `font-size`: `13px` / `14px`, `font-weight: 700`
  - `transition`: `all 0.15s ease`
  - `hover`: `transform: translateY(-2px); box-shadow: 0 4px 12px rgba(20, 92, 230, 0.25)`
  - `active`: `transform: translateY(0); box-shadow: 0 2px 4px rgba(20, 92, 230, 0.2)`
  - `focus-visible`: `outline: none; box-shadow: 0 0 0 3px rgba(20, 92, 230, 0.25)`

- **주요 CTA 버튼 (`.c-btn-primary`, `#more`, `.detail-btn`)**:
  - `background`: `var(--brand)` (`#145CE6`)
  - `color`: `#FFFFFF`
  - `hover`: `background: var(--brand-deep)` (`#0E47C0`)

- **보조 아웃라인 버튼 (`.c-btn-secondary`, `.compare-btn`)**:
  - `background`: `var(--panel)`
  - `border`: `1.5px solid var(--line)`
  - `color`: `var(--txt)`
  - `hover`: `border-color: var(--brand); color: var(--brand)`

---

## 3. 페이지 통합 범위
1. [common.css](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/common.css)
2. [index.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/index.html)
3. [search.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/search.html)
4. [match_game.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/match_game.html)
5. [detail.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/detail.html)
6. [compare.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/compare.html)
