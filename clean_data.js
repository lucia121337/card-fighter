const fs = require('fs');
const path = require('path');

function cleanSummaryText(text) {
  if (!text) return "";
  return text.split("|").map(part => {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) return part.trim();
    const title = part.substring(0, colonIdx).trim();
    const summary = part.substring(colonIdx + 1).trim();

    // 1. % 파싱 (최대 % 값 찾기)
    const pctMatches = [...summary.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
    if (pctMatches.length > 0) {
      const maxPct = Math.max(...pctMatches.map(m => parseFloat(m[1])));
      return `${title}: ${maxPct}%`;
    }

    // 2. 금액 파싱 (만, 천, 원, 마일, 포인트 등)
    let amount = 0;
    // 2-1) "만" 단위 파싱
    const manMatch = summary.match(/(\d+(?:\.\d+)?)\s*만/);
    if (manMatch) {
      amount = parseFloat(manMatch[1]) * 10000;
    } else {
      // 2-2) "천" 단위 파싱
      const chunMatch = summary.match(/(\d+(?:\.\d+)?)\s*천/);
      if (chunMatch) {
        amount = parseFloat(chunMatch[1]) * 1000;
      } else {
        // 2-3) "원/L" 등 특수 정액 혜택 (예: 60원/L -> 60원)
        const fuelMatch = summary.match(/(\d+)\s*원\s*\/\s*L/i) || summary.match(/(\d+)\s*원\s*당/i);
        if (fuelMatch) {
          amount = parseInt(fuelMatch[1], 10);
        } else {
          // 2-4) 일반 숫자 금액 파싱
          const numMatches = [...summary.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+)/g)];
          // "연 1회"나 "연 2가지" 등의 횟수나 연도를 나타내는 숫자는 제외하기 위해 100 초과의 숫자만 금액으로 고려
          const validNums = numMatches
            .map(m => parseInt(m[0].replace(/,/g, ''), 10))
            .filter(n => n >= 100);
          if (validNums.length > 0) {
            amount = Math.max(...validNums);
          }
        }
      }
    }

    if (amount > 0) {
      return `${title}: ${amount}원`;
    }

    // 3. 숫자가 없거나 '무제한', '한도 없음', '무료' 등일 경우 -> 무제한
    return `${title}: 무제한`;
  }).join(" | ");
}

function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

function stringifyCSV(rows) {
  return rows.map(row => {
    return row.map(val => {
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');
}

// 1. cards_updated.csv 클리닝 및 detailed_benefits 맵 생성
const csvPath = path.join(__dirname, 'cards_updated.csv');
const detailedBenefitsMap = {};
const topBenefitSummaryMap = {}; // 정제된 top_benefit_summary 전파용

if (fs.existsSync(csvPath)) {
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  if (rows.length > 0) {
    const header = rows[0];
    const idxIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'idx');
    const summaryIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'top_benefit_summary');
    let detailedIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'detailed_benefits');
    
    // detailed_benefits 컬럼이 없는 경우 새로 추가
    if (detailedIdx === -1) {
      header.push('detailed_benefits');
      detailedIdx = header.length - 1;
      for (let i = 1; i < rows.length; i++) {
        rows[i].push('');
      }
      console.log('detailed_benefits 컬럼이 없어서 새로 추가했습니다.');
    }

    // top_benefit_summary 클리닝 진행
    if (summaryIdx !== -1) {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][summaryIdx] !== undefined) {
          rows[i][summaryIdx] = cleanSummaryText(rows[i][summaryIdx]);
        }
      }
    }
    
    // CSV 저장
    fs.writeFileSync(csvPath, '\ufeff' + stringifyCSV(rows), 'utf-8'); // Excel 호환용 BOM 추가
    console.log('cards_updated.csv 정제 및 저장 완료');

    // 맵 구성
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cardIdx = row[idxIdx];
      if (!cardIdx) continue;
      
      if (summaryIdx !== -1) {
        topBenefitSummaryMap[cardIdx] = row[summaryIdx];
      }
      if (detailedIdx !== -1) {
        detailedBenefitsMap[cardIdx] = row[detailedIdx];
      }
    }
  }
}

// JSON 카드 데이터를 주입/업데이트하는 헬퍼
function updateCardData(card) {
  const cardIdx = String(card.idx);
  if (topBenefitSummaryMap[cardIdx] !== undefined) {
    card.top_benefit_summary = topBenefitSummaryMap[cardIdx];
  } else if (card.top_benefit_summary) {
    card.top_benefit_summary = cleanSummaryText(card.top_benefit_summary);
  }
  
  if (detailedBenefitsMap[cardIdx] !== undefined) {
    card.detailed_benefits = detailedBenefitsMap[cardIdx];
  }
}

// 2. cards_full.json 클리닝 및 업데이트
const fullJsonPath = path.join(__dirname, 'cards_full.json');
if (fs.existsSync(fullJsonPath)) {
  const cards = JSON.parse(fs.readFileSync(fullJsonPath, 'utf-8'));
  cards.forEach(updateCardData);
  fs.writeFileSync(fullJsonPath, JSON.stringify(cards, null, 2), 'utf-8');
  console.log('cards_full.json 업데이트 및 정제 완료');
}

// 3. cards_list.json 클리닝 및 업데이트
const listJsonPath = path.join(__dirname, 'cards_list.json');
if (fs.existsSync(listJsonPath)) {
  const cards = JSON.parse(fs.readFileSync(listJsonPath, 'utf-8'));
  cards.forEach(updateCardData);
  fs.writeFileSync(listJsonPath, JSON.stringify(cards), 'utf-8');
  console.log('cards_list.json 업데이트 및 정제 완료');
}

// 4. card_detail/*.json 개별 분리 파일 클리닝 및 업데이트
const detailDir = path.join(__dirname, 'card_detail');
if (fs.existsSync(detailDir)) {
  const files = fs.readdirSync(detailDir);
  let count = 0;
  files.forEach(file => {
    if (file.endsWith('.json')) {
      const filePath = path.join(detailDir, file);
      const card = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      updateCardData(card);
      fs.writeFileSync(filePath, JSON.stringify(card), 'utf-8');
      count++;
    }
  });
  console.log(`card_detail/ 내의 ${count}개 파일 업데이트 및 정제 완료`);
}
