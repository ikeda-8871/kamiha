"""Generate a 3x3 deck image based on card ids listed in deck.txt."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, Iterable, List, NoReturn

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install it with 'pip install pillow'."
    ) from exc

try:  # pragma: no cover - Pillow version compatibility
    RESAMPLE_LANCZOS = Image.Resampling.LANCZOS  # type: ignore[attr-defined]
except AttributeError:  # pragma: no cover
    RESAMPLE_LANCZOS = Image.LANCZOS

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "cards.json"
IMAGE_DIR = BASE_DIR / "data" / "images"
DECK_FILE = BASE_DIR / "deck.txt"
OUTPUT_FILE = BASE_DIR / "deck.png"
EXPECTED_CARD_COUNT = 9
TYPE_CHARACTER = 0


def abort(message: str) -> NoReturn:
    print(f"[ERROR] {message}", file=sys.stderr)
    raise SystemExit(1)


def read_deck_ids(path: Path) -> List[int]:
    if not path.exists():
        abort(f"Deck list not found: {path.name}")
    raw_lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    deck_ids = [line for line in raw_lines if line]
    if len(deck_ids) != EXPECTED_CARD_COUNT:
        abort(
            f"deck.txt must contain exactly {EXPECTED_CARD_COUNT} card ids (found {len(deck_ids)})."
        )
    try:
        return [int(line) for line in deck_ids]
    except ValueError as exc:
        abort(f"deck.txt contains a non-numeric id: {exc}")


def load_cards(path: Path) -> Dict[int, Dict[str, object]]:
    if not path.exists():
        abort("cards.json not found. Run update_cards.py first.")
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    cards = data.get("cards", [])
    return {int(card["id"]): card for card in cards if "id" in card}


def validate_ids(
    deck_ids: Iterable[int], card_map: Dict[int, Dict[str, object]]
) -> List[Dict[str, object]]:
    cards: List[Dict[str, object]] = []
    for card_id in deck_ids:
        card = card_map.get(card_id)
        if card is None:
            abort(f"Card id {card_id} was not found in cards.json.")
        assert card is not None
        if card.get("type") != TYPE_CHARACTER:
            abort(
                f"Card id {card_id} is not a character card and cannot be used in the deck."
            )
        cards.append(card)
    return cards


def open_images(deck_cards: Iterable[Dict[str, object]]) -> List[Image.Image]:
    if not IMAGE_DIR.exists():
        abort(
            "Image directory does not exist. Run update_cards.py to download card images."
        )
    images: List[Image.Image] = []
    for card in deck_cards:
        image_name = card.get("image")
        if not image_name:
            abort(f"Card id {card['id']} does not contain an image reference.")
        image_path = IMAGE_DIR / str(image_name)
        if not image_path.exists():
            abort(f"Image file not found for card id {card['id']}: {image_name}")
        image = Image.open(image_path).convert("RGBA")
        images.append(image)
    return images


def compose_grid(images: List[Image.Image]) -> Image.Image:
    base_width, base_height = images[0].size
    canvas = Image.new("RGBA", (base_width * 3, base_height * 3))
    for index, image in enumerate(images):
        if image.size != (base_width, base_height):
            image = image.resize((base_width, base_height), RESAMPLE_LANCZOS)
        row, col = divmod(index, 3)
        offset = (col * base_width, row * base_height)
        canvas.paste(image, offset)
    return canvas


def main() -> int:
    deck_ids = read_deck_ids(DECK_FILE)
    card_map = load_cards(DATA_PATH)
    deck_cards = validate_ids(deck_ids, card_map)
    images = open_images(deck_cards)
    grid = compose_grid(images)
    grid.save(OUTPUT_FILE)
    print(f"Deck image saved to {OUTPUT_FILE.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
