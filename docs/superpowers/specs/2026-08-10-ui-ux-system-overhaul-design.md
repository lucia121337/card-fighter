# 디자인 명세 - UI/UX 시스템 개편 (항목 5 ~ 10)

## 개요
이 문서는 카드 파이터 전반에 걸친 UI/UX 시스템 개선을 위한 디자인 명세입니다:
5. 반응형 브레이크포인트 (640px 모바일 / 1024px 데스크톱)
6. 스켈레톤 UI & 엠프티 스테이트(빈 상태) 표준화
7. 통합 모달 & 바텀 시트 시스템
8. 스마트 뒤로가기 버튼 내비게이션 뎁스
9. 타이포그래피 스케일 시스템
10. 전역 푸터 & 법적 고지사항 표준 템플릿

---

## 1. 컴포넌트 & 스타일 아키텍처 (`common.css`, `common-header.js`)

### 5. 브레이크포인트 표준화
- **모바일 브레이크포인트**: `@media (max-width: 640px)`
- **데스크톱 브레이크포인트**: `@media (min-width: 1024px)`
- 기존의 레거시 `768px` 및 `900px` 미디어 쿼리를 위 2개의 표준 브레이크포인트로 통합.

### 6. 스켈레톤 UI & 엠프티 스테이트 컴포넌트
- **스켈레톤 펄스 쉬머 (`.skeleton-card`, `.skeleton-img`, `.skeleton-line`)**:
  - 선형 그라데이션 쉬머 애니메이션: `background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;`
- **엠프티 스테이트/빈 상태 (`.c-empty-state`)**:
  - 아이콘: 48px 크기 이모지 (`🔍` 또는 `💳`)
  - 제목: 17px Bold 700 (`var(--txt)`)
  - 부제목: 13.5px Regular (`var(--muted)`)
  - 액션 버튼: 표준 주요 버튼 (`.c-btn-primary`)

### 7. 통합 모달 & 바텀 시트 시스템 (`.c-modal`)
- **데스크톱 모드 (기본)**:
  - 중앙 정렬 오버레이 상자 (`backdrop-filter: blur(8px)`, `border-radius: 20px`, 그림자 `0 20px 40px rgba(0,0,0,0.2)`).
  - 우측 상단 닫기 버튼 `X`.
- **모바일 모드 (`@media (max-width: 640px)`)**:
  - 하단에서 올라오는 바텀 시트(Bottom Sheet): `position: fixed; bottom: 0; border-radius: 24px 24px 0 0; max-height: 85vh;`
  - 상단 드래그 표시 바 (`width: 36px; height: 4px; border-radius: 99px; background: var(--line);`).

### 8. 스마트 뒤로가기 버튼 (`.back`)
- `.back` 버튼을 위한 JavaScript 핸들러:
  ```javascript
  function handleSmartBack(fallbackUrl = '/index.html') {
    if (document.referrer && document.referrer.includes(location.host)) {
      history.back();
    } else {
      location.href = fallbackUrl;
    }
  }
  ```

### 9. 타이포그래피 스케일
- `H1` (페이지 제목): `24px / line-height: 1.3`, `font-weight: 800`
- `H2` (섹션 제목): `19px / line-height: 1.35`, `font-weight: 800`
- `H3` (서브 제목): `16px / line-height: 1.4`, `font-weight: 700`
- `Body 1` (본문 텍스트): `15px / line-height: 1.5`, `font-weight: 600`
- `Body 2` (보조 텍스트): `13.5px / line-height: 1.55`, `font-weight: 500`
- `Caption` (캡션/칩): `11.5px / line-height: 1.4`, `font-weight: 600`

### 10. 전역 푸터 (`.cf-global-footer`)
- `common-header.js` 또는 공통 스크립트를 통해 자동으로 추가됨:
  - 로고가 포함된 브랜드 섹션 🥊 **카드파이터**
  - 법적 고지사항: "본 서비스에서 제공하는 카드 혜택 정보는 카드사 사정에 따라 변동될 수 있습니다."
  - 저작권: `© 2026 CardFighter. All rights reserved.`

---

## 2. 파일 통합 범위
1. `common.css` - 전역 브레이크포인트, 스켈레톤, 모달, 바텀 시트, 타이포그래피
2. `common-header.js` - 전역 푸터 & 스마트 뒤로가기 버튼 헬퍼
3. `index.html` - 스켈레톤 로딩, 캐시백 모달, 푸터
4. `search.html` - 엠프티 스테이트, 스켈레톤 그리드, 브레이크포인트 정리
5. `detail.html` - 스마트 뒤로가기 버튼, 법적 고지사항, 푸터
6. `compare.html` - 모달, 스마트 뒤로가기 버튼, 푸터
7. `cardlab.html` - 푸터 & 타이포그래피 정렬
