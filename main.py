"""Simple CLI to inspect locally cached Hakurei Frontier card data."""

from __future__ import annotations

import argparse
import json
import sys
import textwrap
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Set

DATA_PATH = Path(__file__).resolve().parent / "data" / "cards.json"
TYPE_LABEL = {0: "Character", 1: "Ability"}


def load_dataset() -> Dict[str, Any]:
    if not DATA_PATH.exists():
        raise SystemExit(
            "cards.json not found. Run update_cards.py to fetch the latest card list before using this tool."
        )
    with DATA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def resolve_pack_filter(
    raw_values: Sequence[str], pack_names: Sequence[str]
) -> Set[int]:
    result: Set[int] = set()
    lower_names = [name.lower() for name in pack_names]
    for raw in raw_values:
        if raw.isdigit():
            index = int(raw)
            if 0 <= index < len(pack_names):
                result.add(index)
            else:
                print(f"[WARN] pack index {raw} is out of range", file=sys.stderr)
            continue
        lowered = raw.lower()
        matches = {idx for idx, name in enumerate(lower_names) if lowered in name}
        if not matches:
            print(f"[WARN] no pack contains '{raw}'", file=sys.stderr)
        result.update(matches)
    return result


def card_matches_filters(
    card: Dict[str, Any], args: argparse.Namespace, pack_filter: Set[int]
) -> bool:
    if args.type is not None and card.get("type") != args.type:
        return False
    if args.query:
        lowered = args.query.lower()
        name_hit = lowered in (card.get("name") or "").lower()
        tag_hit = any(lowered in tag.lower() for tag in card.get("tags", []))
        if not (name_hit or tag_hit):
            return False
    if args.text:
        text_hit = args.text.lower() in (card.get("text") or "").lower()
        if not text_hit:
            return False
    if args.tag:
        required_tags = [entry.lower() for entry in args.tag]
        card_tags = [tag.lower() for tag in card.get("tags", [])]
        if not all(any(req in tag for tag in card_tags) for req in required_tags):
            return False
    if pack_filter and not any(pack in pack_filter for pack in card.get("packs", [])):
        return False
    return True


def format_values(values: Iterable[str]) -> str:
    items = list(values)
    return ", ".join(items) if items else "-"


def render_card(card: Dict[str, Any], packs: Sequence[str], *, show_qa: bool) -> str:
    pack_names = [packs[idx] for idx in card.get("packs", []) if 0 <= idx < len(packs)]
    ability_labels = [
        entry.get("label", entry.get("code", "")) for entry in card.get("abilities", [])
    ]
    cost = card.get("cost") if card.get("cost") is not None else "-"
    power = card.get("power") if card.get("power") is not None else "-"
    rate = card.get("rate") if card.get("rate") is not None else "-"
    header = f"[{card['id']:03d}] {card.get('name', 'Unknown')}"
    lines = [header]
    lines.append(
        f"  type: {TYPE_LABEL.get(card.get('type'), card.get('type'))} | cost: {cost} | power: {power} | rate: {rate}"
    )
    if card.get("tags"):
        lines.append(f"  tags: {format_values(card['tags'])}")
    lines.append(f"  packs: {format_values(pack_names)}")
    if ability_labels:
        lines.append(f"  abilities: {format_values(ability_labels)}")
    if card.get("text"):
        wrapped = textwrap.fill(
            card["text"],
            width=88,
            initial_indent="  text: ",
            subsequent_indent="        ",
        )
        lines.append(wrapped)
    lines.append(f"  image: data/images/{card['image']}")
    if show_qa and card.get("qa"):
        for entry in card["qa"]:
            question = entry.get("q")
            answer = entry.get("a")
            if question:
                lines.append(
                    textwrap.fill(
                        question,
                        width=88,
                        initial_indent="    Q: ",
                        subsequent_indent="       ",
                    )
                )
            if answer:
                lines.append(
                    textwrap.fill(
                        answer,
                        width=88,
                        initial_indent="    A: ",
                        subsequent_indent="       ",
                    )
                )
    return "\n".join(lines)


def list_packs(packs: Sequence[str]) -> None:
    for index, name in enumerate(packs):
        print(f"[{index:02d}] {name}")


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search the offline Hakurei Frontier card catalog."
    )
    parser.add_argument(
        "--query", "-q", help="Substring to match against card names and tags."
    )
    parser.add_argument("--text", help="Substring to match inside card text.")
    parser.add_argument(
        "--tag",
        action="append",
        help="Require cards to include tags containing this value. Can repeat.",
    )
    parser.add_argument(
        "--pack",
        action="append",
        help="Restrict results to packs (index or substring). Can repeat.",
    )
    parser.add_argument(
        "--type", choices=["chara", "ability", "0", "1"], help="Filter by card type."
    )
    parser.add_argument(
        "--limit", type=int, default=25, help="Maximum number of results to show."
    )
    parser.add_argument(
        "--show-qa", action="store_true", help="Include Q&A entries in the output."
    )
    parser.add_argument(
        "--list-packs", action="store_true", help="List pack indexes and exit."
    )
    return parser.parse_args(argv)


def normalize_type_arg(raw: str | None) -> int | None:
    if raw is None:
        return None
    if raw in {"0", "chara"}:
        return 0
    if raw in {"1", "ability"}:
        return 1
    return None


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    dataset = load_dataset()
    packs = dataset.get("packs", [])
    if args.list_packs:
        list_packs(packs)
        return 0

    args.type = normalize_type_arg(args.type)
    pack_filter: Set[int] = set()
    if args.pack:
        pack_filter = resolve_pack_filter(args.pack, packs)

    cards = dataset.get("cards", [])
    filtered = [card for card in cards if card_matches_filters(card, args, pack_filter)]
    if args.limit is not None and args.limit > 0:
        filtered = filtered[: args.limit]

    if not filtered:
        print("No cards matched the specified criteria.")
        return 0

    for card in filtered:
        print(render_card(card, packs, show_qa=args.show_qa))
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
