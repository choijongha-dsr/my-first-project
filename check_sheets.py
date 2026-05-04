import pandas as pd

xl = pd.ExcelFile('c:/workspace/my-first-project/설계통합.xlsx')
for i, sheet in enumerate(xl.sheet_names):
    print(f'[{i}] {repr(sheet)}')
