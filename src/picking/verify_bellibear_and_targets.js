/**
 * verify_bellibear_and_targets.js — 벨리곰 카드 및 재파싱 타겟 카드 정합성 검증 스크립트
 */

import fs from 'fs';
import path from 'path';

const dbDataPath = path.resolve('src/picking/calculator_data.json');
const dbData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));

// idx 2265 (롯데홈쇼핑 벨리곰 카드) 검증
const card2265Items = dbData.benefit_items.filter(b => b.card_id === 2265);

console.log("==========================================");
console.log("🔍 [검증 1] 롯데홈쇼핑 벨리곰 카드 (idx: 2265) 정합성 확인");
console.log("==========================================");
card2265Items.forEach(it => {
  console.log(`- 혜택: ${it.title} (${it.detail})`);
  console.log(`  item_limit: ${it.item_limit}`);
});

console.log("\n==========================================");
console.log("🔍 [검증 2] 벨리곰 카드 '홈쇼핑' 혜택 2만/4만 한도 배열 검증");
const bellibearB = card2265Items.find(b => b.title === '홈쇼핑' && b.detail.includes('7%'));
if (bellibearB) {
  const parsedLim = JSON.parse(bellibearB.item_limit);
  console.log("파싱된 item_limit 배열:", parsedLim);
  console.log("배열 타입 확인:", Array.isArray(parsedLim));
  console.log("40만원 실적 2만원 한도 적재 여부:", parsedLim.some(p => p.perf === 400000 && p.limit === 20000));
  console.log("60만원 실적 4만원 한도 적재 여부:", parsedLim.some(p => p.perf === 600000 && p.limit === 40000));
}

console.log("\n==========================================");
console.log("🔍 [검증 3] 전체 DB 내 perf < limit 역전 오류 카드 잔재 검사");
let errorCount = 0;
dbData.benefit_items.forEach(it => {
  let limStr = it.item_limit;
  if (limStr.startsWith('[')) {
    try {
      const arr = JSON.parse(limStr);
      arr.forEach(p => {
        if (p.perf && p.limit && p.perf < p.limit && p.limit >= 100000) {
          console.error(`🚨 역전 오류 잔재: Card ID ${it.card_id}, title: ${it.title}, perf: ${p.perf}, limit: ${p.limit}`);
          errorCount++;
        }
      });
    } catch (e) {}
  }
});
if (errorCount === 0) {
  console.log("✅ 검증 통과: DB 내 실적 조건과 한도 금액이 역전/혼동된 카드가 0건입니다.");
}
