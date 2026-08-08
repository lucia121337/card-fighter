// data/card_fighter_filtered.csv(EDA 대시보드에서 내려받은 전체 카드 데이터) 기반으로
// 카드별 TF-IDF 유사도 TOP10을 계산해 검색 페이지의 "이 상품은 어때요?" 추천에 쓸
// 정적 JSON(card_similar.json)을 생성한다. 빌드 타임 1회 실행, 런타임 재계산 없음.
const fs = require('fs');

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
const catCol = header.indexOf('benefit_categories');

// benefits_detail의 detail 텍스트가 비어있는 카드가 많아(예: "스타벅스 현대카드"),
// 그런 카드는 카테고리 라벨만으로 유사도를 판단해야 한다. benefit_categories를
// 몇 차례 더 반복해 넣어 카테고리 신호에 가중치를 준다.
const CATEGORY_BOOST = 4;
const cards = rows.slice(1).map(r => {
  const cats = (r[catCol] || '').trim();
  return {
    idx: parseInt(r[idxCol], 10),
    card_name: r[nameCol],
    company: r[companyCol],
    card_img: r[imgCol],
    text: `${(r[textCol] || '')} ${Array(CATEGORY_BOOST).fill(cats).join(' ')}`,
  };
}).filter(c => Number.isFinite(c.idx));

console.log(`카드 ${cards.length}건 로드`);

const TOKEN_RE = /[가-힣]{2,}|[A-Za-z]{2,}/g;
const STOP = new Set(['이용', '결제', '조건', '경우', '이상', '이하', '혜택', '제공', '적용',
  '포함', '제외', '실적', '기준', '가능', '불가', '해당', '전월', '카드', '가맹점']);

function tokenize(text) {
  const toks = (text.toLowerCase().match(TOKEN_RE) || []).filter(t => !STOP.has(t));
  return toks;
}

const docsTokens = cards.map(c => tokenize(c.text));
const df = new Map();
docsTokens.forEach(toks => {
  new Set(toks).forEach(t => df.set(t, (df.get(t) || 0) + 1));
});
const N = cards.length;
const idf = new Map();
df.forEach((count, term) => idf.set(term, Math.log((N + 1) / (count + 1)) + 1));

const vectors = docsTokens.map(toks => {
  const tf = new Map();
  toks.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
  const vec = new Map();
  let norm = 0;
  tf.forEach((count, term) => {
    const w = (count / toks.length) * (idf.get(term) || 0);
    if (w > 0) { vec.set(term, w); norm += w * w; }
  });
  norm = Math.sqrt(norm) || 1;
  vec.forEach((w, term) => vec.set(term, w / norm));
  return vec;
});

function cosine(a, b) {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let sum = 0;
  small.forEach((w, term) => { if (big.has(term)) sum += w * big.get(term); });
  return sum;
}

const TOP_K = 10;
const result = {};
for (let i = 0; i < N; i++) {
  const sims = [];
  for (let j = 0; j < N; j++) {
    if (i === j) continue;
    const s = cosine(vectors[i], vectors[j]);
    if (s > 0) sims.push([j, s]);
  }
  sims.sort((a, b) => b[1] - a[1]);
  result[cards[i].idx] = sims.slice(0, TOP_K).map(([j, s]) => ({
    idx: cards[j].idx,
    card_name: cards[j].card_name,
    company: cards[j].company,
    card_img: cards[j].card_img,
    score: Math.round(s * 1000) / 1000,
  }));
  if (i % 200 === 0) console.log(`${i}/${N}`);
}

fs.writeFileSync('data/card_similar.json', JSON.stringify(result), 'utf8');
console.log('저장 완료: data/card_similar.json');
