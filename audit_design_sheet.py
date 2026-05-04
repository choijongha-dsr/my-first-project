import pandas as pd
import json

# 설계시트(인덱스 1)에서 Q열(16), S열(18) 읽기
xl = pd.ExcelFile('c:/workspace/my-first-project/설계통합.xlsx')
sheet = xl.sheet_names[1]  # 설계시트
df = xl.parse(sheet, header=None)

# Q열(16)=설계명, S열(18)=구조명
q_col, s_col = 16, 18
mapping = {}
bad = []

for idx, row in df.iterrows():
    q = str(row[q_col]).strip() if q_col < len(row) else ''
    s = str(row[s_col]).strip() if s_col < len(row) else ''
    if q and q != 'nan' and s and s != 'nan':
        # wire_design.json에 있는 구조인지 확인
        mapping[q] = s

# 엑셀에서의 잘못된 매핑 목록 출력
wd = json.load(open('c:/workspace/my-first-project/wire_design.json', encoding='utf-8'))
wd_norm = {k.replace(' ','').lower(): k for k in wd.keys()}

print("=== 엑셀 설계시트의 의심 매핑 (구조가 wire_design에 없거나 이상한 것) ===")
for q, s in mapping.items():
    if s.replace(' ','').lower() not in wd_norm:
        print(f"  {q!r} -> {s!r}  [wire_design에 없음]")
    elif q.replace(' ','').lower() != s.replace(' ','').lower():
        # 설계명이 구조명과 다를 때 (매핑 변환이 일어나는 경우)
        print(f"  {q!r} -> {s!r}")
