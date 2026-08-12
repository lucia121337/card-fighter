# -*- coding: utf-8 -*-
"""
cards_updated.csv 기반 카드 혜택 유사도 산출 및 recommendations.json 생성 스크립트
"""

import pandas as pd
import json
import io
import sys
import os
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Windows 터미널 한글 출력 인코딩 맞춤
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 1. 데이터 로드 (cards_updated.csv 사용)
df = pd.read_csv('cards_updated.csv', encoding='utf-8-sig')

# annual_fee_detail 정보가 cards_list.json에 있을 경우 병합하여 단종 여부 확인
if 'annual_fee_detail' not in df.columns and os.path.exists('cards_list.json'):
    list_df = pd.read_json('cards_list.json')
    if 'annual_fee_detail' in list_df.columns:
        df = df.merge(list_df[['idx', 'annual_fee_detail']], on='idx', how='left')

# 2. 단종 카드 제외 및 결측치 처리
if 'annual_fee_detail' in df.columns:
    df['annual_fee_detail'] = df['annual_fee_detail'].fillna('')
    df = df[~df['annual_fee_detail'].astype(str).str.contains('발급 중단|발급중단')].reset_index(drop=True)

df['benefit_categories'] = df['benefit_categories'].fillna('')

# 3. TF-IDF 벡터화 & 유사도 계산
vectorizer = TfidfVectorizer()
tfidf_matrix = vectorizer.fit_transform(df['benefit_categories'])
cosine_sim = cosine_similarity(tfidf_matrix, tfidf_matrix)

# 4. 추천 및 공통 키워드 추출
recommendations = {}
for idx, row in df.iterrows():
    target_idx = int(row['idx'])
    target_keywords = set([k.strip() for k in str(row['benefit_categories']).split(',') if k.strip()])
    
    sim_scores = sorted(list(enumerate(cosine_sim[idx])), key=lambda x: x[1], reverse=True)[1:5]
    
    rec_list = []
    for i, score in sim_scores:
        rec_row = df.iloc[i]
        rec_idx = int(rec_row['idx'])
        rec_keywords = set([k.strip() for k in str(rec_row['benefit_categories']).split(',') if k.strip()])
        
        # 교집합 키워드 최대 3개 추출
        common_keywords = list(target_keywords.intersection(rec_keywords))[:3]
        
        rec_list.append({
            "recommended_idx": rec_idx,
            "common_keywords": common_keywords
        })
    recommendations[str(target_idx)] = rec_list

# 결과물 recommendations.json 저장
with open('recommendations.json', 'w', encoding='utf-8') as f:
    json.dump(recommendations, f, ensure_ascii=False, indent=2)

print(f"추천 DB 생성 완료! 총 {len(df)}개 카드에 대한 recommendations.json이 생성되었습니다.")
