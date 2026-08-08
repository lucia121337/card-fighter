// data/card_fighter_filtered.csv 기반으로 "검색어 -> 카드" TF-IDF 유사도 조회에 필요한
// idf 사전과 카드별 희소벡터를 계산해 정적 JSON(card_tfidf_index.json)을 생성한다.
// build_search_recommendations.js(카드-카드 유사도)와 달리, 런타임에 검색창에 입력한
// 임의의 텍스트를 같은 idf로 벡터화해 카드와 비교할 수 있도록 idf/벡터 자체를 내보낸다.
// 빌드 타임 1회 실행, 런타임 재계산 없음.
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

const CATEGORY_BOOST = 4;
const cards = rows.slice(1).map(r => {
  const cats = (r[catCol] || '').trim();
  return {
    idx: parseInt(r[idxCol], 10),
    card_name: r[nameCol],
    company: r[companyCol],
    card_img: r[imgCol],
    text: `${r[nameCol]} ${(r[textCol] || '')} ${Array(CATEGORY_BOOST).fill(cats).join(' ')}`,
  };
}).filter(c => Number.isFinite(c.idx));

console.log(`카드 ${cards.length}건 로드`);

// 검색창에서 입력한 쿼리도 런타임에 이 토크나이저/불용어로 그대로 처리해야
// 같은 텀 공간(term space)에서 비교할 수 있다 — search.html의 tokenize()와 동일하게 유지.
const TOKEN_RE = /[가-힣]{2,}|[A-Za-z]{2,}/g;
const STOP = new Set(['이용', '결제', '조건', '경우', '이상', '이하', '혜택', '제공', '적용',
  '포함', '제외', '실적', '기준', '가능', '불가', '해당', '전월', '카드', '가맹점']);

function tokenize(text) {
  return (text.toLowerCase().match(TOKEN_RE) || []).filter(t => !STOP.has(t));
}

const docsTokens = cards.map(c => tokenize(c.text));
const df = new Map();
docsTokens.forEach(toks => {
  new Set(toks).forEach(t => df.set(t, (df.get(t) || 0) + 1));
});
const N = cards.length;
const idf = new Map();
df.forEach((count, term) => idf.set(term, Math.log((N + 1) / (count + 1)) + 1));

const round = v => Math.round(v * 1e4) / 1e4;

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
  const out = {};
  vec.forEach((w, term) => { out[term] = round(w / norm); });
  return out;
});

const idfOut = {};
idf.forEach((v, term) => { idfOut[term] = round(v); });

const result = {
  idf: idfOut,
  cards: cards.map((c, i) => ({
    idx: c.idx,
    card_name: c.card_name,
    company: c.company,
    card_img: c.card_img,
    vec: vectors[i],
  })),
};

fs.writeFileSync('data/card_tfidf_index.json', JSON.stringify(result), 'utf8');
console.log('저장 완료: data/card_tfidf_index.json');
