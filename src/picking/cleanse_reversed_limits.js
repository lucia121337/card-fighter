/**
 * cleanse_reversed_limits.js — 실적 조건 vs 월 한도 역전 데이터 전수 일괄 자동 교정 스크립트
 */

import fs from 'fs';
import path from 'path';

const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

let fixedCardCount = 0;
let fixedItemCount = 0;

cardsFull.forEach(card => {
  let isCardFixed = false;

  if (Array.isArray(card.structured_benefits)) {
    card.structured_benefits.forEach(bItem => {
      let lim = bItem.item_limit;
      if (Array.isArray(lim)) {
        lim.forEach(p => {
          // perf와 limit이 뒤바뀐 경우 (예: perf: 400000, limit: 800000 또는 perf: 10000, limit: 400000)
          if (p.perf && p.limit && p.perf < p.limit && p.limit >= 100000) {
            const temp = p.perf;
            p.perf = p.limit;
            p.limit = temp;
            isCardFixed = true;
            fixedItemCount++;
          }
        });
      }
    });
  }

  if (isCardFixed) {
    fixedCardCount++;
    card.item_limit = card.structured_benefits
      .map(b => JSON.stringify(b.item_limit))
      .join(' | ');

    const detailPath = path.resolve(`card_detail/${card.idx}.json`);
    if (fs.existsSync(detailPath)) {
      try {
        const dObj = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
        dObj.structured_benefits = card.structured_benefits;
        dObj.item_limit = card.item_limit;
        fs.writeFileSync(detailPath, JSON.stringify(dObj, null, 2), 'utf8');
      } catch (e) {}
    }
  }
});

console.log(`==========================================`);
console.log(`🚀 [역전 한도 데이터 전수 자동 교정 완료]`);
console.log(`총 ${fixedCardCount}개 카드의 ${fixedItemCount}개 역전 항목 교정 완료`);
console.log(`==========================================`);

// 저장
fs.writeFileSync(cardsFullPath, JSON.stringify(cardsFull, null, 2), 'utf8');
const cardsListPath = path.resolve('cards_list.json');
if (fs.existsSync(cardsListPath)) {
  fs.writeFileSync(cardsListPath, JSON.stringify(cardsFull, null, 2), 'utf8');
}
