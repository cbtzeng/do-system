#!/usr/bin/env python3
"""
calc_estimate.py — 工時成本估算計算器 (TWD, 含5%營業稅)

用途：把模組人天與費率、附加項(PM/QA/緩衝)、營業稅一次算好，
保證加總/加成/稅額一致正確，避免手算錯誤。

輸入 JSON 格式：
{
  "currency": "TWD",
  "tax_rate": 0.05,
  "modules": [
    {"name": "帳號權限", "complexity": "中", "man_days": 8, "role": "工程師", "day_rate": 12000},
    {"name": "金流串接", "complexity": "高", "man_days": 12, "role": "資深工程師", "day_rate": 16000}
  ],
  "addons": [
    {"name": "專案管理(PM)", "rate": 0.12},
    {"name": "測試QA", "rate": 0.15},
    {"name": "風險緩衝", "rate": 0.15}
  ],
  "staffing": {"people": 2, "parallel_factor": 0.8}
}

附加項(addons)的 rate 為「對模組未稅小計的百分比加成」。
staffing 用來估算日曆工期（選填）。

用法：
    python calc_estimate.py input.json            # 印出 JSON 結果
    python calc_estimate.py input.json -o out.json # 同時寫檔
"""
import json
import sys
import argparse


def money(x):
    """四捨五入到整數元。"""
    return int(round(x))


def calc(data):
    tax_rate = data.get("tax_rate", 0.05)
    currency = data.get("currency", "TWD")
    modules = data.get("modules", [])
    addons = data.get("addons", [])
    staffing = data.get("staffing", {})

    module_rows = []
    modules_subtotal = 0
    total_man_days = 0
    for m in modules:
        md = float(m.get("man_days", 0))
        rate = float(m.get("day_rate", 0))
        amount = money(md * rate)
        modules_subtotal += amount
        total_man_days += md
        module_rows.append({
            "name": m.get("name", ""),
            "complexity": m.get("complexity", ""),
            "man_days": md,
            "role": m.get("role", ""),
            "day_rate": money(rate),
            "amount": amount,
        })

    addon_rows = []
    addons_total = 0
    for a in addons:
        rate = float(a.get("rate", 0))
        amount = money(modules_subtotal * rate)
        addons_total += amount
        addon_rows.append({
            "name": a.get("name", ""),
            "rate": rate,
            "amount": amount,
        })

    subtotal_pretax = modules_subtotal + addons_total
    tax = money(subtotal_pretax * tax_rate)
    total_with_tax = subtotal_pretax + tax

    # 工期估算
    schedule = None
    people = staffing.get("people")
    pf = staffing.get("parallel_factor", 1.0)
    if people:
        effective = people * pf if pf else people
        calendar_days = round(total_man_days / effective, 1) if effective else None
        schedule = {
            "total_man_days": total_man_days,
            "people": people,
            "parallel_factor": pf,
            "estimated_working_days": calendar_days,
            "estimated_weeks": round(calendar_days / 5, 1) if calendar_days else None,
        }

    return {
        "currency": currency,
        "tax_rate": tax_rate,
        "modules": module_rows,
        "modules_subtotal": modules_subtotal,
        "addons": addon_rows,
        "addons_total": addons_total,
        "subtotal_pretax": subtotal_pretax,
        "tax": tax,
        "total_with_tax": total_with_tax,
        "total_man_days": total_man_days,
        "schedule": schedule,
    }


def fmt(n):
    return f"{n:,}"


def print_summary(r):
    cur = r["currency"]
    print("=" * 56)
    print(f"{'模組':<18}{'人天':>6}{'費率':>10}{'金額(未稅)':>16}")
    print("-" * 56)
    for m in r["modules"]:
        print(f"{m['name']:<18}{m['man_days']:>6}{fmt(m['day_rate']):>10}{fmt(m['amount']):>16}")
    print("-" * 56)
    print(f"{'模組小計':<34}{fmt(r['modules_subtotal']):>16}")
    for a in r["addons"]:
        label = f"{a['name']} ({a['rate']*100:.0f}%)"
        print(f"{label:<34}{fmt(a['amount']):>16}")
    print("-" * 56)
    print(f"{'未稅小計':<34}{fmt(r['subtotal_pretax']):>16}")
    print(f"{'營業稅 ' + str(r['tax_rate']*100) + '%':<34}{fmt(r['tax']):>16}")
    print(f"{'含稅總計 (' + cur + ')':<34}{fmt(r['total_with_tax']):>16}")
    print("=" * 56)
    if r["schedule"]:
        s = r["schedule"]
        print(f"總人天 {s['total_man_days']} | 人力 {s['people']} | "
              f"估算工期 約 {s['estimated_working_days']} 工作天 (~{s['estimated_weeks']} 週)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", help="輸入 JSON 檔路徑")
    ap.add_argument("-o", "--output", help="輸出 JSON 檔路徑")
    ap.add_argument("--quiet", action="store_true", help="只輸出 JSON，不印摘要表")
    args = ap.parse_args()

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)

    result = calc(data)

    if not args.quiet:
        print_summary(result)

    out = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"\n已寫入 {args.output}")
    else:
        print("\n--- JSON ---")
        print(out)


if __name__ == "__main__":
    main()
