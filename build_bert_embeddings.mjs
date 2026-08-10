// data/card_fighter_filtered.csv 기반으로 카드별 문장임베딩(다국어 BERT, 384dim)을 계산해
// 검색 페이지의 쿼리 기반 추천(BERT 버전)에 쓸 정적 JSON(card_bert_embeddings.json)을 생성한다.
// klue/bert-base는 ONNX 변환판이 없어 Node에서 바로 못 돌리므로, 같은 BERT 계열의
// 다국어 문장임베딩 모델(Xenova/paraphrase-multilingual-MiniLM-L12-v2, 한국어 지원)을 사용한다.
// 빌드 타임 1회 실행, 런타임 재계산 없음.
import fs from 'fs';
import { pipeline } from '@xenova/transformers';

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = fs.readFileSync('data/card_fighter_filtered.csv', 'utf8').replace(/^﻿/, '');
const rows = parseCSV(raw).filter(r => r.length > 1);
const header = rows[0];
const idxCol = header.indexOf('idx');
const nameCol = header.indexOf('card_name');
const companyCol = header.indexOf('company');
const imgCol = header.indexOf('card_img');
const textCol = header.indexOf('text');

const cards = rows.slice(1).map(r => ({
  idx: parseInt(r[idxCol], 10),
  card_name: r[nameCol],
  company: r[companyCol],
  card_img: r[imgCol],
  // 카드명 + 상세 혜택 텍스트를 함께 임베딩 대상으로 삼는다(카드명만으로는 의미 구분이 약함).
  text: `${r[nameCol]}. ${(r[textCol] || '').slice(0, 500)}`,
})).filter(c => Number.isFinite(c.idx));

console.log(`카드 ${cards.length}건 로드`);

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
console.log(`모델 로드 중: ${MODEL}`);
const extractor = await pipeline('feature-extraction', MODEL, { quantized: true });

const round = arr => Array.from(arr).map(v => Math.round(v * 1e4) / 1e4);

const result = [];
for (let i = 0; i < cards.length; i++) {
  const c = cards[i];
  const output = await extractor(c.text, { pooling: 'mean', normalize: true });
  result.push({
    idx: c.idx,
    card_name: c.card_name,
    company: c.company,
    card_img: c.card_img,
    embedding: round(output.data),
  });
  if (i % 100 === 0) console.log(`${i}/${cards.length}`);
}

fs.writeFileSync('data/card_bert_embeddings.json', JSON.stringify({ model: MODEL, dim: result[0]?.embedding.length || 0, cards: result }), 'utf8');
console.log('저장 완료: data/card_bert_embeddings.json');
