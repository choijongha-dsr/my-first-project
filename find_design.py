import pandas as pd
import sys
import re

file_path = "c:/workspace/my-first-project/설계통합.xlsx"
sheets = pd.read_excel(file_path, sheet_name=None, header=None)

search_terms = ["8xws", "8XWS", "6xws", "6XWS", "FT", "U.", "G.", "POW"]

with open("c:/workspace/my-first-project/search_results_utf8.txt", "w", encoding="utf-8") as f:
    for sheet_name, df in sheets.items():
        for r in range(len(df)):
            for c in range(len(df.columns)):
                val = str(df.iloc[r, c]).strip()
                val_lower = val.lower()
                if "8xws" in val_lower or "6xws" in val_lower or "pow " in val_lower:
                    if len(val) > 2 and "nan" not in val_lower:
                        f.write(f"Found '{val}' in sheet '{sheet_name}', row {r}, col {c}\n")
