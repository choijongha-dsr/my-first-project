import pandas as pd
import json

# wire_design.json 의 모든 구조 키 로드
wd = json.load(open('c:/workspace/my-first-project/wire_design.json', encoding='utf-8'))
wd_norm = {k.replace(' ','').replace('×','x').lower(): k for k in wd.keys()}

# 설계시트(인덱스 1)에서 Q열(16)=설계명만 읽기
xl = pd.ExcelFile('c:/workspace/my-first-project/설계통합.xlsx')
sheet_idx1 = xl.sheet_names[1]
df = xl.parse(sheet_idx1, header=None)

q_col = 16
design_names = set()
for idx, row in df.iterrows():
    q = str(row[q_col]).strip() if q_col < len(row) else ''
    if q and q != 'nan':
        design_names.add(q)

print(f"설계시트 Q열 총 설계명: {len(design_names)}개")

# 기존 design_to_struct.json 로드
d2s = json.load(open('c:/workspace/my-first-project/design_to_struct.json', encoding='utf-8'))

# 각 설계명에 대해 올바른 구조 찾기
def normalize(s):
    return s.replace(' ','').replace('×','x').replace('FT','').replace('U.','').replace('G.','').replace('+IW','+IWRC').lower()

new_d2s = {}
unresolved = []

for dname in sorted(design_names):
    # 1. 직접 wire_design 키 매핑
    n = dname.replace(' ','').replace('×','x').lower()
    if n in wd_norm:
        new_d2s[dname] = wd_norm[n]
        continue
    
    # 2. 정규화 후 매핑 (U./G./FT 제거, +IW→+IWRC)
    stripped = dname
    for prefix in ['FT ', 'U.', 'G.', 'POW FT ']:
        stripped = stripped.replace(prefix, '')
    stripped = stripped.replace('+IW\n', '+IWRC').replace('+IW ', '+IWRC ').strip()
    if stripped.endswith('+IW'):
        stripped = stripped[:-3] + '+IWRC'
    
    ns = stripped.replace(' ','').replace('×','x').lower()
    if ns in wd_norm:
        new_d2s[dname] = wd_norm[ns]
        continue
    
    # 3. 기존 d2s에 있으면 사용 (수동으로 이미 수정한 항목)
    if dname in d2s:
        v = d2s[dname]
        # 하지만 기존 매핑이 wire_design에 있는지 검증
        if v and v != 'nan' and v.replace(' ','').replace('×','x').lower() in wd_norm:
            new_d2s[dname] = wd_norm[v.replace(' ','').replace('×','x').lower()]
            continue
    
    unresolved.append(dname)

# 기존 d2s의 수동 추가 항목도 보존 (직접 추가한 POWERTEC, P.TEC 등)
for k, v in d2s.items():
    if k not in new_d2s and v and v != 'nan':
        vn = v.replace(' ','').replace('×','x').lower()
        if vn in wd_norm:
            new_d2s[k] = wd_norm[vn]

print(f"\n매핑 완료: {len(new_d2s)}개")
print(f"\n미해결: {len(unresolved)}개")
for u in unresolved:
    print(f"  {u!r}")

# 저장
with open('c:/workspace/my-first-project/design_to_struct.json', 'w', encoding='utf-8') as f:
    json.dump(new_d2s, f, ensure_ascii=False, indent=2)

print("\nOK: design_to_struct.json rebuild complete!")
