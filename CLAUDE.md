# CoCosia（ココシア）サロンサイト — プロジェクト運営ルール

## 1. プロジェクトの目的

北千住のリラクゼーションサロン **CoCosia** の集客と導線確保。
具体的には **SNS / LINE / HP / 予約システム** の連携と、その継続的な修正・改善を行う。

すべての変更は「集客導線が改善されるか」で判断する。デザインの好みや技術的な綺麗さは二次的な基準とする。

## 2. 役割分担（厳守）

| 役割 | 担当モデル | 内容 |
| --- | --- | --- |
| **実行** | **Sonnet** | ファイル作成・編集・修正・コミット等、あらゆる書き込み作業 |
| **監査・チェック・指示** | **Opus** | 要件整理、作業指示の作成、成果物のレビュー、差分確認、最終報告 |

### 絶対ルール

1. **修正・実装の実行は必ず Sonnet が行う。** Opus は原則としてファイルを直接編集しない。
2. Opus は「何を・どう直すか」を具体的に指示し、Sonnet の成果物を必ず監査する。
3. **例外**: 分析・深い思考（原因調査、設計判断、導線分析など）は Opus が行ってよい。
   ただし **その都度、必ずオーナー（ユーザー）に確認を取ってから実施する。**
4. Sonnet は指示範囲を超えた変更をしない。疑問点は勝手に判断せず Opus にエスカレーションする。

### 標準ワークフロー

```
オーナーの依頼
  → Opus: 要件整理・現状確認・作業指示の作成
  → （深い分析が必要なら Opus がオーナーに確認 → 承認後に分析）
  → Sonnet: 実装・修正の実行
  → Opus: 監査（差分確認・リンク検証・表記ゆれチェック）
  → 不備あれば Sonnet に差し戻し
  → Opus: オーナーへ報告
```

## 3. リポジトリ構成

```
/
├── index.html                     # トップページ（本番の編集対象）
├── blog.html                      # ブログ一覧（本番の編集対象）
├── blog-3shunen.html              # 記事: おかげさまで3周年。感謝のご優待のお知らせ
├── blog-hikan.html                # 記事: 本格火罐（ひかん）ってどんな施術？
├── blog-katakori-stretch.html     # 記事: デスクワークの肩こりを和らげる、3分ストレッチ
├── blog-line-yoyaku.html          # 記事: LINEでのご予約をはじめました
├── 最新版HP/                       # 公開中サイトの凍結スナップショット（参照専用・直接編集禁止）
│   ├── index.html
│   ├── blog.html
│   ├── blog-3shunen.html
│   ├── blog-hikan.html
│   ├── blog-katakori-stretch.html
│   ├── blog-line-yoyaku.html
│   └── README.md
└── CLAUDE.md
```

- サイトは **HTML 6ページ完結**（トップ / ブログ一覧 / 記事4本）。CSS・JavaScript・QRコード画像（base64）はすべて各 HTML 内にインライン埋め込み。外部アセットファイルは持たない。
- ビルド工程・パッケージマネージャ・フレームワークは**使用しない**。素の HTML/CSS/JS を維持する。

## 4. デプロイ

- 公開ベースURL: `https://cocosia.relaxation-salon.workers.dev/`（canonical / OGP / 構造化データで使用）
- ホスティング: **Cloudflare Workers**
- 公開URL: https://cocosia.relaxation-salon.workers.dev/
- 開発ブランチ: `claude/salon-integration-setup-8azhxf`
- 変更後は必ずコミットし、指定ブランチへ push する。他ブランチへ push しない。

## 5. 集客導線の設定値

サイト内の導線URLは `index.html` の `SITE_CONFIG` に集約されている。**導線を変更する場合はまずここを見る。**

```js
const SITE_CONFIG = {
  RESERVE_URL:    "https://tol-app.jp/s/vci08tspdhggsu8a0ooe",
  LINE_URL:       "https://page.line.me/756assva?openQrModal=true",
  GOOGLE_REVIEWS: "https://www.google.com/maps?cid=11824116614626448226",
  GOOGLE_WRITE:   "https://search.google.com/local/writereview?placeid=&cid=11824116614626448226",
  TEL:            "080-5523-9301"
};
```

### 各チャネル

| チャネル | URL / 値 | 役割 |
| --- | --- | --- |
| 予約システム（TOL） | https://tol-app.jp/s/vci08tspdhggsu8a0ooe | **予約の主導線**（24時間・その場で確定） |
| LINE公式アカウント | https://page.line.me/756assva?openQrModal=true | お問い合わせ・ご相談窓口（予約も受付） |
| 電話 | 080-5523-9301 | 当日・急ぎの予約 |
| Instagram | https://www.instagram.com/cocosia.kitasenju | 認知・世界観訴求 |
| X (Twitter) | https://x.com/gmjfx3mpi3yfflg | 認知・空き枠告知 |
| Googleビジネスプロフィール | cid: 11824116614626448226 | MEO・クチコミ（★5.0 / 12件） |

### 予約システムの現状

予約システムは **TOL（https://tol-app.jp/s/vci08tspdhggsu8a0ooe）** を導入済み。**予約の主導線は TOL フォーム**とする。

- LINE は「お問い合わせ・ご相談」窓口として維持し、副次的に予約も受け付ける。
- 電話は当日・急ぎの予約用。

### ⚠ TOL は iframe 埋め込み不可

TOL は以下のヘッダーで外部サイトへの埋め込みを拒否している。

- `X-Frame-Options: SAMEORIGIN`
- `Content-Security-Policy: frame-ancestors 'self'`

そのため **`<iframe>` で HP 内に埋め込むことはできない**（空白または接続拒否の表示になる）。
予約導線は必ず `<a href target="_blank" rel="noopener">` のリンクボタンで実装すること。

## 6. 店舗情報（サイト内の表記の正）

| 項目 | 内容 |
| --- | --- |
| 店名 | CoCosia（ココシア） |
| 業態 | リラクゼーションサロン |
| 住所 | 東京都足立区千住旭町11-12 GROWTH坂本 201 |
| アクセス | JR北千住駅 東口 徒歩3分 |
| 営業時間 | 12:00〜24:00 |
| 定休日 | 不定休 |
| 電話 | 080-5523-9301 |
| 決済 | 現金 / Visa / Mastercard / JCB / American Express / PayPay |
| キャンセル | 前日までの連絡が必要 |

これらは複数箇所（本文・構造化データ・meta description 等）に登場する。**変更時は全ファイル横断で grep し、漏れなく直すこと。**

## 7. 修正時のチェックリスト（Opus の監査項目）

- [ ] `index.html` と `blog.html` のナビゲーションリンクが一致しているか
- [ ] 記事ページ（`blog-*.html`）のナビゲーション・パンくず・関連記事リンクが切れていないか
- [ ] `SITE_CONFIG` の各URLが実際に到達可能か
- [ ] 店舗情報（住所・電話・営業時間・料金）が全ファイルで一致しているか
- [ ] 予約ボタン（TOL）が全セクション・全ページから到達可能か（導線の切断がないか）
- [ ] 予約導線に `<iframe>` を使っていないか（TOL は埋め込み不可）
- [ ] `<title>` / `meta description` / OGP / canonical がページ内容と整合しているか
- [ ] JSON-LD が有効なJSONで、店舗情報（住所・電話・営業時間・料金）と一致しているか
- [ ] 新規ページ追加時に OGP・canonical・JSON-LD・モバイル固定バーを入れ忘れていないか
- [ ] スマホ幅（375px）でレイアウトが崩れていないか
- [ ] `最新版HP/` を誤って編集していないか
- [ ] 指示範囲外の変更が混入していないか

## 8. コーディング方針

- 既存のコードスタイル（インデント2スペース、日本語コメント、CSS カスタムプロパティによるカラー管理）に合わせる。
- カラーは `:root` の CSS 変数（`--cream`, `--clay`, `--earth`, `--sage`, `--line-green` 等）を使う。新しい色を直接ハードコードしない。
- フォントは Cormorant Garamond（欧文見出し）/ Noto Serif JP（和文見出し）/ Noto Sans JP（本文）。
- 外部ライブラリを追加しない。
- 大規模な書き換えより、セクション単位の最小限の修正を優先する。
- OGP の `og:image` は未設定（リポジトリに画像ファイルが無いため）。画像を用意する場合は 1200×630px を配置し、全ページの `og:image` に絶対URLで指定する。
- 構造化データに `aggregateRating` は入れない（自社サイトでの自己申告レビューは Google のポリシー違反となるため）。クチコミ評価は Google ビジネスプロフィール側に集約する。
