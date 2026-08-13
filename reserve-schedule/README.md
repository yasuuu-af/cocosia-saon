# CoCosia 予約システム — 仕様書 / 引き継ぎメモ

このファイルは、このセッションの実行環境が破棄された後も内容が残る**唯一の記録場所**です。
次にこのリポジトリを触る人（人間でもAIでも）は、会話の文脈がゼロの状態からここを読んで作業を再開できるようにしてあります。

最終更新: 2026-08-13（フェーズ①実装セッション）

---

## (A) このシステムの目的と現在のフェーズ

北千住のリラクゼーションサロン **CoCosia（ここしあ）** 向けに自作している予約システムです。
TOL（https://tol-app.jp/s/vci08tspdhggsu8a0ooe）のようなステップ式の予約導線を、外部SaaSに頼らず内製することが目的です。

段階リリースの計画:

| フェーズ | 内容 | 状態 |
| --- | --- | --- |
| **①画面の完成** | お客様用の5ステップ予約フロー・管理画面をHTML/CSS/JSのみで完成させる。データ保存は localStorage。 | **今回のセッションで実装** |
| **②サーバー化** | Cloudflare Workers + D1 に置き換える。`shared.js` の `Ledger.api` の中身を fetch に差し替えるだけで済むように、フェーズ①で設計してある。 | 未着手 |
| **③通知・外部連携** | オーナーへのメール/LINE通知、お客様への予約確認メール、Googleカレンダー連携（双方向）。 | 未着手 |

フェーズ①の完了範囲は、このファイルと同じコミットの差分（`reserve-schedule/index.html` / `admin.html` / `shared.js`）を参照してください。未実装・仮データの箇所は下記 (D) にまとめています。

### 追加指示（2026-08-13・同日中の追加ヒアリング分）への対応状況

セッション途中でオーナーから4件の追加指示が入り、いずれもこの回のコミットに反映済み。

1. **カッピング専用の内包オプション7件（追加料金・追加時間なし）→ 実装済み。** `shared.js` の `CUPPING_OPTIONS`。カッピングメニュー選択時のみ画面に表示し、合計時間・合計金額の計算対象外にしてある。汎用の有料オプション（仮データ）はそのまま残置。
2. **通知先メールアドレス等の管理画面「設定」タブ → 実装済み。** `admin.html` の「設定」タブから通知先メール（複数行）・営業時間・受付締切（時間単位）・予約可能日数（日単位）を変更・保存できる。あわせて、予約可能範囲の設定粒度を「ヶ月」から「日数」に変更した（`BOOKING_CONFIG.MAX_ADVANCE_DAYS`、旧`MAX_ADVANCE_MONTHS`から置き換え）。
   お客様側の連絡先修正（`index.html` の「予約の確認・変更」パネル）も実装済み。電話番号＋（予約番号 or メールアドレス）で本人確認のうえ、電話番号・メールアドレスを修正できる（後述の監査対応でさらに拡張）。
3. **Googleカレンダー逆方向同期に耐えるデータ設計 → 実装済み。** `blocked_slots` に `source`（`'manual'|'google-calendar'`）フィールドを追加。空き判定の純粋関数はsourceを見ずに一律判定。管理画面は`google-calendar`由来のブロックの削除ボタンを無効化（APIレベルでも削除を拒否するガードあり）。フェーズ③の同期方針は本ファイル(E)に記載。
4. **本README(仕様書)の作成 → この一式が該当。** 最優先で作成・push済み。

なお、上記2の実装過程で「他のタブ・端末で入った新しい予約が管理画面に自動反映されない」という設計上の制約に気づいたため、`admin.html` に手動更新ボタン（⟳ 最新の状態に更新）を追加した。自動同期（ポーリング等）はフェーズ②以降の課題として残っている。

### 監査（Opus）指摘への対応（2026-08-13・同日中の監査ラウンド）

375px実描画はChromiumで監査側が確認済み（問題なし、追加対応不要）。以下3点はコード上の修正が必要と判定され、対応済み。

1. **お客様が自分でキャンセルできない機能欠落 → 実装済み。** 「予約の確認・変更」パネルにキャンセルボタンを追加。予約日が本日より後であれば有効化し、確認ダイアログの上で `Ledger.api.cancelReservation()` を呼ぶ。予約日が本日の場合はボタンをdisabledにし、「当日のキャンセルは施術料金の100%を申し受けます。お手数ですがお電話（`tel:`リンク、`BOOKING_CONFIG.TEL`使用）にてご連絡ください」を表示。判定は予約日（日付のみ、時刻は見ない）で行っている。過去の予約は次項3の変更により照会結果自体に含まれなくなったため、キャンセルボタン自体が表示されない。
2. **「あかすり12時〜20時限定」の解釈を終了ベースに修正 → 対応済み。** 独断で開始ベースに変更していたのを差し戻した。詳細は上記(D)-4を参照。フィールド名も `startWindow` から `serviceWindow` に変更し（`combineStartWindows`→`combineServiceWindows`）、「意味は開始時刻の制約ではなく施術時間帯全体の制約である」ことがコード上で誤解されないようにした。
3. **予約番号必須だと再アクセス不能な問題 → 実装済み。** 「電話番号＋メールアドレス」の組み合わせでも照会できるようにした（予約番号での照会も従来どおり利用可）。該当する予約が複数ある場合は一覧表示し、それぞれに連絡先変更・キャンセル操作ができる。過去の予約（施術日が本日より前）は照会結果から除外している。

---

## (B) 確定した仕様（オーナーへのヒアリング結果）

- 営業時間: **12:00〜24:00**、予約枠の刻みは **30分**
- **同時に受けられる予約は1件のみ**（施術者・ベッドとも1つ。並行予約なし）
- 受付締切: **現在時刻の2時間後まで**の枠は予約不可（2時間より先の枠のみ予約可）
- 予約可能範囲: **本日から2ヶ月先まで**
- 定休日は**不定休**。特定曜日を一律休みにはしない。休業日・休憩時間は管理画面から個別登録する
- キャンセル規約: **前日まで無料 / 当日キャンセル・無断キャンセルは施術料金の100%**
- 決済: **事前決済なし**。当日、店頭でお支払い。**現金を推奨**（決済手数料がかかるため）。PayPay・クレジットカード（Visa/Mastercard/JCB/American Express）・交通系ICも利用可能だが、案内文では現金を先に・強めに、他は「ご利用いただけます」程度のトーンに留める
- お客様とLINEの紐付け: **予約完了画面で「友だち追加」を促すだけ**。LINEログインやLIFFは採用しない（実装コストと個人情報の扱いの観点から）
- 通知（フェーズ③で実装予定、4種類すべて）:
  1. オーナーへメール通知（予約が入るたびに）
  2. オーナーのLINEへ通知
  3. お客様へ予約確認メール
  4. 予約内容をGoogleカレンダーへ自動登録
- Googleカレンダー連携は **双方向**:
  - 予約システム → カレンダーへの書き込み（新規予約が入ったら自動でカレンダーに登録）
  - カレンダー → 予約システムへの反映（**オーナーが自分のカレンダーに予定を入れたら、予約システムの空き枠が自動でブロックされる**）※これがオーナーの一番の要望
- メニューの時間帯制約:「全身すっきり！あかすり＋全身保湿ケア」は **12時〜20時限定**。
  → **現在の実装は「20時までに施術が終了する開始時刻のみ選択可」という解釈（終了ベース）**で実装しています。`shared.js` の `akasuri120.serviceWindow = {min:12*60, max:20*60}` は「施術の開始〜終了がこの範囲に収まること」を意味し、120分メニューのため実質 **12:00〜18:00開始のみ選択可**（20:00終了）です。店頭表記「12時〜20時限定」を施術時間としてはみ出さない、保守的な側の解釈です。オーナー確認待ち。代替解釈（開始時刻さえ12:00〜20:00に収まればよく、終了が22:00になってもよい）は下記(D)-4を参照。

### カッピングメニュー専用の内包オプション（2026-08-13 追加確定分）

「【本格火罐カッピング】＋選べるオプション（60分・¥7,900）」を選択したときだけ表示される、**追加料金・追加時間なし**の内包オプション。60分の枠内でどう組み合わせるかをオーナーが把握するための選択項目であり、合計時間・合計金額の計算には一切影響しません。

- 毛穴洗浄 美白
- リンパドレナージュ
- お悩み箇所のストレッチ
- もみほぐし
- フェイシャルエステ
- ダイエット箇所
- 足踏み

`shared.js` の `CUPPING_OPTIONS` に定義。複数選択可。予約データには `cuppingOptionIds` として保存し、確認画面・完了画面・管理画面の予約一覧すべてに表示している。

一方、`OPTION_ITEMS`（ヘッドマッサージ +¥2,000 など）は**汎用の有料オプションの仮データ**として別に残してあり、混同しないこと。

---

## (C) インフラ方針とコスト

フェーズ②で Cloudflare Workers + D1 を採用する前提の試算（オーナー承認済み）:

- Cloudflare Workers 無料枠: **10万リクエスト/日**、CPU時間 **10ms/実行**
- D1 無料枠: ストレージ **5GB**、読み取り **500万行/日**、書き込み **10万行/日**
- CoCosiaの規模（1日最大8件程度の予約）では、**いずれの無料枠も使用率1%未満**で収まる見込み
- 外部API（メール送信・LINE Messaging API・Google Calendar APIなど）への応答待ち時間はCPU時間にカウントされないため、10ms制限は実務上問題にならない

**オーナーの決定: 「一旦、無料でできる範囲で作る」。独自ドメインの取得は保留。**

---

## (D) 保留中・未確定の事項 ★次回セッションはここを最初に読むこと

1. **独自ドメイン（例: cocosia.jp）の取得可否 → 保留中。オーナーが後で判断。**
   - 現状の公開URLは `https://cocosia.relaxation-salon.workers.dev/`（Cloudflareのサブドメイン）。
   - サブドメインのため **DNSレコード（SPF/DKIM）を追加できず**、お客様宛の予約確認メールを独自ドメイン差出人で送信できない。
   - 無料での回避策候補: メール配信サービスの「単一送信者認証」（DNS設定不要、メールアドレス単位の確認のみで送信元として使える機能）を使う。ただし **なりすまし判定でスパムフォルダに振り分けられるリスクがある** ため、フェーズ③着手時に実際の到達性（Gmail/Yahoo!メール等での受信テスト）を検証すること。
   - 独自ドメインを取得すればこの問題は解消し、SEO・信頼感の面でも有利。費用目安は年1,500円程度。

2. **LINE公式アカウント（ID: 756assva）のLINE Developers設定 → 未着手。オーナーが後で対応。**
   - オーナーへのLINE通知には Messaging API のチャネル作成とアクセストークン発行が必要（LINE Developersコンソールでの作業）。
   - **LINE公式アカウントのフリープランはメッセージ配信が月200通まで無料**。オーナー通知のみの用途なら月200件の予約まで無料でカバーできる。超過時はライトプラン（月5,000円、月5,000通）への切り替えが必要。
   - **旧 LINE Notify は2025年3月末でサービス終了しており使用不可**。Messaging API での実装が必須。

3. **汎用の有料オプションメニュー（ヘッドマッサージ +¥2,000 など）→ 仮データのまま。**
   - 正式な名前・追加時間・追加料金がオーナーから未提供。
   - そもそも「カッピング専用の7オプション」以外に汎用オプションを実際に提供するのかどうかも未確認。
   - `shared.js` の `OPTION_ITEMS` に `/* ⚠ 仮データ：オーナー確認後に差し替えること */` と明記してある。画面にも「※オプション内容・料金は仮設定です」と注記している。

4. **「あかすり 12時〜20時限定」の解釈確認待ち。**
   - **現在の実装（採用中）**: 「**20時までに施術が終了する開始時刻のみ選択可**」＝終了ベース。120分メニューなので実質 **12:00〜18:00開始のみ**選択可（20:00終了）。店頭表記からはみ出さない、保守的な側の解釈のため、オーナー未確認の段階ではこちらを採用している。
     コード上は `shared.js` の `MENU_ITEMS` 内 `akasuri120` の `serviceWindow = {min:12*60, max:20*60}` として実装。`computeAvailableStartTimes` 内で「開始時刻 >= serviceWindow.min かつ 開始時刻+合計時間 <= serviceWindow.max」を判定している（`combineServiceWindows` で複数メニュー選択時の積集合も同じ意味論に統一）。
   - **代替解釈（不採用・オーナー確認で必要になった場合のみ変更）**: 「開始時刻さえ12:00〜20:00の範囲内であればよい」＝開始ベース。この場合、20:00開始を選ぶと施術終了は22:00になる。この解釈にする場合、`serviceWindow.max` の値はそのまま `20*60` でよいが、`computeAvailableStartTimes` の判定式を「開始時刻 <= serviceWindow.max」（終了時刻を見ない）に戻す必要がある。
   - 該当コード: `reserve-schedule/shared.js` の `MENU_ITEMS` 配列 `id: "akasuri120"` の `serviceWindow` フィールド、および `computeAvailableStartTimes` 関数内の判定部分。

5. **Googleカレンダー連携の認証方式（サービスアカウント or OAuth）→ フェーズ③で決定。**
   - サービスアカウント: サーバー間連携がシンプルだが、オーナー個人のGoogleカレンダーとの共有設定が別途必要。
   - OAuth: オーナー本人のログインで認可するため直感的だが、リフレッシュトークンの保管・失効対応が必要。
   - どちらもD1に認証情報を安全に保管する設計が必要（Cloudflare Workers の Secrets 機能の利用を推奨）。

6. **通知先メールアドレスの管理 → フェーズ①で画面のみ実装済み（実際の送信はフェーズ③）。**
   - `admin.html` の「設定」セクションから複数のメールアドレスを登録できる。フェーズ③でここに登録されたアドレス宛にメール送信する実装を行う。

---

## (E) コード構造の説明

### `shared.js`

- **`BOOKING_CONFIG`**: 予約ルール（営業時間・刻み・締切・予約可能日数）と、LINE URL・電話番号・店舗情報などの定数をまとめた設定オブジェクト。**初期値**として扱う。管理画面の「設定」セクションから変更した値は localStorage 内の `settings` レコード（`Ledger.api.getSettings()` / `updateSettings()`）に保存され、そちらが優先される。フェーズ②では `settings` テーブルに移行する想定。
- **`MENU_ITEMS`**: 本体メニュー8件（ルート `index.html` の「メニュー・料金」セクションが正データ）。
- **`OPTION_ITEMS`**: 汎用の有料オプション（仮データ、上記(D)-3参照）。
- **`CUPPING_OPTIONS`**: カッピングメニュー専用の内包オプション7件（追加料金・追加時間なし、上記(B)参照）。
- **純粋関数群**（`computeTotalMinutes` / `computeTotalPrice` / `combineServiceWindows` / `computeAvailableStartTimes` など）: `Ledger.api` の外に置いてあり、`Ledger.api` にも呼び出し側（画面側）にも依存しない。**フェーズ②でサーバーサイド（Workers）に移植してそのまま再利用できる**ように設計している。空き判定は「予約」「手動ブロック」「カレンダー由来ブロック」を区別せず、すべて `blockedSlots` / `reservations` の時間帯重なり判定として一律に扱う。
- **`Ledger.api`**: データアクセス層。すべて `async` 関数（Promiseを返す）。現在の中身は localStorage の読み書きだが、シグネチャは最終形（fetch版）と同じになるように設計してある。
  - `getReservations({from, to})`
  - `createReservation(payload)` — 作成前に重複チェック（予約同士・予約とブロックの重なり）を行う
  - `cancelReservation(id)`
  - `updateReservationContact(id, {tel, email})` — お客様が予約後に連絡先を修正するためのAPI
  - `getBlockedSlots({from, to})` — 返り値の各要素に `source`（`"manual"` | `"google-calendar"`）を含む
  - `createBlockedSlot(payload)` / `deleteBlockedSlot(id)`
  - `getAvailability({dateISO, totalMinutes, menuConstraints})`
  - `getSettings()` / `updateSettings(payload)` — 通知先メール・営業時間・締切・予約可能日数

  > **⚠ フェーズ②の作業はここだけで完結する**: `Ledger.api` オブジェクトの中身（各関数の実装）を Cloudflare Workers への `fetch()` 呼び出しに差し替えるだけでよい。呼び出し側（`index.html` / `admin.html`）は関数シグネチャを変えず `await` で呼んでいるため、画面側のコード変更は不要な設計にしてある。

### ブロックスロットの `source` フィールドとGoogleカレンダー逆方向同期への布石

- `blockedSlots` の各レコードは `{ id, dateISO, allDay, startMin, endMin, reason, source }` の形。
- `source` は `"manual"`（管理画面から手動登録）または `"google-calendar"`（カレンダー由来、フェーズ③で自動投入）を想定。
- 管理画面のブロック一覧は `source` を表示し、**`google-calendar` 由来のものは削除ボタンを無効化**してある（次回の同期で復活してしまうため。手動で消したい場合はGoogleカレンダー側の予定を削除する運用を想定）。
- 空き判定の純粋関数（`computeAvailableStartTimes`）は `source` を見ずに、`blockedSlots` 配列に入っているかどうかだけで埋まっている判定をする。つまり **手動ブロックとカレンダー由来ブロックは判定ロジック上まったく区別されない**。フェーズ③でカレンダー由来のブロックを追加する処理を足すだけで、既存の空き判定・予約フローには一切手を入れずに逆方向同期が動く設計になっている。

### フェーズ③の実装方針（Googleカレンダー逆方向同期）

以下はコメントとして残す実装方針で、まだコードには実装していない。

```
方針: Cloudflare Workers の Cron Trigger（例: 5分おき）で以下を実行する。

1. Cron Trigger が発火
2. Google Calendar API（events.list）でオーナーのカレンダーから
   直近〜2ヶ月先までの予定を取得（syncToken を使った差分取得が望ましい）
3. 取得した各予定について、blocked_slots テーブルに
   source = 'google-calendar', google_event_id = <カレンダー側のイベントID>
   として upsert する（google_event_id をユニークキーにして重複防止）
4. カレンダー側で削除された予定は、前回取得時に存在して今回存在しない
   google_event_id を突き止めて blocked_slots からも削除する
5. 認証情報（サービスアカウント鍵 or OAuthリフレッシュトークン）は
   Cloudflare Workers の Secrets に保管し、コードにハードコードしない
```

---

## (F) 編集してはいけない場所

- ルート直下の `index.html` / `blog.html` / `blog-*.html`
- `最新版HP/` 配下（公開中サイトの凍結スナップショット・参照専用）

これらは本予約システム（`reserve-schedule/` 配下）の対象外。値をコピーして使うのは良いが、直接編集しないこと。

---

## D1 テーブル設計案（フェーズ②着手時の参考）

```sql
-- 予約
CREATE TABLE reservations (
  id              TEXT PRIMARY KEY,
  date_iso        TEXT NOT NULL,       -- 'YYYY-MM-DD'
  start_min       INTEGER NOT NULL,    -- 当日 0:00 からの分数
  end_min         INTEGER NOT NULL,
  total_minutes   INTEGER NOT NULL,
  total_price     INTEGER NOT NULL,
  menu_ids        TEXT NOT NULL,       -- JSON配列文字列 例: '["aroma90"]'
  option_ids      TEXT NOT NULL,       -- JSON配列文字列（汎用有料オプション）
  cupping_option_ids TEXT NOT NULL,    -- JSON配列文字列（カッピング内包オプション）
  customer_name   TEXT NOT NULL,
  customer_kana   TEXT NOT NULL,
  customer_tel    TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  customer_note   TEXT,
  status          TEXT NOT NULL DEFAULT 'confirmed', -- 'confirmed' | 'cancelled'
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_reservations_date ON reservations(date_iso);

-- 休業日・ブロック時間
CREATE TABLE blocked_slots (
  id              TEXT PRIMARY KEY,
  date_iso        TEXT NOT NULL,
  all_day         INTEGER NOT NULL,    -- 0/1
  start_min       INTEGER,
  end_min         INTEGER,
  reason          TEXT,
  source          TEXT NOT NULL,       -- 'manual' | 'google-calendar'
  google_event_id TEXT,                -- source='google-calendar' のときのみ。upsertの一意キー
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_blocked_slots_date ON blocked_slots(date_iso);
CREATE UNIQUE INDEX idx_blocked_slots_google_event ON blocked_slots(google_event_id) WHERE google_event_id IS NOT NULL;

-- 設定（通知先メール・営業時間・締切・予約可能日数など）
CREATE TABLE settings (
  key             TEXT PRIMARY KEY,    -- 例: 'notification_emails', 'business_start' など
  value           TEXT NOT NULL        -- JSON文字列
);
```

---

## 動作確認の状況について

このREADMEおよび関連コードは、**Node/ブラウザでの実機レンダリング確認をしていない箇所を含みます**。各コミットのコミットメッセージ、および実装完了報告に「確認できていない」と明記した項目は、次回セッションで必ず実際にブラウザ幅375pxでの表示確認・localStorageでの一連の予約フロー動作確認を行ってください。
