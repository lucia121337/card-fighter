# card-fighter 팀 협업 설명서

> 이 문서 하나면 끝. **비개발자 팀원은 §0만 읽어도** 시작할 수 있고, 작업하는 사람은 §1~9를 따른다.
> 스택: **정적 HTML(index/detail/compare) + Vercel 서버리스(`api/`) + Node(Redis) + Python 스크래퍼**.
> 팀원마다 다른 AI 도구를 쓰므로 이 문서는 **사람도 AI도 읽는 절차서**다. (AI는 `CLAUDE.md`/`AGENTS.md` 등이 이 문서를 먼저 읽게 안내)

---

## §0. 큰 그림 (비개발자 먼저 읽기)

### 🎨 한 줄 비유 — "공동 벽화 그리기"
큰 벽화(=사이트)를 여럿이 그린다. 진짜 벽에 다 같이 그리면 덧칠돼서 엉망이 된다.
→ **벽화를 복사해 각자 자기 복사본에 그리고, 완성되면 순서대로 원본에 합친다.** Git이 이걸 해준다.

### 용어 5개
| 용어 | 쉬운 뜻 |
|------|---------|
| 브랜치 | 원본을 복사한 **내 작업용 복사본** |
| 풀(pull) | 원본 **최신본 내려받기** |
| 커밋(commit) | 작업 **중간 저장**(세이브) |
| 푸시(push) | 내 복사본 **서버에 올리기** |
| PR | "합쳐도 될까요?" **검토 요청** |
| 충돌 | 두 명이 **같은 자리**를 다르게 고친 상태 |

### 💡 팀원이 딱 기억할 3가지
> 1. 작업 전 **"받기(pull)"** — 남들 최신부터
> 2. **내 복사본(브랜치)에서만** 작업 — 원본(main) 직접 X
> 3. 공통 파일 건드리기 전 **"저 이거 손댈게요" 한마디**, 합칠 땐 **순서대로**

### 자세한 여는 법(사이트 미리보기)은 `docs/git-guide.html`(더블클릭)에 그림으로 있음.

---

## §1. 브랜치
```
main       배포/최종본 = 통합 브랜치 (Vercel 자동배포)
feature/*  기능 작업     (예: feature/trend-tab)
fix/*      버그 수정     (예: fix/naver-key-bom)
```
개인은 `main`에 **직접 작업·push 금지**. 항상 자기 브랜치를 따서 → **PR로만** main에 합친다.
(※ 팀이 커지면 `develop` 통합 브랜치를 추가할 수 있음. 지금은 main + feature 로 운영.)

## §2. 작업 흐름 5단계
```bash
git checkout main
git pull origin main               # ① 최신 받기 (먼저!)
git checkout -b feature/작업명       # ② 내 브랜치
#   ... 작업 + git add + git commit ...   ③ 작업/저장
git push origin feature/작업명       # ④ 내 브랜치만 push
#   ⑤ GitHub에서 main 대상 PR 생성 → 리뷰 후 merge → 브랜치 삭제
```

## §3. 커밋 메시지
의미 단위로, 타입을 붙인다. ("수정", "최종", "진짜최종" 금지)
```
feat: 기능 추가   fix: 버그 수정   refactor: 구조 개선   style: 포맷/디자인
docs: 문서        chore: 설정/패키지/빌드
```
예) `feat: 트렌드분석 탭 추가` · `fix: 네이버 API 키 BOM 제거`

## §4. Pull Request
main에 바로 합치지 말고 PR로. 제목: `[feat] 트렌드분석 탭 추가`
본문(**상대가 어떻게 확인하는지**가 핵심):
```
## 작업 내용   - 무엇을 만들었나
## 확인 방법   - 로컬 미리보기(§5) 후 어느 화면/기능을 보면 되는지
## 영향 범위   - index.html, api/naver-trends.js 등
## 참고/미완료 - 남은 것
```
권장: main 직접 push 금지 + **PR 최소 1인 리뷰 후 Squash merge**.

## §5. Merge 전 체크 (하이브리드 스택)
```bash
git pull origin main                       # ① 최신 main 반영

# ② 정적 화면 미리보기 (index/detail/compare)
python serve.py                            #   → http://localhost:5500 (권장)
#   (파일 더블클릭(file://)은 cards.json 로드가 막혀 카드가 안 뜸 → 반드시 서버로)
#   ※ 그냥 `python -m http.server` 로 띄우면 /detail·/compare 링크(카드 상세보기)가
#     404("Error response") 난다. serve.py 는 vercel.json 리라이트를 재현해 배포와 동일하게 보임.

# ③ api/ 서버리스(네이버 트렌드 등)를 건드렸다면
npm install
vercel dev                                 #   → 서버리스 포함 로컬 실행

# ④ 스크래퍼/데이터를 바꿨다면 재수집·검증
py -3.12 scrape_cards.py                    #   cards.json/csv 재생성
py -3.12 verify_firstpage.py               #   수집 검증
```
체크리스트: ①최신 반영 ②화면 정상 ③임시 `console.log` 제거 ④**`.env`(네이버 키·Redis 토큰)·`node_modules` 커밋 안 됨** ⑤PR 본문 작성

---

## §6. 겹침 방지 (★ 핵심 — Git 규칙만으론 부족)
겹침 2종류: **①같은 파일 동시수정(충돌)** + **②같은 일 중복작업(헛수고)**. 둘 다 사람이 나눠야 막힌다.

### 6-1. 담당을 "파일 단위"로 나눈다
| 담당 | 주로 만지는 파일 |
|------|-----------------|
| 프론트/화면 | `index.html`, `detail.html`, `compare.html` |
| 서버리스 API | `api/naver-trends.js` |
| 데이터 수집 | `scrape_cards.py`, `scrape_full.js`, `split_detail.js` |
| 데이터/이미지 | `cards*.json`, `card_detail/`, `image/` |

### 6-2. 작업 보드 (누가·뭘·어디파일·상태) — 중복작업 방지
노션/깃허브 이슈/카톡 고정글 아무거나. **"머지중 🔴"** 상태를 두고, 켜져 있으면 다른 사람은 머지 대기(§6-4).
| 담당자 | 작업 | 만지는 파일 | 브랜치 | 상태 |
|--------|------|-------------|--------|------|
| 규빈 | 트렌드 탭 | index.html, api/naver-trends.js | feature/trend-tab | 진행중 |

### 6-3. 위험한 공통 파일 — 수정 전 팀 채팅에 먼저 공유
```
index.html            (화면 전체가 큰 한 파일)
package.json / package-lock.json   (패키지)
vercel.json           (배포 설정)
cards.json / cards_list.json       (공통 데이터)
api/naver-trends.js   (공통 서버리스)
.gitignore
```
> "저 index.html 헤더 손볼게요", "package.json에 라이브러리 추가할게요" 한마디면 예방.

### 6-4. 머지할 때 — "머지 4박자" (동시 머지 사고 방지)
```
① 합치기 전, 최신본을 내 복사본에 먼저 반영  (git pull origin main → 바뀐 것 확인·정리)
② 로컬 미리보기로 잘 되는지 확인 후 PR
③ 내 차례에만 머지 (보드에 "머지중 🔴", 앞사람 끝난 뒤)
④ 머지 끝나면 → 나머지도 각자 git pull origin main
```
> 💡 처음 한 번은 더미 브랜치로 리허설(pull·커밋·PR·충돌 정리)을 다 같이 해보면 문서가 진짜 작동한다.

---

## §7. 충돌 났을 때
```bash
git checkout feature/내작업
git pull origin main     # 충돌 발생
# 파일 안의 <<<<<<< / ======= / >>>>>>> 구간을 직접 정리 → 미리보기 확인 → 재커밋
```
- 혼자 덮어쓰지 말고 **같은 파일 건드린 사람과 확인**. `<<<<<<<` 표시 남은 채 커밋 금지.

## §8. 금지사항
```
1. main 직접 push 금지 (항상 feature 브랜치 → PR)
2. pull 안 하고 작업 시작 금지
3. 작업 브랜치 없이 수정 금지
4. .env · 네이버 API 키 · Upstash Redis 토큰 · 비밀번호 커밋 금지
5. node_modules / .vercel 커밋 금지 (.gitignore 확인)
6. 충돌 파일 대충 덮어쓰기 금지
7. 남의 담당 파일 임의 수정 금지 (먼저 공유)
8. 미리보기 깨진 상태로 PR 금지
9. "최종", "수정" 같은 의미 없는 커밋 메시지 금지
```

---
**요약**: 작업 전 `git pull origin main` → 내 feature 브랜치에서만 → 파일 단위로 담당 나누고 → 공통 파일은 먼저 공유 → PR로만, 머지는 순서대로. 이거면 팀 사고의 대부분이 막힌다.
