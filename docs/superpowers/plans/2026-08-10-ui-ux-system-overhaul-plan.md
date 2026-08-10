# UI/UX 시스템 종합 개편 (항목 5~10) 구현 계획서

> **작업자를 위한 필수 규칙:** `superpowers:subagent-driven-development` (권장) 또는 `superpowers:executing-plans` 스킬을 사용하여 작업을 단계별로 이행합니다. 각 단계는 체크리스트 (`- [ ]`) 항목으로 관리됩니다.

**목표:** 6가지 핵심 UI/UX 시스템 개선사항인 (5) 640px/1024px 반응형 중단점 통일, (6) 스켈레톤 로딩 UI & 빈 상태(Empty State) 디자인 강화, (7) 모바일 바텀시트 모달 시스템 구축, (8) 스마트 뒤로가기 동선 개선, (9) 타이포그래피 스케일 정립, (10) 공통 하단 푸터 & 법적 고지 템플릿 배치를 전체 카드파이터 서비스에 구현합니다.

**아키텍처:** `common.css` 및 `common-header.js`에 공통 타이포그래피, 스켈레톤 쉬머 애니메이션, 바텀시트 모달, 스마트 뒤로가기 헬퍼, 공통 푸터 렌더러를 정의한 후 `index.html`, `search.html`, `detail.html`, `compare.html`, `cardlab.html`에 일괄 적용합니다.

**기술 스택:** Vanilla CSS, JavaScript, HTML5.

## 전역 제약사항
- 모든 텍스트, 코드 주석 및 설명은 한국어로만 작성합니다.
- 워크스페이스 내부의 상대 경로를 사용합니다.
- 기존 이벤트 리스너 및 서비스 기능을 손상 없이 그대로 유지합니다.

---

### 작업 1: 공통 CSS 및 JS 핵심 모듈 구현 (`common.css`, `common-header.js`)

**대상 파일:**
- 수정: `common.css`
- 수정: `common-header.js`

- [ ] **단계 1: 타이포그래피, 스켈레톤 UI, 모달 & 바텀시트, 반응형 중단점 규칙 추가 (`common.css`)**

`common.css` 파일 하단에 전역 타이포그래피 스케일, `.skeleton-card`, `.c-empty-state`, `.c-modal`, `.c-bottom-sheet`, 그리고 `640px`(모바일) / `1024px`(데스크톱) 미디어 쿼리 표준 규칙을 작성합니다.

- [ ] **단계 2: 스마트 뒤로가기 헬퍼 및 공통 푸터 렌더러 작성 (`common-header.js`)**

`common-header.js` 파일에 `window.handleSmartBack()` 함수와 페이지 하단 자동 푸터 주입 함수(`initFooter()`)를 구현합니다.

- [ ] **단계 3: 검증 스크립트 실행**

명령어: `curl -I http://127.0.0.1:5500/common.css && curl -I http://127.0.0.1:5500/common-header.js`
예상 결과: 모두 `HTTP 200 OK` 응답 확인

- [ ] **단계 4: Git 커밋**

```bash
git add common.css common-header.js
git commit -m "feat: add global typography, skeleton UI, bottom sheet modal, and smart back helper to core CSS/JS"
```

---

### 작업 2: 메인 페이지 카드 스켈레톤 로딩, 바텀시트 모달 적용 (`index.html`)

**대상 파일:**
- 수정: `index.html`

- [ ] **단계 1: 로딩 시 스피너 대신 카드형 스켈레톤 로딩 Placeholder 적용**

`index.html` 카드 목록의 초기 로딩 영역을 3개의 `.skeleton-card` 쉬머 UI로 대체합니다.

- [ ] **단계 2: 캐시백 팝업 모달을 모바일(`max-width: 640px`) 바텀시트 구조로 전환**

`index.html` 내 모달 팝업 요소에 공통 `.c-modal` 및 `.c-bottom-sheet` 반응형 구조를 반영합니다.

- [ ] **단계 3: 검증 스크립트 실행**

명령어: `curl -I http://127.0.0.1:5500/`
예상 결과: `HTTP 200 OK` 응답 확인

- [ ] **단계 4: Git 커밋**

```bash
git add index.html
git commit -m "feat: implement skeleton UI, bottom sheet cashback modal, and global footer in index.html"
```

---

### 작업 3: 서브 페이지 스마트 뒤로가기, 빈 상태, 공통 푸터 적용 (`detail.html`, `search.html`, `compare.html`, `cardlab.html`)

**대상 파일:**
- 수정: `detail.html`
- 수정: `search.html`
- 수정: `compare.html`
- 수정: `cardlab.html`

- [ ] **단계 1: 상세페이지 및 비교하기 화면 뒤로가기 버튼 연동**

`detail.html` 및 `compare.html` 상단 `.back` 버튼 클릭 시 `handleSmartBack()`이 실행되도록 연결합니다.

- [ ] **단계 2: 검색 결과 없음 화면 빈 상태(Empty State) UI 적용**

`search.html`에 검색 결과가 없을 경우 공통 `.c-empty-state` 컴포넌트를 렌더링하도록 반영합니다.

- [ ] **단계 3: 전체 엔드포인트 검증**

명령어: `curl -I http://127.0.0.1:5500/search.html && curl -I http://127.0.0.1:5500/detail/2691 && curl -I http://127.0.0.1:5500/compare && curl -I http://127.0.0.1:5500/cardlab`
예상 결과: 모든 엔드포인트 `HTTP 200 OK` 응답 확인

- [ ] **단계 4: Git 커밋**

```bash
git add detail.html search.html compare.html cardlab.html
git commit -m "feat: apply smart back button, skeleton UI, empty state, and footer across detail, search, compare, cardlab"
```
