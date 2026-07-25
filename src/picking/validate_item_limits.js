import fs from 'fs';
import path from 'path';

console.log("==========================================");
console.log("🔍 [검증] cards_full.json vs calculator_data.json 혜택 한도(item_limit) 1:1 전수 비교");
console.log("==========================================");

const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

const dbDataPath = path.resolve('src/picking/calculator_data.json');
const dbData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));

const dbItems = dbData.benefit_items;

  let totalItemsChecked = 0;
  let mismatchCount = 0;
  const mismatches = [];

  const cardMap = new Map();
  cardsFull.forEach(c => cardMap.set(c.idx, c));

  // DB 항목을 card_id별 그룹화
  const dbItemsByCard = new Map();
  dbItems.forEach(item => {
    if (!dbItemsByCard.has(item.card_id)) dbItemsByCard.set(item.card_id, []);
    dbItemsByCard.get(item.card_id).push(item);
  });

  dbItemsByCard.forEach((items, card_id) => {
    const card = cardMap.get(card_id);
    if (!card) {
      mismatchCount++;
      mismatches.push(`[오류] DB card_id ${card_id}에 해당하는 원본 카드가 없음`);
      return;
    }

    const origBenefits = card.structured_benefits || [];
    items.forEach((dbItem, i) => {
      totalItemsChecked++;
      const origMatched = origBenefits[i];

      if (origMatched) {
        const origLimitStr = typeof origMatched.item_limit !== 'undefined'
          ? (typeof origMatched.item_limit === 'object' ? JSON.stringify(origMatched.item_limit) : String(origMatched.item_limit))
          : (typeof origMatched.amount === 'object' ? JSON.stringify(origMatched.amount) : String(origMatched.amount || 0));
        
        const dbLimitStr = String(dbItem.item_limit);

        if (origLimitStr !== dbLimitStr) {
          mismatchCount++;
          mismatches.push(`[불일치] 카드 IDX: ${dbItem.card_id} (${card.card_name}) | 항목[${i}]: "${dbItem.title}" -> 원본 limit: ${origLimitStr} vs DB limit: ${dbLimitStr}`);
        }
      }
    });
  });

  console.log(`- 검증 항목 수: 총 ${totalItemsChecked}개`);
  console.log(`- 불일치 항목 수: ${mismatchCount}개`);

  if (mismatchCount === 0) {
    console.log("✅ [성공] 모든 DB 적재 혜택 한도(item_limit)가 원본 cards_full.json과 100% 1:1 일치합니다!");
  } else {
    console.log("❌ [오류 발견] 아래 항목에서 오차가 발생했습니다:");
    mismatches.forEach(m => console.log("  ", m));
  }
