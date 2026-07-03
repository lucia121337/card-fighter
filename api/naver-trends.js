export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const NAVER_CLIENT_ID = (process.env.NAVER_CLIENT_ID || '').replace(/^﻿/, '').trim();
  const NAVER_CLIENT_SECRET = (process.env.NAVER_CLIENT_SECRET || '').replace(/^﻿/, '').trim();
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  }

  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const startDate = new Date(today.setMonth(today.getMonth() - 3)).toISOString().slice(0, 10);

  const body = {
    startDate,
    endDate,
    timeUnit: 'week',
    keywordGroups: [
      { groupName: '신용카드',  keywords: ['신용카드'] },
      { groupName: '체크카드',  keywords: ['체크카드'] },
      { groupName: '캐시백',   keywords: ['캐시백'] },
      { groupName: '카드혜택',  keywords: ['카드혜택', '카드 혜택'] },
      { groupName: '주유카드',  keywords: ['주유카드', '주유 카드'] },
      { groupName: '편의점카드', keywords: ['편의점 카드', '편의점카드'] },
      { groupName: '배달카드',  keywords: ['배달 카드', '배달앱 카드'] },
      { groupName: '해외카드',  keywords: ['해외 카드', '해외여행 카드', '해외결제'] },
    ],
  };

  try {
    const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
