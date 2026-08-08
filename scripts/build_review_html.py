# -*- coding: utf-8 -*-
"""자체완결 검수 HTML 생성 — 서버/깃 없이 더블클릭으로 여는 공유용 파일.
샤드(data/review_shards/담당N.json) + 원문(card_detail)을 HTML에 임베드.
검수자: 파일 열기 → 수정 → [내보내기]로 담당N.json 다운로드 → 관리자 전달.
관리자: 3개 json을 data/review_shards/ 에 놓고 db_import_shards.py --apply → build_from_db.py

출력: data/review_shards/<담당>_검수.html
사용: python scripts/build_review_html.py
"""
import json, io, os, re, html as _html

ROOT = os.path.join(os.path.dirname(__file__), '..')
SHARDDIR = os.path.join(ROOT, 'data', 'review_shards')
DETAIL = os.path.join(ROOT, 'card_detail')


def strip(h):
    return re.sub(r'\s+', ' ', _html.unescape(re.sub(r'<[^>]+>', ' ', h or ''))).strip()


def src_for(idx):
    p = os.path.join(DETAIL, f'{idx}.json')
    if not os.path.isfile(p):
        return ''
    try:
        kb = json.load(io.open(p, encoding='utf-8')).get('key_benefit') or []
    except Exception:
        return ''
    parts = []
    for k in kb:
        t = strip(k.get('info'))
        if not t:
            continue
        parts.append(f"[{k.get('title') or ''}] {t[:400]}")
    return '\n'.join(parts)[:3000]


TEMPLATE = r"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>혜택 검수 — __OWNER__</title>
<style>
 :root{--bg:#0f172a;--panel:#1e293b;--panel2:#334155;--line:#334155;--txt:#e2e8f0;--muted:#94a3b8;--brand:#60a5fa;--good:#34d399;--warn:#fbbf24}
 *{box-sizing:border-box;margin:0;padding:0}
 body{font-family:'Pretendard','Malgun Gothic',sans-serif;background:var(--bg);color:var(--txt);font-size:13px}
 header{position:sticky;top:0;z-index:10;background:#0f172af5;backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
 h1{font-size:15px;font-weight:800}
 .txt,input{background:var(--panel);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:6px 10px;outline:none;font-family:inherit;font-size:13px}
 button{background:var(--brand);color:#0f172a;border:0;border-radius:8px;padding:7px 13px;font-weight:800;cursor:pointer;font-family:inherit}
 button.ghost{background:var(--panel2);color:var(--txt)}
 button.good{background:var(--good)}
 .chip{background:var(--panel);border:1px solid var(--line);color:var(--muted);border-radius:99px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer}
 .wrap{max-width:1400px;margin:0 auto;padding:16px 20px 100px}
 .bar{height:8px;background:var(--panel2);border-radius:99px;overflow:hidden;margin:10px 0}.bar>i{display:block;height:100%;background:var(--good);width:0}
 .stats{color:var(--muted);font-size:12px;margin-bottom:8px}.count{margin-left:auto;color:var(--muted);font-size:12px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;margin-bottom:10px;overflow:hidden}
 .card>.head{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer}
 .cid{color:var(--muted);font-size:11px;min-width:44px}.cname{font-weight:800}.ccorp{color:var(--muted);font-size:11px}
 .st{margin-left:auto;font-size:10px;font-weight:800;padding:3px 9px;border-radius:6px}
 .st.unreviewed{background:#78350f;color:var(--warn)}.st.reviewing{background:#1e3a8a;color:#93c5fd}.st.done{background:#064e3b;color:var(--good)}
 .body{border-top:1px solid var(--line);display:none;grid-template-columns:1.3fr 1fr}.body.open{display:grid}
 @media(max-width:900px){.body.open{grid-template-columns:1fr}}
 .col{padding:14px 16px}.col:first-child{border-right:1px solid var(--line)}
 .col h4{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
 table{width:100%;border-collapse:collapse;table-layout:fixed}
 th{text-align:left;font-size:10px;color:var(--muted);font-weight:700;padding:4px 6px;border-bottom:1px solid var(--line)}
 td{padding:5px 6px;border-bottom:1px solid #172033;vertical-align:top}
 .cat{font-weight:700;word-break:break-word}
 .txt.sm{padding:4px 7px;width:100%;font-size:12px}.txt.n{width:78px}
 .src{white-space:pre-wrap;font-size:12px;line-height:1.6;color:var(--txt)}
 .rowact{display:flex;gap:8px;margin-top:12px}.hint{color:var(--muted);font-size:11px}
 .save-fab{position:fixed;right:20px;bottom:20px;z-index:20;box-shadow:0 6px 24px #0008}
 .note{background:#0b1220;border:1px solid var(--line);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--muted);margin-bottom:12px}
</style></head><body>
<header><h1>🔎 혜택 검수 · __OWNER__</h1>
 <label class="chip"><input type="checkbox" id="f-un" style="vertical-align:-1px"> 미검수만</label>
 <input class="txt" id="q" placeholder="카드명·idx 검색" style="width:180px"><span class="count" id="count"></span></header>
<div class="wrap">
 <div class="note">원문과 대조해 요율·구간을 확인/수정하고 <b>[✓ 검수완료]</b>. 다 하면 우하단 <b>💾 내보내기</b>로 파일 저장해 관리자에게 전달하세요. (이 파일 하나로 끝 — 서버 불필요)</div>
 <div class="stats" id="statline"></div><div class="bar"><i id="progress"></i></div>
 <div id="list"></div></div>
<button class="save-fab good" id="save">💾 검수결과 내보내기</button>
<script>
const OWNER="__OWNER__"; const SHARD=__SHARD__; const SRC=__SRC__;
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const SRC_COLOR={'json-llm':'#065f46','json-catcap':'#065f46','llm-review':'#1e3a8a','llm-review-nocap':'#4b5563','llm-review-complex':'#7c2d12','db-est':'#78350f','human':'#166534','json-insert':'#334155'};
let flags={un:false};
function extrasHTML(ex){ if(!ex||!Object.keys(ex).length) return '';
 const chip=t=>`<span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:#1e293b;border:1px solid #334155;color:#cbd5e1">${t}</span>`;
 let c=''; if(ex.mile)c+=chip('✈️ '+esc(ex.mile)); if(ex.point)c+=chip('🅿️ '+esc(ex.point)); if(ex.voucher)c+=chip('🎁 '+esc(ex.voucher));
 (ex.services||[]).forEach(s=>c+=chip('🎫 '+esc(s))); if(ex.installment)c+=chip('💳 무이자할부');
 return `<div style="grid-column:1/-1;padding:11px 16px;border-bottom:1px solid var(--line);background:#0b1220"><div style="font-size:10px;color:var(--brand);font-weight:800;margin-bottom:7px;letter-spacing:.5px">🧩 계산불가 혜택 (마일·바우처·서비스 — 참고)</div><div style="display:flex;flex-wrap:wrap;gap:6px">${c}</div></div>`; }
function cardStatus(c){ const st=c.rows.map(r=>r.검수상태||'unreviewed'); if(st.every(s=>s==='done'))return 'done'; if(st.some(s=>s==='done'||s==='reviewing'))return 'reviewing'; return 'unreviewed'; }
function render(){ const q=document.getElementById('q').value.trim().toLowerCase(); let list=SHARD.cards;
 if(q)list=list.filter(c=>String(c.idx).includes(q)||(c.name||'').toLowerCase().includes(q));
 if(flags.un)list=list.filter(c=>cardStatus(c)!=='done');
 const done=SHARD.cards.filter(c=>cardStatus(c)==='done').length;
 document.getElementById('statline').textContent=`${OWNER} · 담당 ${SHARD.card_count}장 · 검수완료 ${done} · 남음 ${SHARD.card_count-done}`;
 document.getElementById('progress').style.width=(done/SHARD.card_count*100||0)+'%';
 document.getElementById('count').textContent=`${list.length}장`;
 document.getElementById('list').innerHTML=list.slice(0,400).map(c=>{const s=cardStatus(c);
  return `<div class="card"><div class="head" onclick="toggle(${c.idx})"><span class="cid">${c.idx}</span><span class="cname">${esc(c.name)}</span><span class="ccorp">${esc(c.company)}</span><span class="st ${s}">${s==='done'?'검수완료':s==='reviewing'?'검수중':'미검수'}</span></div><div class="body" id="body-${c.idx}"></div></div>`;
 }).join('')+(list.length>400?'<div style="color:var(--muted);padding:20px;text-align:center">상위 400장 — 검색으로 좁히세요</div>':''); }
function toggle(idx){ const body=document.getElementById('body-'+idx); if(body.classList.contains('open')){body.classList.remove('open');body.innerHTML='';return;}
 document.querySelectorAll('.body.open').forEach(b=>{b.classList.remove('open');b.innerHTML='';});
 const c=SHARD.cards.find(x=>x.idx===idx); body.classList.add('open');
 body.innerHTML=extrasHTML(c.extras)+`<div class="col"><h4>DB 값 (수정 가능)</h4>
  <table><thead><tr><th style="width:38%">카테고리</th><th style="width:12%">요율</th><th style="width:28%">구간(전월실적:한도,원)</th><th style="width:22%">메모</th></tr></thead>
  <tbody>${c.rows.map((r,i)=>rowHTML(idx,i,r)).join('')}</tbody></table>
  <div class="hint" style="margin-top:6px">요율 %는 숫자(10=10%)·정액/주유는 원. 구간은 <b>전월실적원:한도원</b>, 여러개는 <b>;</b>.</div>
  <div class="rowact"><button class="good" onclick="markDone(${idx})">✓ 검수완료</button><button class="ghost" onclick="markRev(${idx})">검수중</button></div></div>
  <div class="col"><h4>원문</h4><div class="src">${esc(SRC[idx]||'(원문 없음)')}</div></div>`; }
function rowHTML(idx,i,r){ const tier=(r.구간||[]).map(t=>`${t[0]}:${t[1]}`).join('; ');
 const rv=r.종류==='percent'?(r.요율!=null?+(r.요율*100).toFixed(2):''):r.종류==='fixed_won'?(r.정액원??''):r.종류==='won_per_liter'?(r.리터당원??''):(r.요율??'');
 const u=r.종류==='percent'?'%':r.종류==='won_per_liter'?'원/L':r.종류==='fixed_won'?'원':'';
 const src=r.출처?`<span style="font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;background:${SRC_COLOR[r.출처]||'#334155'};color:#e2e8f0;margin-left:5px">${esc(r.출처)}</span>`:'';
 const d=r.상세&&r.상세.length>90?r.상세.slice(0,90)+'…':(r.상세||'');
 const desc=d?`<div style="font-size:11px;color:var(--muted);margin-top:3px;white-space:normal;word-break:break-word;font-weight:400">${esc(d)}</div>`:'';
 return `<tr><td class="cat">${esc(r.cat)}${src}${desc}</td>
  <td><input class="txt sm n" value="${rv}" onchange="edRate(${idx},${i},this.value)"> <span class="hint">${u}</span></td>
  <td><input class="txt sm" value="${esc(tier)}" onchange="edTier(${idx},${i},this.value)"></td>
  <td><input class="txt sm" value="${esc(r.메모||'')}" onchange="edMemo(${idx},${i},this.value)"></td></tr>`; }
function row(idx,i){return SHARD.cards.find(x=>x.idx===idx).rows[i];}
function edRate(idx,i,v){const r=row(idx,i);v=parseFloat(v);if(isNaN(v))return;if(r.종류==='percent')r.요율=v/100;else if(r.종류==='fixed_won')r.정액원=Math.round(v);else if(r.종류==='won_per_liter')r.리터당원=Math.round(v);else r.요율=v;}
function edTier(idx,i,v){row(idx,i).구간=v.split(';').map(s=>s.trim()).filter(Boolean).map(s=>{const[a,b]=s.split(':');return[parseInt(a),parseInt(b)];}).filter(t=>!isNaN(t[0])&&!isNaN(t[1]));}
function edMemo(idx,i,v){row(idx,i).메모=v;}
function markDone(idx){SHARD.cards.find(x=>x.idx===idx).rows.forEach(r=>r.검수상태='done');render();}
function markRev(idx){SHARD.cards.find(x=>x.idx===idx).rows.forEach(r=>r.검수상태='reviewing');render();}
document.getElementById('f-un').onchange=e=>{flags.un=e.target.checked;render();};
document.getElementById('q').oninput=render;
document.getElementById('save').onclick=()=>{const blob=new Blob([JSON.stringify(SHARD,null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=OWNER+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);};
render();
</script></body></html>"""


def main():
    files = [f for f in os.listdir(SHARDDIR) if f.endswith('.json') and not f.startswith('_')]
    for f in files:
        owner = f[:-5]
        shard = json.load(io.open(os.path.join(SHARDDIR, f), encoding='utf-8'))
        src = {c['idx']: src_for(c['idx']) for c in shard['cards']}
        htmlout = (TEMPLATE
                   .replace('__OWNER__', owner)
                   .replace('__SHARD__', json.dumps(shard, ensure_ascii=False))
                   .replace('__SRC__', json.dumps(src, ensure_ascii=False)))
        out = os.path.join(SHARDDIR, f'{owner}_검수.html')
        io.open(out, 'w', encoding='utf-8').write(htmlout)
        size = os.path.getsize(out) // 1024
        print(f'{owner}: {shard["card_count"]}장 → {owner}_검수.html ({size}KB)')
    print(f'\n생성 위치: {SHARDDIR}')
    print('검수자: 파일 더블클릭 → 수정 → 💾 내보내기 → 관리자에게 json 전달')


if __name__ == '__main__':
    main()
