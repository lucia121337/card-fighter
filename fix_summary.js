// cards_full.json에 top_benefit_summary 필드 추가
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('cards_full.json', 'utf-8'));

let fixed = 0;
data.forEach(c => {
  if (!c.top_benefit_summary && Array.isArray(c.top_benefit)) {
    c.top_benefit_summary = c.top_benefit.map(b => {
      const tags = (b.tags || []).join(' ');
      return tags ? `${b.title || ''}: ${tags}` : (b.title || '');
    }).filter(Boolean).join(' | ');
    fixed++;
  }
});

fs.writeFileSync('cards_full.json', JSON.stringify(data, null, 2), 'utf-8');
console.log(`완료: ${data.length}건 중 ${fixed}건 top_benefit_summary 추가`);
