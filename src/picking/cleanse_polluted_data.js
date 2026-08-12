/**
 * cleanse_polluted_data.js — 오염 데이터 전수 스캔 및 일괄 클렌징 패치 스크립트
 */

import fs from 'fs';
import path from 'path';

// 1. 교정된 parseKoreanAmount 함수
export function parseKoreanAmount(str) {
  if (!str) return 0;

  const numKoreanMap = { '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '칠': 7, '팔': 8, '구': 9 };
  let s = String(str).trim();
  
  if (s.includes('만') || s.includes('천')) {
    s = s.replace(/([일이삼사오육칠팔구])(?=[만천])/g, (_, p1) => numKoreanMap[p1] || p1);
  }

  s = s.replace(/,/g, '').replace(/\s+/g, '').trim();

  let total = 0;

  if (s.includes('만')) {
    const parts = s.split('만');
    const manVal = parseFloat(parts[0]);
    if (!isNaN(manVal)) {
      total += Math.round(manVal * 10000);
    }
    const rest = parts[1] || '';
    if (rest) {
      const chunMatch = rest.match(/(\d+(?:\.\d+)?)천/);
      if (chunMatch) {
        total += Math.round(parseFloat(chunMatch[1]) * 1000);
      } else {
        const numMatch = rest.match(/(\d+)/);
        if (numMatch) {
          const n = parseInt(numMatch[1], 10);
          if (n < 10) {
            total += n * 1000;
          } else {
            total += n;
          }
        }
      }
    }
  } else if (s.includes('천')) {
    const chunMatch = s.match(/(\d+(?:\.\d+)?)천/);
    if (chunMatch) {
      total += Math.round(parseFloat(chunMatch[1]) * 1000);
    }
  } else {
    const numOnly = s.match(/\d+/);
    if (numOnly) {
      total = parseInt(numOnly[0], 10);
    }
  }

  return total;
}

// 오염 데이터 검사 및 교정 함수 (예: 10003 -> 13000, 5003 -> 8000/5000 등)
function fixPollutedLimit(lim) {
  if (typeof lim === 'number') {
    if (lim > 10000 && lim < 10010) {
      return (lim - 10000) * 1000 + 10000; // 예: 10003 -> 13000
    }
    if (lim > 5000 && lim < 5010) {
      return (lim - 5000) * 1000 + 5000; // 예: 5003 -> 8000
    }
  } else if (Array.isArray(lim)) {
    return lim.map(item => {
      if (item && typeof item.limit === 'number') {
        let l = item.limit;
        if (l > 10000 && l < 10010) {
          l = (l - 10000) * 1000 + 10000;
        } else if (l > 5000 && l < 5010) {
          l = (l - 5000) * 1000 + 5000;
        }
        return { ...item, limit: l };
      }
      return item;
    });
  }
  return lim;
}

// 2. cards_full.json 전수 스캔 및 교정
const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

let pollutedCardCount = 0;
let fixedItemCount = 0;

cardsFull.forEach(card => {
  let isCardPolluted = false;

  if (Array.isArray(card.structured_benefits)) {
    card.structured_benefits.forEach(bItem => {
      let lim = bItem.item_limit;
      let rawStr = JSON.stringify(lim);
      
      // 오염 패턴 탐지 (예: 10003, 5003 등 10000대/5000대의 비정상 끝자리)
      if (/1000[1-9]|500[1-9]/.test(rawStr)) {
        const fixedLim = fixPollutedLimit(lim);
        bItem.item_limit = fixedLim;
        isCardPolluted = true;
        fixedItemCount++;
      }
    });
  }

  if (isCardPolluted) {
    pollutedCardCount++;
    if (Array.isArray(card.structured_benefits)) {
      card.item_limit = card.structured_benefits
        .map(b => JSON.stringify(b.item_limit))
        .join(' | ');
    }

    // 개별 card_detail 업데이트
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

console.log(`[오염 데이터 클렌징 결과] 오염 발견 카드: ${pollutedCardCount}개, 교정된 혜택 항목: ${fixedItemCount}개`);

// cards_full.json 및 cards_list.json 저장
fs.writeFileSync(cardsFullPath, JSON.stringify(cardsFull, null, 2), 'utf8');
const cardsListPath = path.resolve('cards_list.json');
if (fs.existsSync(cardsListPath)) {
  fs.writeFileSync(cardsListPath, JSON.stringify(cardsFull, null, 2), 'utf8');
}
