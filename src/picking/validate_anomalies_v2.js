/**
 * validate_anomalies_v2.js — 고도화된 전수 탐지기 (Validator v2)
 * 
 * 1. 복수 실적 구간 존재 하나 item_limit이 단일 숫자/1개 구간으로 유실된 카드
 * 2. '건당 결제 조건(예: 7만원)'과 '월 한도(예: 2만원, 4만원)'가 혼동되어 perf와 limit이 뒤바뀐 카드 (perf < limit 역전 오파싱)
 * 3. 혜택 원문에 '할인한도 N만원' 문구가 명시되어 있으나 item_limit이 일치하지 않는 카드
 * 
 * 위 세 가지 유형을 전수 스캔하여 target_cards.json으로 추출합니다.
 */

import fs from 'fs';
import path from 'path';

const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

const targetCards = [];

cardsFull.forEach(card => {
  let fullText = '';
  if (Array.isArray(card.key_benefit)) {
    card.key_benefit.forEach(b => {
      fullText += (b.info || '') + ' ';
    });
  }
  if (card.detailed_benefits) {
    fullText += String(card.detailed_benefits) + ' ';
  }

  // A. 복수 실적 구간 정규식 탐지
  const perfMatches = fullText.match(/(\d+)\s*만\s*원?\s*(?:이상|초과|미만|시)/g) || [];
  const uniquePerfs = new Set(perfMatches.map(m => m.replace(/\s+/g, '')));

  // B. 할인한도 문구 존재 탐지
  const hasLimitText = /할인한도\s*[\d,]+[만천]?\s*원|한도\s*[\d,]+[만천]?\s*원/i.test(fullText);

  let bItems = card.structured_benefits;
  let isAnomalous = false;
  let anomalyReason = '';

  if (Array.isArray(bItems)) {
    bItems.forEach(it => {
      let lim = it.item_limit;
      if (typeof lim === 'string') {
        try { lim = JSON.parse(lim); } catch { lim = it.item_limit; }
      }

      // 탐지 조건 1: 복수 실적 구간 텍스트가 있는데 item_limit이 단일 수치 또는 1개 배열인 경우
      if (uniquePerfs.size >= 2 && (typeof lim === 'number' || (Array.isArray(lim) && lim.length === 1))) {
        isAnomalous = true;
        anomalyReason = '복수 실적 구간 유실';
      }

      // 탐지 조건 2: perf 와 limit 역전 오류 (예: perf: 10000, limit: 400000 처럼 실적과 한도가 뒤바뀜)
      if (Array.isArray(lim)) {
        lim.forEach(p => {
          if (p.perf && p.limit && p.perf < p.limit && p.limit >= 100000) {
            isAnomalous = true;
            anomalyReason = '한도 vs 조건 역전 오류';
          }
        });
      }

      // 탐지 조건 3: 원문에 '할인한도' 명시되어 있으나 item_limit이 단일 숫자이고 텍스트에 2개 이상의 한도 수치가 파싱 가능한 경우
      if (hasLimitText && (typeof lim === 'number' || lim === -1)) {
        isAnomalous = true;
        anomalyReason = '할인한도 미반영';
      }
    });
  } else {
    isAnomalous = true;
    anomalyReason = 'structured_benefits 구조 부재';
  }

  if (isAnomalous) {
    targetCards.push({
      idx: card.idx,
      card_name: card.card_name,
      company: card.company,
      reason: anomalyReason,
      detected_perfs: Array.from(uniquePerfs)
    });
  }
});

console.log(`==========================================`);
console.log(`🔍 [Validator v2 전수 스캔 결과]`);
console.log(`총 ${cardsFull.length}개 카드 중 정비 대상 타겟 카드 ${targetCards.length}개 발견`);
console.log(`==========================================`);
console.log(JSON.stringify(targetCards.slice(0, 10), null, 2));

// 타겟 카드 저장
fs.writeFileSync('src/picking/target_cards.json', JSON.stringify(targetCards, null, 2), 'utf8');
