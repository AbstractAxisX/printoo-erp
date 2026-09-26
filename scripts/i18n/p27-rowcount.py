#!/usr/bin/env python3
"""PHASE 27 — read-only rowcount snapshot (sqlite3 module, mode=ro).
Usage: python3 p27-rowcount.py <db-path> [out-json-path]"""
import json
import sqlite3
import sys

db = sys.argv[1] if len(sys.argv) > 1 else "db/custom.db"
out_path = sys.argv[2] if len(sys.argv) > 2 else None

con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
tables = [r[0] for r in con.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'"
)]
out = {}
for t in tables:
    out[t] = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
out["_integrity"] = integrity
con.close()

text = json.dumps(out, sort_keys=True, ensure_ascii=False, indent=1)
if out_path:
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
print(text)
