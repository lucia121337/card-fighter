const fs = require('fs');
const path = require('path');

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

// HTML 태그 제거 및 텍스트 추출 헬퍼 (특히 <strong> 내부 매칭)
function extractBenefitDetail(html) {
  if (!html) return '';
  
  // 1) <strong> 태그 내용 매칭 시도
  const strongMatch = html.match(/<strong>([^<]+)<\/strong>/i);
  if (strongMatch && strongMatch[1].trim()) {
    return strongMatch[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  // 2) <strong>이 없으면 모든 태그를 날리고 첫 번째 유의미한 라인 추출
  const cleanText = html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
    
  return cleanText.length > 0 ? cleanText[0] : '';
}

function migrate() {
  const csvPath = path.join(__dirname, 'cards_updated.csv');
  const fullJsonPath = path.join(__dirname, 'cards_full.json');
  
  if (!fs.existsSync(csvPath) || !fs.existsSync(fullJsonPath)) {
    console.error('필수 파일(cards_updated.csv 또는 cards_full.json)이 누락되었습니다.');
    return;
  }
  
  const cards = JSON.parse(fs.readFileSync(fullJsonPath, 'utf-8'));
  const detailedBenefitsMap = {};
  
  console.log(`로드된 JSON 카드 개수: ${cards.length}`);
  
  cards.forEach(card => {
    const keyBenefits = card.key_benefit || [];
    const formattedList = [];
    
    keyBenefits.forEach(kb => {
      const title = (kb.title || '').trim();
      if (!title || title === '유의사항') return; // 유의사항 등은 매핑에서 제외
      
      const detail = extractBenefitDetail(kb.info);
      if (detail) {
        formattedList.push(`${title}: ${detail}`);
      } else {
        formattedList.push(title);
      }
    });
    
    if (formattedList.length > 0) {
      detailedBenefitsMap[String(card.idx)] = formattedList.join(' | ');
    } else {
      detailedBenefitsMap[String(card.idx)] = '';
    }
  });
  
  console.log(`detailedBenefitsMap 키 개수: ${Object.keys(detailedBenefitsMap).length}`);
  // 몇 개 샘플 출력
  console.log('샘플 키:', Object.keys(detailedBenefitsMap).slice(0, 5));

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  if (rows.length > 0) {
    const header = rows[0];
    const idxIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'idx');
    let detailedIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'detailed_benefits');
    
    console.log('CSV 헤더:', header);
    console.log(`idx 컬럼 인덱스: ${idxIdx}, detailed_benefits 컬럼 인덱스: ${detailedIdx}`);

    // 컬럼이 없는 경우 추가
    if (detailedIdx === -1) {
      header.push('detailed_benefits');
      detailedIdx = header.length - 1;
      for (let i = 1; i < rows.length; i++) {
        rows[i].push('');
      }
    }
    
    let updatedCount = 0;
    let matchCount = 0;
    for (let i = 1; i < rows.length; i++) {
      const rawIdx = rows[i][idxIdx];
      if (rawIdx === undefined) continue;
      const cardIdx = String(rawIdx).trim();
      
      if (detailedBenefitsMap[cardIdx] !== undefined) {
        matchCount++;
        rows[i][detailedIdx] = detailedBenefitsMap[cardIdx];
        updatedCount++;
      }
    }
    
    console.log(`매칭된 카드 개수: ${matchCount}`);
    
    // CSV 쓰기 (Excel 호환을 위해 BOM 유지)
    fs.writeFileSync(csvPath, '\ufeff' + stringifyCSV(rows), 'utf-8');
    console.log(`마이그레이션 성공: 총 ${updatedCount}개 카드의 detailed_benefits가 업데이트되었습니다.`);
  }
}

migrate();
