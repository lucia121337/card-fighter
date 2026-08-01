/**
 * targeted_range_reparse.js — 상한선(~미만/이하) 포함 구간형 실적 조건 전수 탐지 및 정밀 재파싱 스크립트
 */

import fs from 'fs';
import path from 'path';

function parseKoreanAmount(str) {
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
    if (!isNaN(manVal)) total += Math.round(manVal * 10000);
    const rest = parts[1] || '';
    if (rest) {
      const chunMatch = rest.match(/(\d+(?:\.\d+)?)천/);
      if (chunMatch) {
        total += Math.round(parseFloat(chunMatch[1]) * 1000);
      } else {
        const numMatch = rest.match(/(\d+)/);
        if (numMatch) {
          const n = parseInt(numMatch[1], 10);
          total += (n < 10) ? n * 1000 : n;
        }
      }
    }
  } else if (s.includes('천')) {
    const chunMatch = s.match(/(\d+(?:\.\d+)?)천/);
    if (chunMatch) total += Math.round(parseFloat(chunMatch[1]) * 1000);
  } else {
    const numOnly = s.match(/\d+/);
    if (numOnly) total = parseInt(numOnly[0], 10);
  }
  return total;
}

// 상한선(min_perf & max_perf)이 지원되는 텍스트/테이블 파서
function parseRangeTiers(text) {
  if (!text) return null;
  const tiers = [];

  // 패턴 1: "40만원 이상 ~ 80만원 미만 : 10,000원"
  const reRangeWithLimit = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과)?\s*~\s*([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:미만|이하)?\s*(?:시)?[\s\S]{0,60}?([\d,]+[만천]?\s*원|[\d.]+\s*만\s*\d+천\s*원|[\d.]+\s*만\s*\d+\s*원)/gi;
  let m;
  let safe = 0;
  while ((m = reRangeWithLimit.exec(text)) !== null && safe++ < 50) {
    const minP  = Math.round(parseFloat(m[1]) * 10000);
    const maxP  = Math.round(parseFloat(m[2]) * 10000);
    const limit = parseKoreanAmount(m[3]);
    if (minP >= 100000 && maxP > minP && limit >= 1000 && limit < minP) {
      tiers.push({ perf: minP, min_perf: minP, max_perf: maxP, limit });
    }
  }

  // 패턴 2: "80만원 이상 : 20,000원" (최상위 상한선 없음)
  const reSingleHigh = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과)\s*(?:시)?[\s\S]{0,60}?([\d,]+[만천]?\s*원|[\d.]+\s*만\s*\d+천\s*원|[\d.]+\s*만\s*\d+\s*원)/gi;
  safe = 0;
  while ((m = reSingleHigh.exec(text)) !== null && safe++ < 50) {
    const minP  = Math.round(parseFloat(m[1]) * 10000);
    const limit = parseKoreanAmount(m[2]);
    if (minP >= 100000 && limit >= 1000 && limit < minP) {
      // 이미 같은 minP가 등록되지 않은 경우
      if (!tiers.some(t => t.min_perf === minP)) {
        tiers.push({ perf: minP, min_perf: minP, max_perf: null, limit });
      }
    }
  }

  if (tiers.length === 0) return null;

  // 오름차순 정렬 및 max_perf 보정
  tiers.sort((a, b) => a.min_perf - b.min_perf);
  for (let i = 0; i < tiers.length - 1; i++) {
    if (tiers[i].max_perf == null) {
      tiers[i].max_perf = tiers[i + 1].min_perf;
    }
  }

  return tiers;
}

// 1. 데이터 로드 및 탐지
const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

let targetCount = 0;
let patchedCount = 0;

cardsFull.forEach(card => {
  let fullText = '';
  if (Array.isArray(card.key_benefit)) {
    card.key_benefit.forEach(b => { fullText += (b.info || '') + ' '; });
  }
  if (card.detailed_benefits) {
    fullText += String(card.detailed_benefits) + ' ';
  }

  // 상한선 키워드 탐지
  const hasRangeKeyword = /미만|이하|~/i.test(fullText);
  if (!hasRangeKeyword) return;

  targetCount++;
  let modified = false;

  const keyBenefits = card.key_benefit || [];
  if (Array.isArray(card.structured_benefits)) {
    card.structured_benefits.forEach((bItem, idx) => {
      const kb = keyBenefits[idx];
      const textToParse = (kb ? kb.info : '') + ' ' + (bItem.detail || '');
      const parsedRangeTiers = parseRangeTiers(textToParse);

      if (parsedRangeTiers && parsedRangeTiers.length >= 2) {
        bItem.item_limit = parsedRangeTiers;
        modified = true;
      }
    });
  }

  if (modified) {
    patchedCount++;
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
console.log(`🚀 [Range Tiers 파싱 & 배치 재패싱 완료]`);
console.log(`상한선 키워드 존재 카드: ${targetCount}개 중 ${patchedCount}개 카드의 min_perf / max_perf 구간 데이터 패치 완료`);
console.log(`==========================================`);

// 저장
fs.writeFileSync(cardsFullPath, JSON.stringify(cardsFull, null, 2), 'utf8');
const cardsListPath = path.resolve('cards_list.json');
if (fs.existsSync(cardsListPath)) {
  fs.writeFileSync(cardsListPath, JSON.stringify(cardsFull, null, 2), 'utf8');
}
