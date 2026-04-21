# SVWB Shield Simulator

`Shadowverse: Worlds Beyond` のカードCSVを使った、GitHub Pages向けのシールド戦シミュレーターです。

## 構成

- `scripts/fetch_svwb_cards_csv.sh`
  - 公式Deck Portal APIからCSVを生成
  - 出力列: `パック名,カードID,カード名,クラス,レアリティ,公式カードURL`
  - `data/svwb_cards_ja.csv` と `docs/data/svwb_cards_ja.csv` を同期
- `docs/`
  - GitHub Pagesで公開する静的サイト
  - `index.html`, `app.js`, `styles.css`
  - 初期値は非公式の有力情報ベースの排出率（通常枠/8枚目保証枠）を設定

## CSV更新

```bash
./scripts/fetch_svwb_cards_csv.sh
```

## ローカル確認

```bash
python3 -m http.server 18080 -d docs
```

ブラウザで `http://127.0.0.1:18080` を開く。

## GitHub Pages公開

このリポジトリには `.github/workflows/deploy-pages.yml` を追加済みです。

1. GitHubのリポジトリ設定で `Pages` を開く
2. `Source` を `GitHub Actions` に設定
3. `main` にpushする
4. Actions `Deploy GitHub Pages` 完了後、Pages URLで公開される
