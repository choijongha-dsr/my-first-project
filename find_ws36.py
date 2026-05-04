import pandas as pd

xl = pd.ExcelFile('c:/workspace/my-first-project/설계통합.xlsx')

# 설계시트 찾기: 시트명이 한글이라 인덱스로 풀스캔
for i, sheet in enumerate(xl.sheet_names):
    try:
        df = xl.parse(sheet, header=None)
        # Q열(16) 설계명, S열(18) 구조 — POW 6xWS(36) 찾기
        for col in df.columns:
            mask = df[col].astype(str).str.contains('6xWS.36', na=False, regex=True)
            if mask.any():
                rows = df[mask]
                print(f"=== 시트[{i}] {repr(sheet)}, 열{col}: {rows[[col]].values.flatten().tolist()[:5]}")
                # 주변 열도 보기
                for idx in rows.index[:3]:
                    print(f"  행{idx}: {df.loc[idx].tolist()}")
                break
    except Exception as e:
        print(f"[{i}] 오류: {e}")
