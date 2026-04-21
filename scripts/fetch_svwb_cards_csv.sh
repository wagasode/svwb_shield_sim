#!/usr/bin/env bash
set -euo pipefail

# Fetch card list data from SVWB Deck Portal API and export to CSV.
# Output columns: pack name, card name, class, rarity.

BASE_URL="https://shadowverse-wb.com/web/CardList/cardList"
LANG_CODE="ja"
OUTPUT_PATH="${1:-data/svwb_cards_ja.csv}"
PAGES_DATA_PATH="docs/data/$(basename "$OUTPUT_PATH")"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not found." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -sS "$BASE_URL" -H "Lang: $LANG_CODE" > "$TMP_DIR/page_0.json"
TOTAL_COUNT="$(jq -r '.data.count' "$TMP_DIR/page_0.json")"
PAGE_SIZE="$(jq -r '.data.sort_card_id_list | length' "$TMP_DIR/page_0.json")"

if [[ "$PAGE_SIZE" -le 0 ]]; then
  echo "Error: page size is 0. API response may have changed." >&2
  exit 1
fi

for ((offset=PAGE_SIZE; offset<TOTAL_COUNT; offset+=PAGE_SIZE)); do
  curl -sS "${BASE_URL}?offset=${offset}" -H "Lang: $LANG_CODE" > "$TMP_DIR/page_${offset}.json"
done

{
  printf 'パック名,カード名,クラス,レアリティ\n'
  jq -s -r '
    def class_map: {
      "0":"ニュートラル",
      "1":"エルフ",
      "2":"ロイヤル",
      "3":"ウィッチ",
      "4":"ドラゴン",
      "5":"ナイトメア",
      "6":"ビショップ",
      "7":"ネメシス"
    };
    def rarity_map: {
      "1":"ブロンズレア",
      "2":"シルバーレア",
      "3":"ゴールドレア",
      "4":"レジェンド"
    };

    .[] | .data as $d
    | $d.sort_card_id_list[] as $id
    | ($d.card_details[($id|tostring)].common) as $c
    | [
        ($d.card_set_names[($c.card_set_id|tostring)] // ""),
        ($c.name // ""),
        (class_map[($c.class|tostring)] // ($c.class|tostring)),
        (rarity_map[($c.rarity|tostring)] // ($c.rarity|tostring))
      ]
    | @csv
  ' "$TMP_DIR"/page_*.json
} > "$OUTPUT_PATH"

echo "Saved: $OUTPUT_PATH"
echo "Rows (including header): $(wc -l < "$OUTPUT_PATH")"

mkdir -p "$(dirname "$PAGES_DATA_PATH")"
abs_output="$(cd "$(dirname "$OUTPUT_PATH")" && pwd)/$(basename "$OUTPUT_PATH")"
abs_pages="$(cd "$(dirname "$PAGES_DATA_PATH")" && pwd)/$(basename "$PAGES_DATA_PATH")"
if [[ "$abs_output" != "$abs_pages" ]]; then
  cp "$OUTPUT_PATH" "$PAGES_DATA_PATH"
  echo "Synced for Pages: $PAGES_DATA_PATH"
fi
