"""Utility to download and normalize Hakurei Frontier card data for offline use."""

from __future__ import annotations

import argparse
import ast
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

BASE_URL = "https://sitappa.com/hakurei_ss/"
MASTER_JS_PATH = "kamiCardMasterData.js"
IMAGE_TEMPLATE = "cardListImageMin/sample{index:04d}.png"
PLACEHOLDER_IMAGE = "cardListImageMin/ph.png"
USER_AGENT = (
    "Mozilla/5.0 (DeckBuilderUpdater/1.0; +https://github.com/ikeda-8871/workspace)"
)

DATA_DIR = Path(__file__).resolve().parent / "data"
IMAGES_DIR = DATA_DIR / "images"
CARDS_JSON = DATA_DIR / "cards.json"

CommentPattern = re.compile(r"(?m)^[ \t]*//.*$")
KEY_PATTERN = re.compile(r"([\{,\[]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:")
AbilityRefPattern = re.compile(r"abilityLabel\.([A-Za-z_]+)")
PackLinkagePattern = re.compile(r"packLinkage\.([A-Za-z0-9_]+)")


def _http_get(url: str, *, context: ssl.SSLContext | None = None) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30, context=context) as response:
        return response.read()


def _strip_line_comments(text: str) -> str:
    return CommentPattern.sub("", text)


def _quote_object_keys(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        prefix, key = match.groups()
        return f"{prefix}'{key}':"

    return KEY_PATTERN.sub(repl, text)


def _literal_eval(text: str) -> Any:
    text = (
        text.replace("true", "True").replace("false", "False").replace("null", "None")
    )
    return ast.literal_eval(text)


def _parse_pack_list(js_text: str) -> List[str]:
    match = re.search(r"const\s+pack\s*=\s*\[(.*?)\];", js_text, re.DOTALL)
    if not match:
        raise RuntimeError("Unable to locate pack list in source script.")
    block = "[" + match.group(1) + "]"
    return list(_literal_eval(_strip_line_comments(block)))


def _parse_ability_labels(js_text: str) -> Dict[str, str]:
    match = re.search(
        r"export\s+const\s+abilityLabel\s*=\s*\{(.*?)\};", js_text, re.DOTALL
    )
    if not match:
        raise RuntimeError("Unable to locate ability labels in source script.")
    block = "{" + match.group(1) + "}"
    cleaned = _strip_line_comments(block)
    quoted = _quote_object_keys(cleaned)
    return dict(_literal_eval(quoted))


def _parse_pack_linkage(js_text: str) -> Dict[str, str]:
    match = re.search(r"const\s+packLinkage\s*=\s*\{(.*?)\}", js_text, re.DOTALL)
    if not match:
        return {}
    block = "{" + match.group(1) + "}"
    cleaned = _strip_line_comments(block)
    quoted = _quote_object_keys(cleaned)
    return dict(_literal_eval(quoted))


def _resolve_references(cards: List[Dict[str, Any]]) -> None:
    by_id = {card["id"]: card for card in cards}
    for card in cards:
        reference = card.get("refer_id")
        if reference is None:
            continue
        base = by_id.get(reference)
        if not base:
            raise RuntimeError(f"refer_id {reference} not found for card {card['id']}")
        for key, value in base.items():
            if key in {"id"}:
                continue
            if key not in card or card[key] in (None, "", [], {}):
                card[key] = deepcopy(value)


def _normalize_tags(raw: str | None) -> List[str]:
    if not raw:
        return []
    parts = re.split(r"[\s,]+", raw)
    return [part for part in parts if part]


def _normalize_card(
    card: Dict[str, Any], ability_labels: Dict[str, str]
) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {
        "id": card.get("id"),
        "type": card.get("type"),
        "name": card.get("nm"),
        "cost": card.get("cost"),
        "power": card.get("power"),
        "rate": card.get("rate"),
        "packs": card.get("pack", []),
        "text": (card.get("text") or "").replace("\r\n", "\n").replace("\r", "\n"),
        "qa": deepcopy(card.get("qa", [])),
        "illustrator": card.get("illust"),
        "source": card.get("src"),
        "source_name": card.get("srcName"),
        "kirakira": bool(card.get("kirakira")),
        "image": f"sample{(card.get('id') or 0) + 1:04d}.png",
        "tags": _normalize_tags(card.get("tag")),
    }
    if "refer_id" in card:
        normalized["refer_id"] = card["refer_id"]
    ability_codes = card.get("ability", []) or []
    normalized["abilities"] = [
        {
            "code": code,
            "label": ability_labels.get(code, code),
        }
        for code in ability_codes
    ]
    return normalized


def _parse_card_list(
    js_text: str, ability_labels: Dict[str, str], pack_linkage: Dict[str, str]
) -> List[Dict[str, Any]]:
    match = re.search(
        r"export\s+const\s+cardData\s*=\s*getCardDataList\s*\((\[.*\])\);",
        js_text,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError("Unable to locate card data in source script.")
    block = match.group(1)
    cleaned = _strip_line_comments(block)
    cleaned = AbilityRefPattern.sub(lambda m: f"'{m.group(1)}'", cleaned)
    if pack_linkage:
        cleaned = PackLinkagePattern.sub(
            lambda m: f"'{pack_linkage.get(m.group(1), m.group(1))}'", cleaned
        )
    quoted = _quote_object_keys(cleaned)
    raw_cards: List[Dict[str, Any]] = list(_literal_eval(quoted))
    _resolve_references(raw_cards)
    return [_normalize_card(card, ability_labels) for card in raw_cards]


def _download_images(
    cards: Iterable[Dict[str, Any]], *, force: bool, context: ssl.SSLContext | None
) -> Tuple[int, List[str]]:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    errors: List[str] = []
    placeholder_bytes: bytes | None = None
    for card in cards:
        index = (card["id"] or 0) + 1
        filename = card["image"]
        target = IMAGES_DIR / filename
        if target.exists() and not force:
            continue
        url = BASE_URL + IMAGE_TEMPLATE.format(index=index)
        try:
            data = _http_get(url, context=context)
        except urllib.error.HTTPError as http_error:
            if http_error.code == 404:
                if placeholder_bytes is None:
                    try:
                        placeholder_bytes = _http_get(
                            BASE_URL + PLACEHOLDER_IMAGE, context=context
                        )
                    except Exception as placeholder_error:  # noqa: BLE001
                        errors.append(
                            f"placeholder download failed: {placeholder_error}"
                        )
                        continue
                data = placeholder_bytes
            else:
                errors.append(f"{filename}: HTTP {http_error.code}")
                continue
        except Exception as generic_error:  # noqa: BLE001
            errors.append(f"{filename}: {generic_error}")
            continue
        target.write_bytes(data)
        downloaded += 1
    return downloaded, errors


def _build_metadata(card_count: int, *, downloaded_images: int) -> Dict[str, Any]:
    return {
        "card_count": card_count,
        "downloaded_images": downloaded_images,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": BASE_URL + MASTER_JS_PATH,
    }


def _build_payload(
    cards: List[Dict[str, Any]],
    packs: List[str],
    ability_labels: Dict[str, str],
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "metadata": metadata,
        "packs": packs,
        "ability_labels": ability_labels,
        "cards": cards,
    }


def update_data(
    *,
    skip_images: bool,
    force_images: bool,
    ssl_context: ssl.SSLContext | None,
) -> Dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    raw_js = _http_get(BASE_URL + MASTER_JS_PATH, context=ssl_context).decode("utf-8")
    packs = _parse_pack_list(raw_js)
    ability_labels = _parse_ability_labels(raw_js)
    pack_linkage = _parse_pack_linkage(raw_js)
    cards = _parse_card_list(raw_js, ability_labels, pack_linkage)
    downloaded = 0
    errors: List[str] = []
    if not skip_images:
        downloaded, errors = _download_images(
            cards, force=force_images, context=ssl_context
        )
    metadata = _build_metadata(len(cards), downloaded_images=downloaded)
    payload = _build_payload(cards, packs, ability_labels, metadata)
    CARDS_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {
        "cards_path": str(CARDS_JSON),
        "image_dir": str(IMAGES_DIR),
        "downloaded_images": downloaded,
        "errors": errors,
    }


def _parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch and normalize Hakurei Frontier card data."
    )
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Do not download or refresh card images.",
    )
    parser.add_argument(
        "--force-images",
        action="store_true",
        help="Redownload images even if the file already exists.",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Disable HTTPS certificate verification (not recommended).",
    )
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    ssl_context = None if not args.insecure else ssl._create_unverified_context()
    try:
        result = update_data(
            skip_images=args.skip_images,
            force_images=args.force_images,
            ssl_context=ssl_context,
        )
    except Exception as error:  # noqa: BLE001
        print(f"[ERROR] {error}", file=sys.stderr)
        return 1
    print(f"Cards saved to: {result['cards_path']}")
    if not args.skip_images:
        print(f"Images directory: {result['image_dir']}")
        print(f"Images downloaded: {result['downloaded_images']}")
    if result["errors"]:
        print("Warnings:")
        for warning in result["errors"]:
            print(f"  - {warning}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
