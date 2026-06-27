// cards_full.json → card_detail/{idx}.json 개별 분리
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('cards_full.json', 'utf-8'));
const dir = 'card_detail';
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

let count = 0;
data.forEach(c => {
  fs.writeFileSync(path.join(dir, `${c.idx}.json`), JSON.stringify(c), 'utf-8');
  count++;
  if (count % 100 === 0) process.stdout.write(`\r${count}/${data.length}건 저장...`);
});
console.log(`\n완료: card_detail/ 폴더에 ${count}개 파일 생성`);
