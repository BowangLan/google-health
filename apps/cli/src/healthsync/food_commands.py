"""Food-only operations layered on the shared file and sync workflow."""

import sys

from healthsync import style as S
from healthsync.common import number, tidy_numbers


def add(engine, args):
    stamp, placeholder = engine.clock.entry_time(args.date, args.at)
    fm = {
        "meal": args.meal.upper(),
        "name": args.name,
        "start": stamp,
        "kcal": args.kcal,
        "serving": {"amount": args.amount, "unit": args.unit},
    }
    for name in ("carbs", "fat"):
        if getattr(args, name) is not None:
            fm[f"{name}_g"] = getattr(args, name)
    nutrients = {
        key: getattr(args, attr)
        for attr, key in (
            ("protein", "PROTEIN"),
            ("sugar", "SUGAR"),
            ("fiber", "DIETARY_FIBER"),
        )
        if getattr(args, attr) is not None
    }
    if args.sodium_mg is not None:
        nutrients["SODIUM"] = args.sodium_mg / 1000
    if nutrients:
        fm["nutrients"] = nutrients
    note = args.note or ""
    if placeholder:
        note = (note + "\nNoon is a placeholder; the time was not supplied.").strip()
    return engine.add(fm, note, args.no_push, args.dry_run)


def clone(engine, args):
    by_id, new, orphans = engine.scan()
    latest = {}
    for path, fm, _ in list(by_id.values()) + new + orphans:
        name = fm["name"].strip().lower()
        if args.keyword.lower() not in name:
            continue
        if name not in latest or fm["start"] > latest[name][1]["start"]:
            latest[name] = (path, fm)
    rows = sorted(latest.values(), key=lambda item: item[1]["start"], reverse=True)[:10]
    if not rows:
        print(S.dim(f"no local entry matching {args.keyword!r}"))
        return 1
    for i, (_, fm) in enumerate(rows, 1):
        sv = fm.get("serving", {})
        amount_text = sv.get("amount", 1)
        serving = f"{amount_text} {sv.get('unit', 'serving')}"
        index = f"{i:2}"
        print(
            f"  {S.bold(index)} {S.dim(fm['start'][:16])} "
            f"{engine.record.summary(fm)} {S.dim('·')} {S.dim(serving)}"
        )
    pick, amount = args.index, args.amount
    if (pick is None or amount is None) and not sys.stdin.isatty():
        print(S.dim("pass --index N --amount X to clone without a terminal"))
        return 0
    try:
        if pick is None:
            pick = int(input(f"  {S.yellow('?')} which? [1-{len(rows)}] "))
        if not 1 <= pick <= len(rows):
            raise ValueError("selection is out of range")
        src_path, src = rows[pick - 1]
        sv = src.get("serving", {})
        original_amount = number(sv.get("amount", 1), "amount")
        if amount is None:
            raw = input(f"  {S.yellow('?')} amount? [{original_amount:g}] ").strip()
            amount = float(raw) if raw else original_amount
    except (EOFError, KeyboardInterrupt):
        return 0
    if number(amount, "amount") <= 0 or original_amount <= 0:
        raise ValueError("amount must be greater than zero")
    factor = amount / original_amount
    fm = {
        "meal": src.get("meal", "ANYTIME"),
        "name": src["name"],
        "start": engine.clock.now().isoformat(),
        "serving": {"amount": amount, "unit": sv.get("unit", "serving")},
    }
    for key in ("kcal", "carbs_g", "fat_g"):
        if src.get(key) is not None:
            fm[key] = tidy_numbers(round(src[key] * factor, 6))
    if src.get("nutrients"):
        fm["nutrients"] = {
            k: tidy_numbers(round(v * factor, 6)) for k, v in src["nutrients"].items()
        }
    if src.get("food_ref"):
        fm["food_ref"] = src["food_ref"]
    return engine.add(
        fm, f"Cloned from {engine.store.rel(src_path)}.", args.no_push, args.dry_run
    )


def total(engine, args):
    day = engine.clock.date(args.date).isoformat()
    by_id, new, orphans = engine.scan()
    rows = sorted(
        [
            fm
            for _, fm, _ in list(by_id.values()) + new + orphans
            if engine.record.day(fm) == day
        ],
        key=lambda fm: fm["start"],
    )
    if not rows:
        print(S.dim(f"no entries for {day}; run hsync food pull --days 7"))
        return 1
    kcal = carbs = fat = protein = 0
    for fm in rows:
        p = (fm.get("nutrients") or {}).get("PROTEIN", 0)
        dash = "—"
        protein_text = (
            S.green(f"{p:>5g}g protein") if p else S.dim(f"{dash:>5}g protein")
        )
        meal_name = fm.get("meal", "")
        meal = S.cyan(f"{meal_name:<9}")
        calories = S.yellow(f"{tidy_numbers(fm['kcal']):>5g} kcal")
        name = str(fm.get("name", ""))[:46]
        print(
            f"  {S.dim(fm['start'][11:16])}  {meal} {name:<46} "
            f"{calories}  {protein_text}"
        )
        kcal += fm["kcal"]
        carbs += fm.get("carbs_g", 0)
        fat += fm.get("fat_g", 0)
        protein += p
    print(
        f"  {S.bold(day)}  {S.yellow(S.bold(f'{kcal:g} kcal'))} "
        f"{S.dim(f'across {len(rows)} entries')}"
    )
    print(
        f"  {S.green(f'protein {protein:.1f}g')} {S.dim('·')} "
        f"{S.dim(f'carbs {carbs:g}g · fat {fat:g}g')}"
    )
    return 0
