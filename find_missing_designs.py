import pandas as pd
import json
import sys

# wire_design.json 로드
wd = json.load(open('c:/workspace/my-first-project/wire_design.json', encoding='utf-8'))
wd_norm = {k.replace(' ','').replace('x','x').lower(): k for k in wd.keys()}

# design_to_struct.json 로드
d2s = json.load(open('c:/workspace/my-first-project/design_to_struct.json', encoding='utf-8'))

# 설계시트(인덱스 1)에서 Q열(16)=설계명 전체 읽기
xl = pd.ExcelFile('c:/workspace/my-first-project/설계통합.xlsx')
sheet = xl.sheet_names[1]
df = xl.parse(sheet, header=None)

q_col = 16
design_names = []
for idx, row in df.iterrows():
    q = str(row[q_col]).strip() if q_col < len(row) else ''
    if q and q != 'nan':
        design_names.append(q)

design_names = sorted(set(design_names))

def normalize(s):
    s = s.strip()
    s = s.replace('×','x')
    s = s.replace(' ','')
    s = s.lower()
    return s

def try_resolve(dname):
    # 1. design_to_struct 직접 매핑
    if dname in d2s:
        v = d2s[dname]
        if v and v in wd:
            return v, 'd2s_exact'

    # 2. wire_design 직접 매핑
    n = normalize(dname)
    if n in wd_norm:
        return wd_norm[n], 'wd_exact'

    # 3. 접두어 제거 후 wire_design 매핑
    stripped = dname
    for prefix in ['FT ', 'U.', 'G.', 'POW FT ', 'P.TEC \\d+ ', 'P.TEC ']:
        stripped = stripped.replace(prefix, '') if not prefix.startswith('P.TEC \\d') else stripped
    if stripped.endswith('+IW'):
        stripped = stripped[:-3] + '+IWRC'
    stripped = stripped.replace('+I ', '+IWRC ')
    
    ns = normalize(stripped)
    if ns in wd_norm:
        return wd_norm[ns], 'stripped'

    # 4. POW 접두어 추가 시도
    for pref in ['POW ', '']:
        trial = pref + stripped
        nt = normalize(trial)
        if nt in wd_norm:
            return wd_norm[nt], 'pow_prepend'

    return None, 'unresolved'

print(f"설계시트 총 설계명: {len(design_names)}개\n")
print("=== 구조 없음 (미매핑) ===")
unresolved = []
for dname in design_names:
    result, method = try_resolve(dname)
    if result is None:
        unresolved.append(dname)
        print(f"  {dname}")

print(f"\n미매핑 총 {len(unresolved)}개 / 전체 {len(design_names)}개")
