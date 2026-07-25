import fs from 'fs';
import path from 'path';

const cardsListPath = path.resolve('cards_list.json');
const cardsList = JSON.parse(fs.readFileSync(cardsListPath, 'utf8'));

const dbDataPath = path.resolve('src/picking/calculator_data.json');
const dbData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));

cardsList.forEach(card => {
  const matched = dbData.cards.find(c => c.card_id === card.idx);
  if (matched) {
    const bItems = dbData.benefit_items.filter(b => b.card_id === card.idx);
    const tiers = dbData.performance_tiers.filter(t => t.card_id === card.idx);
    card.is_calc_supported = "TRUE";
    card.structured_benefits = bItems;
    card.total_limit_tiers = tiers.length ? tiers.map(t => ({ perf: t.perf, limit: t.total_limit })) : [];
  }
});

fs.writeFileSync(cardsListPath, JSON.stringify(cardsList, null, 2), 'utf8');

// card_detail/ 마이그레이션
dbData.cards.forEach(card => {
  const idx = card.card_id;
  const detailPath = path.resolve(`card_detail/${idx}.json`);
  if (fs.existsSync(detailPath)) {
    const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
    const bItems = dbData.benefit_items.filter(b => b.card_id === idx);
    const tiers = dbData.performance_tiers.filter(t => t.card_id === idx);
    detail.is_calc_supported = "TRUE";
    detail.structured_benefits = bItems;
    detail.total_limit_tiers = tiers.length ? tiers.map(t => ({ perf: t.perf, limit: t.total_limit })) : [];
    fs.writeFileSync(detailPath, JSON.stringify(detail, null, 2), 'utf8');
  }
});

console.log("[SUCCESS] Updated cards_list.json and card_detail/ files with full production SQLite Data Mart.");
