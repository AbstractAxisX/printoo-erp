#!/usr/bin/env python3
"""Read-only row counts for printoo24 prod DB (python sqlite3 — Prisma-independent)."""
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/printoo24-admin/db/custom.db"
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
tables = [
    "user", "customer", "order", "orderItem", "invoice", "preInvoice",
    "materialCost", "revenueLog", "notification", "orderEvent", "userModule",
    "payment", "activity", "deal", "task", "supplier", "material",
    "package", "payrollEntry", "expenseType", "fxRate",
]
parts = []
for t in tables:
    try:
        n = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        parts.append(f"{t}={n}")
    except Exception as e:
        parts.append(f"{t}=ERR({e})")
print(" ".join(parts))
con.close()
