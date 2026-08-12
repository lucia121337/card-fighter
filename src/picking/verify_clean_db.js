/**
 * verify_clean_db.js — DB 오염 수치 최종 검증 스크립트
 */

import fs from 'fs';
import path from 'path';

const dbDataPath = path.resolve('src/picking/calculator_data.json');
const dbData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));

let pollutedFound = 0;

dbData.benefit_items.forEach(item => {
  const limStr = String(item.item_limit);
  if (/1000[1-9]|500[1-9]/.test(limStr)) {
    console.error(`🚨 오염 잔재 발견! Card ID: ${item.card_id}, Title: ${item.title}, item_limit: ${limStr}`);
    pollutedFound++;
  }
});

console.log("==========================================");
console.log("🔍 [DB 오염 수치 전수 스캔 최종 검증 결과]");
console.log("==========================================");
if (pollutedFound === 0) {
  console.log("✅ 전수 스캔 결과: DB 내 단위 파싱 오염 데이터(10,003원, 5,003원 등) 0건! 완벽히 클렌징되었습니다.");
} else {
  console.log(`❌ 전수 스캔 결과: ${pollutedFound}건의 오염 데이터 발견`);
}

// 731번 카드 검증 콘솔 출력
const card731Items = dbData.benefit_items.filter(b => b.card_id === 731);
console.log("\n[주요 카드 731번 검증]");
card731Items.forEach(it => {
  console.log(`- 혜택: ${it.title} -> ${it.item_limit}`);
});
