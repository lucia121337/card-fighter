/**
 * cards_list.json 에 `cate`(CRD=신용 / CHK=체크) 필드를 백필한다.
 *
 * 배경: index.html 의 전체카드 LNB는 `c.cate === 'CHK' ? '체크' : '신용'` 으로 탭을 가르는데,
 * cards_list.json 은 DB 빌드 과정에서 cate 컬럼이 빠진 채 생성돼 있어 전 카드가 '신용'으로
 * 판정됐다 → 체크카드 탭 0건.
 *
 * 출처 우선순위
 *   1) cards_full.json  : 크롤링 원본에 cate(CRD/CHK)가 그대로 남아있음 (1,276장)
 *   2) cards.json       : 신용카드만 수집된 구 스냅샷 (1,111장) → 여기 있으면 CRD
 *   3) 카드명 휴리스틱  : '체크'/'Check' 포함 시 CHK
 *   4) 기본값 CRD
 *
 * 사용: node scripts/backfill_cate.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const list = readJson('cards_list.json');
const full = new Map(readJson('cards_full.json').map(c => [String(c.idx), c.cate]));
const legacyCredit = new Set(readJson('cards.json').map(c => String(c.idx)));

const stat = { full: 0, legacy: 0, name: 0, fallback: 0 };

for (const card of list) {
  const idx = String(card.idx);
  let cate;
  if (full.has(idx) && full.get(idx)) { cate = full.get(idx); stat.full++; }
  else if (legacyCredit.has(idx)) { cate = 'CRD'; stat.legacy++; }
  else if (/체크|check/i.test(card.card_name || '')) { cate = 'CHK'; stat.name++; }
  else { cate = 'CRD'; stat.fallback++; }
  card.cate = cate;
}

fs.writeFileSync(path.join(ROOT, 'cards_list.json'), JSON.stringify(list, null, 2), 'utf8');

const chk = list.filter(c => c.cate === 'CHK').length;
console.log(`총 ${list.length}장 — 신용 ${list.length - chk} / 체크 ${chk}`);
console.log('출처:', stat);
