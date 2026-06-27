/**
 * 카드고릴라 전체 수집기 (신용 + 체크 + 상세)
 * 실행: node scrape_full.js
 */
const https = require('https');
const fs = require('fs');

const LIST_API   = 'https://api.card-gorilla.com/v1/cards';
const DETAIL_API = 'https://api.card-gorilla.com:8080/v1/cards/';
const HEADERS = {
  'Accept': 'application/json',
  'Referer': 'https://www.card-gorilla.com/card',
  'Origin': 'https://www.card-gorilla.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

function fetchJSON(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : require('http');
    const req = lib.get(url, { headers: HEADERS }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        resolve(fetchJSON(next, redirects - 1));
        return;
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error(`JSON parse fail (${url}): ${raw.slice(0,120)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout: ' + url)); });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchAllCards(cate) {
  console.log(`\n▶ [${cate}] 목록 수집 중...`);
  const first = await fetchJSON(`${LIST_API}?cate=${cate}&p=1&perPage=100&sort=ranking`);
  const total = first.total;
  const pages = Math.ceil(total / 100);
  console.log(`  총 ${total}건 / ${pages}페이지`);

  let items = [...(first.data || [])];
  for (let p = 2; p <= pages; p++) {
    await sleep(500);
    const pg = await fetchJSON(`${LIST_API}?cate=${cate}&p=${p}&perPage=100&sort=ranking`);
    items.push(...(pg.data || []));
    process.stdout.write(`\r  page ${p}/${pages} — 누적 ${items.length}건   `);
  }
  console.log();
  return items;
}

async function fetchDetailBatch(cards, batchSize = 5) {
  const results = [];
  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(c => fetchJSON(DETAIL_API + c.idx))
    );
    for (let j = 0; j < batch.length; j++) {
      const base = batch[j];
      const r = settled[j];
      if (r.status === 'fulfilled') {
        results.push({ ...base, ...r.value });
      } else {
        console.log(`\n  ! ${base.name} (${base.idx}) 상세 실패 — 기본정보만 저장`);
        results.push(base);
      }
      const done = i + j + 1;
      process.stdout.write(`\r  상세 수집: ${done}/${cards.length} (${base.name.slice(0,18)})   `);
    }
    await sleep(300);
  }
  console.log();
  return results;
}

function cleanCard(d) {
  const topBenefit = (d.top_benefit || []).map(b => ({
    title: b.title || '',
    tags: b.tags || [],
    logo_url: (b.logo_img && b.logo_img.url) || '',
  }));

  const keyBenefit = (d.key_benefit || []).map(b => ({
    title: b.title || (b.cate && b.cate.name) || '',
    logo_url: (b.cate && b.cate.logo_img && b.cate.logo_img.url) || '',
    info: b.info || '',
  }));

  const benefitCats = [];
  for (const grp of (d.search_benefit || [])) {
    for (const opt of (grp.options || [])) {
      if (opt.label) benefitCats.push(opt.label);
    }
  }

  return {
    idx: d.idx,
    card_name: d.name,
    company: (d.corp && d.corp.name) || d.corp_txt || '',
    card_type: d.cate_txt || '',
    cate: d.cate || '',
    brands: d.brands_txt || '',
    annual_fee: (d.annual_fee_basic || '').replace(/\n/g, ' ').trim(),
    annual_fee_detail: d.annual_fee_detail || '',
    pre_month_money: d.pre_month_money || 0,
    pre_month_condition: d.pre_month_money ? `${Number(d.pre_month_money).toLocaleString()}원` : '없음',
    only_online: d.only_online || false,
    release_dt: d.release_dt || '',
    card_img: (d.card_img && d.card_img.url) || '',
    top_benefit: topBenefit,
    key_benefit: keyBenefit,
    benefit_categories: benefitCats.join(', '),
    detail_url: `https://www.card-gorilla.com/card/detail/${d.idx}`,
  };
}

async function main() {
  console.log('=== 카드파이터 전체 데이터 수집 시작 ===\n');

  // 1. 목록 수집 (신용 + 체크)
  const crd = await fetchAllCards('CRD');
  const chk = await fetchAllCards('CHK');
  const all = [...crd, ...chk];

  // 중복 제거
  const seen = new Set();
  const unique = all.filter(c => { if(seen.has(c.idx)) return false; seen.add(c.idx); return true; });
  console.log(`\n목록 합계: ${unique.length}건 (신용 ${crd.length} + 체크 ${chk.length})`);

  // 2. 상세 수집
  console.log('\n▶ 상세 데이터 수집 중 (5개씩 병렬)...');
  const detailed = await fetchDetailBatch(unique, 5);

  // 3. 정제 & 저장
  const cleaned = detailed.map(cleanCard);
  fs.writeFileSync('cards_full.json', JSON.stringify(cleaned, null, 2), 'utf-8');

  const withDetail = cleaned.filter(c => c.key_benefit && c.key_benefit.length > 0);
  console.log(`\n=== 완료 ===`);
  console.log(`  총 ${cleaned.length}건 저장 → cards_full.json`);
  console.log(`  상세혜택 있는 카드: ${withDetail.length}건`);
  console.log(`  신용카드: ${cleaned.filter(c=>c.cate==='CRD').length}건`);
  console.log(`  체크카드: ${cleaned.filter(c=>c.cate==='CHK').length}건`);
}

main().catch(e => { console.error('\n오류:', e.message); process.exit(1); });
