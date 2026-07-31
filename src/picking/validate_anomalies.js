/**
 * validate_anomalies.js — 비정상 데이터 자동 탐지기 (Validator)
 * 
 * cards_full.json 전수 조사를 통해 혜택 원문 텍스트에 복수 전월실적 구간이 존재함에도 
 * item_limit이 단일 숫자나 1개 구간으로 유실된 카드 목록을 자동 추출합니다.
 */

import fs from 'fs';
import path from 'path';

const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

const targetCards = [];

cardsFull.forEach(card => {
  // 혜택 원문 텍스트 수집
  let fullText = '';
  if (Array.isArray(card.key_benefit)) {
    card.key_benefit.forEach(b => {
      fullText += (b.info || '') + ' ';
    });
  }
  if (card.detailed_benefits) {
    fullText += String(card.detailed_benefits) + ' ';
  }

  // 복수 실적 구간 패턴 검사 (예: "40만원", "80만원", "30만원", "50만원" 등 실적 언급 2개 이상)
  const perfMatches = fullText.match(/(\d+)\s*만\s*원?\s*(?:이상|초과|시)/g) || [];
  const uniquePerfs = new Set(perfMatches.map(m => m.replace(/\s+/g, '')));

  if (uniquePerfs.size >= 2) {
    // 현재 item_limit 구조 검사
    let bItems = card.structured_benefits;
    let isAnomalous = false;

    if (Array.isArray(bItems)) {
      bItems.forEach(it => {
        let lim = it.item_limit;
        if (typeof lim === 'string') {
          try { lim = JSON.parse(lim); } catch { lim = it.item_limit; }
        }
        // 단일 숫자이거나 1개만 존재하는 경우 탐지
        if (typeof lim === 'number' || (Array.isArray(lim) && lim.length === 1)) {
          isAnomalous = true;
        }
      });
    } else {
      isAnomalous = true;
    }

    if (isAnomalous) {
      targetCards.push({
        idx: card.idx,
        card_name: card.card_name,
        company: card.company,
        detected_perfs: Array.from(uniquePerfs)
      });
    }
  }
});

console.log(`[탐지 결과] 복수 실적 구간 존재 하나 item_limit 유실 의심 카드 총 ${targetCards.length}개 발견`);
console.log(JSON.stringify(targetCards.slice(0, 10), null, 2));

// 타겟 카드 저장
fs.writeFileSync('src/picking/target_cards.json', JSON.stringify(targetCards, null, 2), 'utf8');
