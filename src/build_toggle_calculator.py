import pandas as pd
import json
import re

# 1. CSV 데이터 파일 불러오기
file_path = r'c:\Users\user1\Desktop\icb10proj2\card-fighter\data\cards_test.csv'
try:
    df = pd.read_csv(file_path)
except UnicodeDecodeError:
    df = pd.read_csv(file_path, encoding='cp949')

# 2. 데이터 파싱 함수 정의
def parse_annual_fee(fee_str):
    if pd.isna(fee_str):
        return 0
    nums = re.findall(r'\[([\d,]+)\]', str(fee_str))
    if nums:
        return max([int(n.replace(',', '')) for n in nums])
    
    nums2 = re.findall(r'([\d,]+)\s*원', str(fee_str))
    if nums2:
        return max([int(n.replace(',', '')) for n in nums2])
    return 0

def parse_benefits(summary):
    if pd.isna(summary):
        return []
    benefits = []
    items = str(summary).split('|')
    for item in items:
        item = item.strip()
        if not item:
            continue
        
        category = "혜택"
        desc = item
        if ':' in item:
            parts = item.split(':', 1)
            category = parts[0].strip()
            desc = parts[1].strip()
        
        rate = 0.05
        rate_match = re.search(r'([\d.]+)\s*%', desc)
        if rate_match:
            rate = float(rate_match.group(1)) / 100
        else:
            if "원" in desc and ("할인" in desc or "캐시백" in desc):
                rate = 1.0
        
        max_limit = 10000
        man_match = re.search(r'([\d.]+)\s*만', desc)
        chun_match = re.search(r'([\d.]+)\s*천', desc)
        limit_match = re.search(r'최대\s*([\d,]+)\s*(원|마일|점|포인트)', desc)
        
        if man_match:
            max_limit = int(float(man_match.group(1)) * 10000)
        elif chun_match:
            max_limit = int(float(chun_match.group(1)) * 1000)
        elif limit_match:
            try:
                max_limit = int(limit_match.group(1).replace(',', ''))
            except ValueError:
                pass
        
        if "공항라운지" in desc or "라운지" in desc:
            max_limit = 30000
            rate = 1.0
        elif "무료" in desc:
            max_limit = 20000
            rate = 1.0

        benefits.append({
            "category": category,
            "desc": desc,
            "rate": rate,
            "maxLimit": max_limit
        })
    return benefits

cards_list = []
for _, row in df.iterrows():
    fee = parse_annual_fee(row['annual_fee'])
    base_perf = int(row['pre_month_money']) if pd.notnull(row['pre_month_money']) else 0
    benefits = parse_benefits(row['top_benefit_summary'])
    
    if not benefits:
        benefits = [{"category": "기본", "desc": "국내외 모든 가맹점 0.7% 적립", "rate": 0.007, "maxLimit": 50000}]
        
    cards_list.append({
        "name": str(row['card_name']),
        "company": str(row['company']) if pd.notnull(row['company']) else "기타",
        "fee": fee,
        "basePerf": base_perf,
        "benefits": benefits,
        "img": str(row['card_img']) if pd.notnull(row['card_img']) else ""
    })

cards_json = json.dumps(cards_list, ensure_ascii=False)

# 3. HTML 템플릿에 데이터 삽입
html_content = f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>카드 파이터 - 피킹률 토글 계산기</title>
    <style>
        body {{
            font-family: "Malgun Gothic", sans-serif;
            background-color: #f0f4f9;
            padding: 30px;
            color: #1f2937;
        }}

        .container {{
            max-width: 650px;
            margin: 0 auto;
        }}

        .header {{
            text-align: center;
            margin-bottom: 25px;
        }}

        .header h1 {{
            color: #1d4ed8;
            margin: 0;
            font-size: 28px;
            font-weight: 800;
        }}

        .header p {{
            color: #6b7280;
            margin-top: 5px;
            font-size: 14px;
        }}

        .card-box {{
            background: white;
            border-radius: 16px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }}

        .select-wrapper {{
            margin-bottom: 20px;
        }}

        select {{
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            font-size: 16px;
            color: #1f2937;
            font-weight: bold;
            background-color: #fff;
            cursor: pointer;
            outline: none;
            transition: border-color 0.3s;
        }}

        select:focus {{
            border-color: #1d4ed8;
        }}

        .card-detail-header {{
            display: flex;
            align-items: center;
            gap: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #f3f4f6;
            margin-bottom: 20px;
        }}

        .card-img {{
            width: 80px;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }}

        .card-title-area h2 {{
            margin: 0;
            font-size: 20px;
            color: #111827;
        }}

        .card-title-area p {{
            margin: 3px 0 0 0;
            color: #1d4ed8;
            font-weight: bold;
            font-size: 14px;
        }}

        .info-grid {{
            display: flex;
            gap: 15px;
            margin-bottom: 25px;
        }}

        .info-card {{
            flex: 1;
            background: #f9fafb;
            border: 1px solid #f3f4f6;
            border-radius: 12px;
            padding: 15px;
        }}

        .info-card-title {{
            color: #6b7280;
            font-size: 13px;
            margin-bottom: 5px;
        }}

        .info-card-val {{
            font-weight: bold;
            font-size: 16px;
            color: #111827;
        }}

        h3 {{
            color: #1f2937;
            margin-top: 0;
            font-size: 18px;
            margin-bottom: 15px;
        }}

        .toggle-row {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 0;
            border-bottom: 1px solid #f3f4f6;
        }}

        .toggle-row:last-child {{
            border-bottom: none;
        }}

        .toggle-left {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}

        .switch {{
            position: relative;
            display: inline-block;
            width: 46px;
            height: 24px;
        }}

        .switch input {{
            opacity: 0;
            width: 0;
            height: 0;
        }}

        .slider {{
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #e5e7eb;
            transition: .3s;
            border-radius: 34px;
        }}

        .slider:before {{
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .3s;
            border-radius: 50%;
        }}

        input:checked + .slider {{
            background-color: #1d4ed8;
        }}

        input:checked + .slider:before {{
            transform: translateX(22px);
        }}

        .benefit-badge {{
            padding: 3px 8px;
            background-color: #eff6ff;
            color: #1d4ed8;
            font-size: 12px;
            font-weight: bold;
            border-radius: 6px;
        }}

        .benefit-desc {{
            font-size: 14px;
            font-weight: 500;
            color: #374151;
        }}

        .benefit-max {{
            color: #4b5563;
            font-size: 14px;
            font-weight: bold;
        }}

        .option-row {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 15px;
            padding: 10px 0;
        }}
        
        .option-label {{
            font-size: 14px;
            font-weight: bold;
            color: #374151;
        }}

        .option-select {{
            width: 180px;
            padding: 8px;
            font-size: 13px;
        }}

        .result-box {{
            background-color: #eff6ff;
            padding: 22px;
            border-radius: 16px;
            margin-top: 25px;
        }}

        .result-row {{
            display: flex;
            justify-content: space-between;
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 12px;
        }}

        .result-row:last-child {{
            margin-bottom: 0;
        }}

        .real-rate {{
            color: #dc2626;
            font-size: 24px;
            font-weight: 900;
        }}

        .gauge-container {{
            width: 100%;
            background-color: #e5e7eb;
            height: 8px;
            border-radius: 4px;
            margin-top: 15px;
            overflow: hidden;
        }}

        .gauge-bar {{
            height: 100%;
            width: 0%;
            background-color: #3b82f6;
            transition: width 0.5s ease-in-out, background-color 0.5s;
        }}

        .gauge-text {{
            font-size: 12px;
            font-weight: bold;
            text-align: right;
            margin-top: 6px;
            color: #6b7280;
        }}
    </style>
</head>
<body>

    <div class="container">
        <div class="header">
            <h1>💳 카드 파이터 - 찐 피킹률 계산기</h1>
            <p>실제 카드 혜택 조건과 실적 함정을 반영한 진짜 혜택률 분석기</p>
        </div>

        <div class="card-box">
            <div class="select-wrapper">
                <label style="font-weight: bold; font-size: 14px; color: #4b5563; display:block; margin-bottom: 6px;">📂 1. 내 카드 선택하기</label>
                <select id="cardSelect" onchange="loadCardData()">
                    <option value="">카드를 선택해 주세요</option>
                </select>
            </div>

            <div id="cardDetailView" style="display: none;">
                <div class="card-detail-header">
                    <img id="cardImage" class="card-img" src="" alt="카드 이미지" onerror="this.src='https://via.placeholder.com/80x120?text=Card'">
                    <div class="card-title-area">
                        <h2 id="cardName">카드명</h2>
                        <p id="cardCompany">카드사</p>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-card">
                        <div class="info-card-title">연회비</div>
                        <div id="cardFee" class="info-card-val">0원</div>
                    </div>
                    <div class="info-card">
                        <div class="info-card-title">전월실적 기준액</div>
                        <div id="cardBasePerf" class="info-card-val">0원</div>
                    </div>
                </div>

                <h3>💡 2. 이용할 혜택 선택하기 (토글 활성화)</h3>
                <div id="benefitsList">
                </div>

                <div class="option-row" style="border-top: 1px solid #f3f4f6; margin-top: 20px; padding-top: 15px;">
                    <span class="option-label">⚠️ 혜택 금액이 실적 산정에서 제외되나요?</span>
                    <select id="isExcluded" class="option-select" onchange="calculate()">
                        <option value="true">네 (실적 제외 함정 발동!)</option>
                        <option value="false" selected>아니오 (실적 포함)</option>
                    </select>
                </div>

                <div class="result-box">
                    <div class="result-row">
                        <span>선택한 예상 월 혜택액</span>
                        <span id="totalBenefit" style="color: #1d4ed8; font-size: 18px;">0원</span>
                    </div>
                    <div class="result-row" style="border-top: 1px dashed #bed3f3; padding-top: 15px; margin-top: 10px;">
                        <span>🔥 실질 체감 피킹률 (진짜 혜택률)</span>
                        <span id="pickingRate" class="real-rate">0.00%</span>
                    </div>

                    <div class="gauge-container">
                        <div id="gaugeBar" class="gauge-bar"></div>
                    </div>
                    <div id="gaugeLabel" class="gauge-text">카드를 선택하고 혜택을 켜보세요.</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const cardsData = {cards_json};

        const select = document.getElementById('cardSelect');
        cardsData.forEach((card, index) => {{
            let opt = document.createElement('option');
            opt.value = index;
            opt.innerHTML = `[${{card.company}}] ${{card.name}}`;
            select.appendChild(opt);
        }});

        let currentCard = null;

        function loadCardData() {{
            let idx = select.value;
            if (idx === "") {{
                document.getElementById('cardDetailView').style.display = 'none';
                currentCard = null;
                return;
            }}

            currentCard = cardsData[idx];
            document.getElementById('cardDetailView').style.display = 'block';

            document.getElementById('cardName').innerText = currentCard.name;
            document.getElementById('cardCompany').innerText = currentCard.company;
            document.getElementById('cardFee').innerText = currentCard.fee.toLocaleString() + "원";
            document.getElementById('cardBasePerf').innerText = currentCard.basePerf.toLocaleString() + "원";
            
            if (currentCard.img) {{
                document.getElementById('cardImage').src = currentCard.img;
            }} else {{
                document.getElementById('cardImage').src = 'https://via.placeholder.com/80x120?text=' + encodeURIComponent(currentCard.name);
            }}

            const listContainer = document.getElementById('benefitsList');
            listContainer.innerHTML = '';

            currentCard.benefits.forEach((benefit, index) => {{
                let row = document.createElement('div');
                row.className = 'toggle-row';
                
                let rateText = (benefit.rate * 100).toFixed(1) + "%";
                if (benefit.rate === 1.0) rateText = "100%";

                let limitText = benefit.maxLimit >= 10000 ? (benefit.maxLimit / 10000) + "만원" : benefit.maxLimit.toLocaleString() + "원";

                row.innerHTML = `
                    <div class="toggle-left">
                        <label class="switch">
                            <input type="checkbox" class="benefit-toggle" value="${{index}}" onchange="calculate()">
                            <span class="slider"></span>
                        </label>
                        <span class="benefit-badge">${{benefit.category}} (${{rateText}})</span>
                        <span class="benefit-desc">${{benefit.desc}}</span>
                    </div>
                    <div class="benefit-max">최대 ${{limitText}}</div>
                `;
                listContainer.appendChild(row);
            }});

            calculate();
        }}

        function calculate() {{
            if (!currentCard) return;

            const toggles = document.querySelectorAll('.benefit-toggle');
            let totalMaxBenefit = 0;
            let totalSpendNeeded = 0;

            toggles.forEach(toggle => {{
                if (toggle.checked) {{
                    let data = currentCard.benefits[toggle.value];
                    totalMaxBenefit += data.maxLimit;
                    
                    if (data.rate > 0) {{
                        totalSpendNeeded += (data.maxLimit / data.rate);
                    }}
                }}
            }});

            const isExcluded = document.getElementById('isExcluded').value === "true";
            const basePerf = currentCard.basePerf;
            
            let realTotalSpend = isExcluded ? (basePerf + totalSpendNeeded) : Math.max(basePerf, totalSpendNeeded);

            let pickingRate = 0;
            if (realTotalSpend > 0) {{
                let monthlyFee = currentCard.fee / 12;
                pickingRate = ((totalMaxBenefit - monthlyFee) / realTotalSpend) * 100;
            }}

            if (pickingRate < 0) pickingRate = 0;

            document.getElementById('totalBenefit').innerText = totalMaxBenefit.toLocaleString() + "원";
            document.getElementById('pickingRate').innerText = pickingRate.toFixed(2) + "%";

            let gaugeBar = document.getElementById('gaugeBar');
            let gaugeLabel = document.getElementById('gaugeLabel');
            
            let widthPercent = Math.min((pickingRate / 8) * 100, 100);
            gaugeBar.style.width = widthPercent + "%";

            if (pickingRate === 0) {{
                gaugeBar.style.backgroundColor = '#e5e7eb';
                gaugeLabel.innerText = "사용할 혜택 토글을 켜보세요!";
                gaugeLabel.style.color = '#6b7280';
            }} else if (pickingRate < 1.0) {{
                gaugeBar.style.backgroundColor = '#9ca3af';
                gaugeLabel.innerText = "혜택률 낮음 (피킹률 1% 미만: 혜택이 매우 아쉬워요 😢)";
                gaugeLabel.style.color = '#4b5563';
            }} else if (pickingRate < 3.0) {{
                gaugeBar.style.backgroundColor = '#f59e0b';
                gaugeLabel.innerText = "혜택률 보통 (피킹률 1%~3%: 그냥 평범한 카드예요 😐)";
                gaugeLabel.style.color = '#b45309';
            }} else if (pickingRate < 5.0) {{
                gaugeBar.style.backgroundColor = '#10b981';
                gaugeLabel.innerText = "혜택률 좋음! (피킹률 3%~5%: 쏠쏠한 혜택을 주는 카드예요! 🙂)";
                gaugeLabel.style.color = '#047857';
            }} else {{
                gaugeBar.style.backgroundColor = '#8b5cf6';
                gaugeLabel.innerText = "혜택률 대박! (피킹률 5% 초과: 엄청난 혜택을 주는 꿀카드입니다! 🔥)";
                gaugeLabel.style.color = '#6d28d9';
            }}
        }}
    </script>
</body>
</html>"""

# 4. 완성된 HTML 코드를 저장하기
output_html_path = r'c:\Users\user1\Desktop\icb10proj2\card-fighter\src\test_toggle_real.html'
with open(output_html_path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print("성공! 'test_toggle_real.html' 파일이 새로 빌드되었습니다. 브라우저로 띄워보세요!")
