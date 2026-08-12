/**
 * verify_patched_db.js — DB 안전 패치 검증 스크립트
 */

import fs from 'fs';
import path from 'path';

const dbDataPath = path.resolve('src/picking/calculator_data.json');
const dbData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));

// idx 731 카드 (현대카드Z work) 검증
const card731Items = dbData.benefit_items.filter(b => b.card_id === 731);

console.log("==========================================");
console.log("🔍 [DB 안전 패치 검증] 현대카드Z work (idx: 731) 적재 상태");
console.log("==========================================");
card731Items.forEach(it => {
  console.log(`- 혜택 항목: ${it.title} | item_limit: ${it.item_limit}`);
});

console.log("\n==========================================");
console.log("🔍 [배열 구조 정합성 검증]");
const cafeItem = card731Items.find(it => it.title === '카페');
if (cafeItem) {
  const parsedLimit = JSON.parse(cafeItem.item_limit);
  console.log("카페 item_limit 파싱 객체:", parsedLimit);
  console.log("배열 구조 여부:", Array.isArray(parsedLimit));
  console.log("80만원 구간 (13,000원) 포함 여부:", parsedLimit.some(p => p.perf === 800000 && p.limit === 13000));
}
