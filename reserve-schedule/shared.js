/* ============================================================
   CoCosia 予約システム - 共通ロジック（予約ページ / 管理者ページで共有）
   ------------------------------------------------------------
   フェーズ①: 画面の完成（本ファイル内は localStorage で完結）
   フェーズ②: Ledger.api の中身を Cloudflare Workers への fetch に
              差し替える予定。呼び出し側（index.html / admin.html）は
              async / await で呼んでいるため、差し替えの影響を受けない。
   ============================================================ */
window.Ledger = (function(){
  "use strict";

  /* ============================================================
     BOOKING_CONFIG … 予約ルール・導線URL・店舗情報をここに集約
     ルート index.html の SITE_CONFIG と矛盾しないようにすること。
     ============================================================ */
  var BOOKING_CONFIG = {
    BUSINESS_START: 12 * 60,   // 営業開始 12:00（分単位）
    BUSINESS_END:   24 * 60,   // 営業終了 24:00（分単位）
    STEP: 30,                  // 予約枠の刻み（分）
    CUTOFF_MIN: 2 * 60,        // 受付締切：現在時刻の2時間後以降のみ予約可
    MAX_ADVANCE_DAYS: 60,      // 予約可能範囲：本日から60日先まで（≒2ヶ月。管理画面「設定」から日数で変更可能）

    LINE_URL: "https://page.line.me/756assva?openQrModal=true",
    TEL: "080-5523-9301",
    RESERVE_URL: "https://tol-app.jp/s/vci08tspdhggsu8a0ooe", // 参考: ルートSITE_CONFIGと同一（本システムはこれの内製版）

    SHOP_NAME: "CoCosia（ココシア）",
    SHOP_NAME_KANA: "ここしあ",
    ADDRESS: "東京都足立区千住旭町11-12 GROWTH坂本 201",
    ACCESS: "JR北千住駅 東口 徒歩3分",
    OPEN_HOURS_LABEL: "12:00〜24:00",
    HOLIDAY_LABEL: "不定休（休業日は個別に設定）",
    PAYMENT_METHODS_LABEL: "現金 / PayPay / Visa / Mastercard / JCB / American Express / 交通系IC",

    /* 予約が入った際の通知先メールアドレスの初期値（空でよい）。
       管理画面「設定」で変更した値は settings ストレージに保存され、そちらが優先される。
       フェーズ③で実際のメール送信処理を実装する。 */
    NOTIFICATION_EMAILS: []
  };

  /* ⚠ 未確定：サロンオーナーへの確認待ち（reserve-schedule/確認リスト.md の
     「1. あかすり『12時〜20時限定』の解釈」を参照）。
     メニューに設定する `serviceWindow`（例: あかすり120分メニューの
     {min:12*60, max:20*60}）の意味を、この値だけで切り替えられるようにしてある。
       "end"   … 20:00までに施術が終了する開始時刻のみ許可（12:00〜18:00開始）
                 ※現在の採用値（未確認の間は保守的な側をデフォルトにする）
       "start" … 20:00までに開始すればよい（12:00〜20:00開始、終了が20:00を
                 超えてよい。ただし営業終了24:00は超えられない）
     オーナーから回答が得られたら、この値を変更するだけで両ページとも
     切り替わる（他のコード変更は不要）。 */
  var TIME_WINDOW_MODE = "end";

  /* ルート index.html の LINE 友だち追加QRコード（base64）をそのまま流用 */
  var LINE_QR_SRC = "data:image/png;base64,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";

  /* ============================================================
     メニューデータ（ルート index.html「メニュー・料金」セクションが正）
     ============================================================ */
  var MENU_ITEMS = [
    {
      id: "aroma90",
      badge: "全員対象",
      title: "【アロマ】全身癒し♪お悩み別オーダーメイド",
      desc: "ボディトリートメント＋ボディケア＋ヘッド。お悩みに合わせてカスタマイズ。",
      durationMin: 90,
      price: 9900
    },
    {
      id: "aroma120",
      badge: "全員対象",
      title: "【アロマ】全身癒し♪お悩み別オーダーメイド",
      desc: "ボディトリートメント＋ボディケア＋ヘッド。じっくりたっぷりコース。",
      durationMin: 120,
      price: 12500
    },
    {
      id: "akasuri120",
      badge: "全員対象",
      title: "全身すっきり！あかすり＋全身保湿ケア",
      desc: "12時〜20時限定。背中や皮膚のザラつきをしっかりケア。保湿まで丁寧に。",
      durationMin: 120,
      price: 13900,
      /* ⚠ この範囲(min〜max)の解釈は未確定で、TIME_WINDOW_MODE に依存する
         （オーナー確認待ち。詳細は reserve-schedule/確認リスト.md の
         「1. あかすり『12時〜20時限定』の解釈」を参照）。
         TIME_WINDOW_MODE="end"   → 開始+合計時間がmax以内（終了ベース）
         TIME_WINDOW_MODE="start" → 開始がmin〜maxの範囲内（開始ベース）
         値自体（12:00〜20:00）はどちらのモードでも変更不要。 */
      serviceWindow: { min: 12 * 60, max: 20 * 60 }
    },
    {
      id: "exosome60",
      badge: "全員対象",
      title: "【毛穴洗浄×美白】エクソソーム導入",
      desc: "鼻の黒ずみ解消。ヒト幹細胞エクソソーム美容液で毛穴ケアと美白を同時に。",
      durationMin: 60,
      price: 9800
    },
    {
      id: "hair60",
      badge: "全員対象",
      title: "【本格育毛促進】髪の密度UP・毛根活性",
      desc: "エクソソーム配合美容液＋熟練のハンド技術で頭皮環境を整え美髪へ。",
      durationMin: 60,
      price: 9800
    },
    {
      id: "machine120",
      badge: "全員対象",
      title: "【痩身・フェイシャル】全身マシンコース",
      desc: "全身のボディラインと美顔を同時にアプローチ。",
      durationMin: 120,
      price: 15800,
      originalPrice: 20000
    },
    {
      id: "stretch90",
      badge: "スタンダード",
      title: "【ストレッチ＋もみほぐし】全身すっきりコース",
      desc: "リンパの流れを意識した独自の手技と丁寧なストレッチで、むくみ・疲れ・こわばりをまとめてケア。体が硬い方や、マッサージが初めての方にも安心してお受けいただけます。",
      durationMin: 90,
      price: 9000
    },
    {
      id: "cupping60",
      badge: "全員対象",
      title: "【本格火罐カッピング】＋選べるオプション",
      desc: "火を使って陰圧をつくる本格火罐（ひかん）で、深部の血流とリンパの滞りを一気に解放。その後は揉みほぐし・オイルトリートメント・毛穴フェイシャルの中からお好みで組み合わせ可能。肩こり・腰痛・疲労回復に。",
      durationMin: 60,
      price: 7900
    }
  ];

  /* ⚠ 仮データ：オーナー確認後に差し替えること。
     汎用の有料オプション。正式な名前・時間・料金が未提供のため仮設定のまま残してある。
     カッピング専用の内包オプション（CUPPING_OPTIONS、下記）とは別物なので混同しないこと。 */
  var OPTION_ITEMS = [
    { id: "opt-head",    title: "ヘッドマッサージ",       durationMin: 30, price: 2000 },
    { id: "opt-foot",    title: "足裏リフレクソロジー",     durationMin: 30, price: 2500 },
    { id: "opt-cupping", title: "火罐カッピング",          durationMin: 30, price: 3000 },
    { id: "opt-face",    title: "小顔フェイシャル",         durationMin: 30, price: 3000 },
    { id: "opt-extend",  title: "延長30分",               durationMin: 30, price: 3000 }
  ];

  /* 【本格火罐カッピング】メニューのID。この本体メニューが選択されているときだけ
     下記 CUPPING_OPTIONS を画面に表示する。 */
  var CUPPING_MENU_ID = "cupping60";

  /* カッピングメニュー専用・内包オプション（正式データ / オーナー確定分 2026-08-13）。
     追加料金・追加時間なし。60分の枠内でどう組み合わせるかをオーナーが把握するための
     選択項目であり、合計時間・合計金額の計算には一切影響しない
     （durationMin・price を持たせず、computeTotalMinutes / computeTotalPrice の対象外にしている）。
     複数選択可。予約データには cuppingOptionIds として保存する。 */
  var CUPPING_OPTIONS = [
    { id: "cup-pore",     title: "毛穴洗浄 美白" },
    { id: "cup-lymph",    title: "リンパドレナージュ" },
    { id: "cup-stretch",  title: "お悩み箇所のストレッチ" },
    { id: "cup-loosen",   title: "もみほぐし" },
    { id: "cup-facial",   title: "フェイシャルエステ" },
    { id: "cup-diet",     title: "ダイエット箇所" },
    { id: "cup-footwork", title: "足踏み" }
  ];

  /* ---------- Persistence（localStorage） ---------- */
  var STORAGE_RESERVATIONS = "cocosiaBooking.reservations";
  var STORAGE_BLOCKED_SLOTS = "cocosiaBooking.blockedSlots";
  var STORAGE_SETTINGS = "cocosiaBooking.settings";

  /* ⚠ バグ報告.md【重大】「localStorageのJSONが壊れると全予約が黙って消える」への対応。
     パース失敗を「データが空」と区別するため、読み込み関数は { list, corrupted } を返す
     内部形式に統一した（この2関数は外部にエクスポートしていないため、呼び出し側の変更は
     shared.js 内の api.* だけで完結する）。
     破損を検知した場合:
       1) 壊れた生データを退避キー（<key>.corrupt.<timestamp>）にコピーして保持する
       2) <key>.corruptFlag を立てる（このフラグが立っている間、該当ストアへの保存は拒否する）
       3) console.error で記録する
     フラグは、次回読み込み時に元のキーの中身が正常なJSONとしてパースできれば自動的に解除される
     （手動で localStorage を修復した場合の復帰用）。それ以外に解除する手段として
     api.acknowledgeStorageCorruption() を用意している（管理画面から呼び出す想定）。 */
  function corruptFlagKey(key){ return key + ".corruptFlag"; }
  function isCorruptFlagged(key){
    try{ return localStorage.getItem(corruptFlagKey(key)) === "1"; }catch(e){ return false; }
  }
  function setCorruptFlag(key){
    try{ localStorage.setItem(corruptFlagKey(key), "1"); }catch(e){ /* 何もできない */ }
  }
  function clearCorruptFlag(key){
    try{ localStorage.removeItem(corruptFlagKey(key)); }catch(e){ /* 何もできない */ }
  }
  function quarantineCorruptData(key, raw){
    try{
      var qKey = key + ".corrupt." + Date.now();
      localStorage.setItem(qKey, raw);
      console.error("[CoCosia予約] " + key + " のデータが破損していたため退避しました: " + qKey);
    }catch(e){
      console.error("[CoCosia予約] " + key + " の破損データの退避に失敗しました。", e);
    }
  }
  /* raw な localStorage 値を安全に読み込む共通ヘルパー。
     戻り値: { list: 読み込めた値（破損・未保存時は defaultValue）, corrupted: boolean } */
  function loadJSON(key, defaultValue){
    var raw;
    try{ raw = localStorage.getItem(key); }catch(e){ return { list: defaultValue, corrupted:false }; }
    if (raw === null){
      // キー自体が存在しない＝正真正銘の「空」。過去に破損フラグが残っていれば解除する。
      clearCorruptFlag(key);
      return { list: defaultValue, corrupted:false };
    }
    try{
      var parsed = JSON.parse(raw);
      // 正常にパースできた＝手動修復などで復旧した可能性があるのでフラグを解除する
      clearCorruptFlag(key);
      return { list: parsed, corrupted:false };
    }catch(e){
      if (!isCorruptFlagged(key)){
        quarantineCorruptData(key, raw);
        setCorruptFlag(key);
      }
      return { list: defaultValue, corrupted:true };
    }
  }

  function loadSettings(){
    return loadJSON(STORAGE_SETTINGS, {});
  }
  function saveSettings(settings){
    if (isCorruptFlagged(STORAGE_SETTINGS)) return false;
    try{
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
      return true;
    }catch(e){ return false; }
  }
  /* 管理画面「設定」で変更された値を BOOKING_CONFIG の初期値にマージして返す。
     予約ルール系のロジックは必ずこの関数経由で得た値を使うこと（BOOKING_CONFIG を直接参照しない）。 */
  function getEffectiveConfig(){
    var loaded = loadSettings();
    var saved = loaded.corrupted ? {} : (loaded.list || {});
    return {
      BUSINESS_START: (typeof saved.businessStart === "number") ? saved.businessStart : BOOKING_CONFIG.BUSINESS_START,
      BUSINESS_END:   (typeof saved.businessEnd === "number") ? saved.businessEnd : BOOKING_CONFIG.BUSINESS_END,
      STEP: BOOKING_CONFIG.STEP,
      CUTOFF_MIN: (typeof saved.cutoffMin === "number") ? saved.cutoffMin : BOOKING_CONFIG.CUTOFF_MIN,
      MAX_ADVANCE_DAYS: (typeof saved.maxAdvanceDays === "number") ? saved.maxAdvanceDays : BOOKING_CONFIG.MAX_ADVANCE_DAYS,
      NOTIFICATION_EMAILS: Array.isArray(saved.notificationEmails) ? saved.notificationEmails : BOOKING_CONFIG.NOTIFICATION_EMAILS,
      /* TIME_WINDOW_MODE は管理画面「設定」からは変更不可（未確定事項の解釈フラグのため）。
         オーナー回答が確定したら shared.js 冒頭の TIME_WINDOW_MODE を直接書き換える。 */
      TIME_WINDOW_MODE: TIME_WINDOW_MODE
    };
  }

  function loadReservations(){
    return loadJSON(STORAGE_RESERVATIONS, []);
  }
  function saveReservations(reservations){
    if (isCorruptFlagged(STORAGE_RESERVATIONS)) return false;
    try{
      localStorage.setItem(STORAGE_RESERVATIONS, JSON.stringify(reservations));
      return true;
    }catch(e){ return false; }
  }
  function loadBlockedSlots(){
    return loadJSON(STORAGE_BLOCKED_SLOTS, []);
  }
  function saveBlockedSlots(blockedSlots){
    if (isCorruptFlagged(STORAGE_BLOCKED_SLOTS)) return false;
    try{
      localStorage.setItem(STORAGE_BLOCKED_SLOTS, JSON.stringify(blockedSlots));
      return true;
    }catch(e){ return false; }
  }
  function isStorageAvailable(){
    try{
      var testKey = "cocosiaBooking.__test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    }catch(e){ return false; }
  }
  /* 破損検知の状態を画面側が確認するための読み取り専用API */
  function getStorageHealth(){
    return {
      reservationsCorrupted: isCorruptFlagged(STORAGE_RESERVATIONS),
      blockedSlotsCorrupted: isCorruptFlagged(STORAGE_BLOCKED_SLOTS),
      settingsCorrupted: isCorruptFlagged(STORAGE_SETTINGS)
    };
  }
  /* 破損状態を手動で解消する（管理画面からの操作を想定）。
     壊れたキー自体を削除して「空」の状態から再開する。退避コピー（.corrupt.<timestamp>）は残す。 */
  function acknowledgeStorageCorruption(target){
    var map = { reservations: STORAGE_RESERVATIONS, blockedSlots: STORAGE_BLOCKED_SLOTS, settings: STORAGE_SETTINGS };
    var key = map[target];
    if (!key) return false;
    try{
      localStorage.removeItem(key);
      clearCorruptFlag(key);
      return true;
    }catch(e){ return false; }
  }

  /* ---------- Date helpers ---------- */
  function sundayOf(d){
    var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    date.setDate(date.getDate() - date.getDay());
    return date;
  }
  function addDays(d, n){
    var r = new Date(d.getTime());
    r.setDate(r.getDate() + n);
    return r;
  }
  /* n ヶ月後（前）の日付を返す。対象月に同じ日にちが存在しない場合（例: 1/31 の1ヶ月後）は
     月末にクランプする（例: 2/28）。クランプしないと Date コンストラクタが翌月にあふれて
     「1ヶ月後のつもりが2ヶ月後になる」バグが発生する（バグ報告.md【改善提案】対応）。
     現在の呼び出し元は月初（1日）にしか使っていないため実害は無かったが、将来の誤用に備える。 */
  function addMonths(d, n){
    var targetFirst = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var daysInTargetMonth = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
    var clampedDay = Math.min(d.getDate(), daysInTargetMonth);
    return new Date(targetFirst.getFullYear(), targetFirst.getMonth(), clampedDay);
  }
  function startOfMonth(d){
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function dateISO(d){
    var y = d.getFullYear();
    var m = String(d.getMonth()+1).padStart(2,"0");
    var day = String(d.getDate()).padStart(2,"0");
    return y + "-" + m + "-" + day;
  }
  function isoToDate(iso){
    return new Date(iso + "T00:00:00");
  }
  function minutesToLabel(min){
    var h = Math.floor(min/60), m = min%60;
    return String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
  }
  function fmtMonthDate(d){
    return (d.getMonth()+1) + "/" + d.getDate();
  }
  function fmtFullDate(d){
    var wd = ["日","月","火","水","木","金","土"][d.getDay()];
    return d.getFullYear() + "年" + (d.getMonth()+1) + "月" + d.getDate() + "日(" + wd + ")";
  }
  function fmtCardDate(dISO){
    var d = isoToDate(dISO);
    var wd = ["日","月","火","水","木","金","土"][d.getDay()];
    return (d.getMonth()+1) + "/" + d.getDate() + "(" + wd + ")";
  }
  function fmtMonthLabel(d){
    return d.getFullYear() + "年" + (d.getMonth()+1) + "月";
  }
  /* 月カレンダー用: 指定日を含む月を、日曜始まりの6週(42マス)で返す */
  function buildMonthGrid(d){
    var first = startOfMonth(d);
    var gridStart = sundayOf(first);
    var cells = [];
    for (var i=0;i<42;i++){ cells.push(addDays(gridStart, i)); }
    return cells;
  }
  function isSameMonth(a, b){
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  /* ---------- Misc ---------- */
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c];
    });
  }
  function normalizeEmail(email){
    return String(email || "").trim().toLowerCase();
  }
  /* 電話番号の正規化：全角数字→半角、数字以外（ハイフン・空白等）を除去する。
     保存時・照会時の両方でこの関数を通すことで、ハイフンの有無に左右されず突合できる
     （バグ報告.md【軽微】「ハイフン付きの電話番号を入れるとヒットしない」対応）。 */
  function normalizeTel(tel){
    var s = String(tel || "");
    s = s.replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    return s.replace(/[^0-9]/g, "");
  }
  /* 画面側（index.html）と同じ形式チェック。データ層でも同じ正規表現を使えるようにここに集約する
     （バグ報告.md【軽微】「updateReservationContact に形式検証がない」対応）。 */
  var TEL_RE = /^0\d{9,10}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function uid(prefix){
    return prefix + Date.now() + Math.random().toString(16).slice(2);
  }

  /* ============================================================
     純粋関数（サーバー化後も再利用する予定のロジック）
     ============================================================ */
  function overlaps(aStart, aEnd, bStart, bEnd){
    return aStart < bEnd && aEnd > bStart;
  }

  /* 選択中メニュー・オプションから合計時間（分）を算出 */
  function computeTotalMinutes(selectedMenus, selectedOptions){
    var total = 0;
    (selectedMenus||[]).forEach(function(m){ total += m.durationMin; });
    (selectedOptions||[]).forEach(function(o){ total += o.durationMin; });
    return total;
  }
  /* 選択中メニュー・オプションから合計金額（円）を算出 */
  function computeTotalPrice(selectedMenus, selectedOptions){
    var total = 0;
    (selectedMenus||[]).forEach(function(m){ total += m.price; });
    (selectedOptions||[]).forEach(function(o){ total += o.price; });
    return total;
  }
  /* 選択中メニューが持つ時間帯制約（serviceWindow）の積集合を返す（無ければ null）。
     この範囲(min〜max)の意味は TIME_WINDOW_MODE に依存する（"end"なら終了ベース、
     "start"なら開始ベース）。積集合の計算方法自体はどちらのモードでも同じ
     （両方の制約を同時に満たす min〜max の範囲を返す）。
     複数メニューにそれぞれ制約がある場合は、両方を同時に満たす範囲（積集合）を返す。 */
  function combineServiceWindows(selectedMenus){
    var win = null;
    (selectedMenus||[]).forEach(function(m){
      if (!m.serviceWindow) return;
      if (!win){ win = { min: m.serviceWindow.min, max: m.serviceWindow.max }; }
      else {
        win.min = Math.max(win.min, m.serviceWindow.min);
        win.max = Math.min(win.max, m.serviceWindow.max);
      }
    });
    /* 複数メニューの時間帯制約が交差しない場合、min > max の「逆転した範囲」になる。
       computeAvailableStartTimes は min>max でも結果的に全枠を除外するので動作上は安全だが、
       呼び出し側が「制約が両立しない」のか「たまたま満席」なのかを区別できるよう
       impossible フラグを立てて返す（バグ報告.md【改善提案】対応）。 */
    if (win && win.min > win.max){
      win.impossible = true;
    }
    return win;
  }
  /* 予約可能な日付範囲（本日〜maxAdvanceDays 日後）のISO文字列を返す
     cfg を省略した場合は BOOKING_CONFIG の初期値を使う（フェーズ①の簡易呼び出し用）。 */
  function bookableRange(now, cfg){
    cfg = cfg || BOOKING_CONFIG;
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var maxDate = addDays(today, cfg.MAX_ADVANCE_DAYS);
    return { fromISO: dateISO(today), toISO: dateISO(maxDate) };
  }
  function isBookableDate(dISO, now, cfg){
    var range = bookableRange(now, cfg);
    return dISO >= range.fromISO && dISO <= range.toISO;
  }

  /* 指定日・指定合計時間で予約可能な開始時刻(分)の一覧を返す純粋関数。
     予約(reservations)・手動ブロック・カレンダー由来ブロック(いずれもblockedSlots)を
     区別せず、一律に「埋まっている」として扱う。
     opts: {
       dateISO, totalMinutes, now,
       reservations: [{dateISO,startMin,endMin}, ...]  (その日のみで良い),
       blockedSlots: [{dateISO,allDay,startMin,endMin,source}, ...] (その日のみで良い),
       serviceWindow: {min,max} | null … メニュー側の時間帯制約。意味は timeWindowMode に依存する,
       timeWindowMode: "end" | "start" (省略時は cfg.TIME_WINDOW_MODE、さらに省略時は
         BOOKING_CONFIG.TIME_WINDOW_MODE) … serviceWindow の解釈方法。
           "end"   … 開始時刻 >= min かつ 開始時刻+合計時間 <= max（終了ベース）
           "start" … 開始時刻 >= min かつ 開始時刻 <= max（開始ベース。終了時刻は問わない）
         いずれのモードでも、営業終了(cfg.BUSINESS_END)を超える枠はループ条件で別途除外される,
       cfg: { BUSINESS_START, BUSINESS_END, STEP, CUTOFF_MIN, MAX_ADVANCE_DAYS, TIME_WINDOW_MODE }
         (省略時はBOOKING_CONFIG)
     }
  */
  function computeAvailableStartTimes(opts){
    var cfg = opts.cfg || BOOKING_CONFIG;
    var mode = opts.timeWindowMode || cfg.TIME_WINDOW_MODE || TIME_WINDOW_MODE;
    var results = [];
    if (!isBookableDate(opts.dateISO, opts.now, cfg)) return results;
    if (opts.serviceWindow && opts.serviceWindow.impossible) return results;

    var fullDayBlocked = (opts.blockedSlots||[]).some(function(b){
      return b.dateISO === opts.dateISO && b.allDay;
    });
    if (fullDayBlocked) return results;

    var dayDate = isoToDate(opts.dateISO);
    var cutoff = new Date(opts.now.getTime() + cfg.CUTOFF_MIN * 60000);

    for (var start = cfg.BUSINESS_START; start + opts.totalMinutes <= cfg.BUSINESS_END; start += cfg.STEP){
      var end = start + opts.totalMinutes;

      if (opts.serviceWindow){
        if (mode === "start"){
          if (start < opts.serviceWindow.min || start > opts.serviceWindow.max) continue;
        } else { // "end"（デフォルト・現在の採用値）
          if (start < opts.serviceWindow.min || end > opts.serviceWindow.max) continue;
        }
      }

      var slotStartDate = new Date(dayDate.getTime());
      slotStartDate.setMinutes(start);
      if (slotStartDate < cutoff) continue;

      var blockedHit = (opts.blockedSlots||[]).some(function(b){
        if (b.dateISO !== opts.dateISO || b.allDay) return false;
        return overlaps(start, end, b.startMin, b.endMin);
      });
      if (blockedHit) continue;

      var reservedHit = (opts.reservations||[]).some(function(r){
        if (r.dateISO !== opts.dateISO) return false;
        return overlaps(start, end, r.startMin, r.endMin);
      });
      if (reservedHit) continue;

      results.push(start);
    }
    return results;
  }

  /* ============================================================
     予約payloadの検証（純粋関数）
     ------------------------------------------------------------
     ★設計方針: この関数は Ledger.api の「外」に置き、localStorage に一切
     触れない（必要なデータはすべて ctx 引数で受け取る）。
     フェーズ②で Ledger.api の中身を Cloudflare Workers への fetch に
     差し替えたとき、同じ検証コードをサーバー側（Workers）でそのまま
     import して再利用する想定。クライアントの申告値は信用せず、
     totalMinutes / totalPrice は menuIds / optionIds から必ずサーバー側
     （＝この関数）で再計算する。

     引数:
       payload … 画面から渡された予約内容（クライアントの自己申告値）
       ctx: {
         cfg,              … getEffectiveConfig() の結果
         now,              … 確定時点の現在時刻（Date）
         reservations,     … 全予約（配列。関数内で dateISO により絞り込む）
         blockedSlots,     … 全ブロック（配列。関数内で dateISO により絞り込む）
         menuItems,        … MENU_ITEMS
         optionItems,      … OPTION_ITEMS
         cuppingOptions,   … CUPPING_OPTIONS
         cuppingMenuId     … CUPPING_MENU_ID
       }

     戻り値:
       成功時: { ok:true, normalized: { dateISO, startMin, endMin, totalMinutes,
                 totalPrice, menuIds, optionIds, cuppingOptionIds, customer } }
                 ※ totalMinutes/totalPrice/customer.tel は再計算・正規化済みの値。
       失敗時: { ok:false, code: "INVALID" | "UNAVAILABLE", error: "お客様向け日本語メッセージ" }
                 code:"UNAVAILABLE" … 日時が今はもう選べない（締切超過・満枠・範囲外等）。
                                       画面側はこれを受けたらSTEP2に戻し、枠を再描画すること。
                 code:"INVALID"     … データ形式そのものが不正（通常のUI操作では発生しない）。
     ============================================================ */
  function fail(code, message){
    return { ok:false, code:code, error:message };
  }
  function validateReservationPayload(payload, ctx){
    ctx = ctx || {};
    var cfg = ctx.cfg || BOOKING_CONFIG;
    var now = ctx.now || new Date();
    var menuItems = ctx.menuItems || MENU_ITEMS;
    var optionItems = ctx.optionItems || OPTION_ITEMS;
    var cuppingOptions = ctx.cuppingOptions || CUPPING_OPTIONS;
    var cuppingMenuId = ctx.cuppingMenuId || CUPPING_MENU_ID;

    if (!payload || typeof payload !== "object"){
      return fail("INVALID", "予約内容の形式が正しくありません。");
    }

    /* ---- 日付形式 ---- */
    if (typeof payload.dateISO !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateISO)){
      return fail("INVALID", "日付の形式が正しくありません。");
    }
    var parsedDate = isoToDate(payload.dateISO);
    if (isNaN(parsedDate.getTime()) || dateISO(parsedDate) !== payload.dateISO){
      return fail("INVALID", "存在しない日付が指定されています。");
    }

    /* ---- メニューID の実在チェック ---- */
    if (!Array.isArray(payload.menuIds) || payload.menuIds.length === 0){
      return fail("INVALID", "メニューが選択されていません。");
    }
    var menuIds = payload.menuIds.filter(function(id, i){ return payload.menuIds.indexOf(id) === i; });
    if (menuIds.length !== payload.menuIds.length){
      return fail("INVALID", "メニューの指定が重複しています。");
    }
    var selectedMenus = [];
    for (var mi = 0; mi < menuIds.length; mi++){
      var menu = menuItems.filter(function(m){ return m.id === menuIds[mi]; })[0];
      if (!menu) return fail("INVALID", "存在しないメニューが指定されています。");
      selectedMenus.push(menu);
    }

    var optionIds = Array.isArray(payload.optionIds) ? payload.optionIds.filter(function(id, i, arr){ return arr.indexOf(id) === i; }) : [];
    var selectedOptions = [];
    for (var oi = 0; oi < optionIds.length; oi++){
      var opt = optionItems.filter(function(o){ return o.id === optionIds[oi]; })[0];
      if (!opt) return fail("INVALID", "存在しないオプションが指定されています。");
      selectedOptions.push(opt);
    }

    var cuppingOptionIds = Array.isArray(payload.cuppingOptionIds) ? payload.cuppingOptionIds.filter(function(id, i, arr){ return arr.indexOf(id) === i; }) : [];
    for (var ci = 0; ci < cuppingOptionIds.length; ci++){
      var validCupping = cuppingOptions.some(function(c){ return c.id === cuppingOptionIds[ci]; });
      if (!validCupping) return fail("INVALID", "存在しない組み合わせオプションが指定されています。");
    }
    if (cuppingOptionIds.length && menuIds.indexOf(cuppingMenuId) === -1){
      return fail("INVALID", "選択されたメニューではご利用いただけない組み合わせオプションが指定されています。");
    }

    /* ---- 合計時間・合計金額はクライアント申告値を使わず、必ずここで再計算する ---- */
    var totalMinutes = computeTotalMinutes(selectedMenus, selectedOptions);
    var totalPrice = computeTotalPrice(selectedMenus, selectedOptions);

    /* ---- 時間帯（STEPの倍数・endMin>startMin・合計時間との整合） ---- */
    if (typeof payload.startMin !== "number" || typeof payload.endMin !== "number" ||
        !isFinite(payload.startMin) || !isFinite(payload.endMin) ||
        !Number.isInteger(payload.startMin) || !Number.isInteger(payload.endMin)){
      return fail("INVALID", "時間の指定が正しくありません。");
    }
    if (payload.startMin < 0 || payload.startMin % cfg.STEP !== 0){
      return fail("INVALID", "開始時刻の指定が正しくありません。");
    }
    if (payload.endMin <= payload.startMin){
      return fail("INVALID", "終了時刻は開始時刻より後にしてください。");
    }
    if (payload.endMin - payload.startMin !== totalMinutes){
      return fail("INVALID", "選択されたメニュー・オプションと時間の指定が一致しません。");
    }

    /* ---- 必須顧客項目の存在と形式・最大長 ---- */
    var customer = payload.customer || {};
    var name = typeof customer.name === "string" ? customer.name.trim() : "";
    var kana = typeof customer.kana === "string" ? customer.kana.trim() : "";
    var telNormalized = normalizeTel(customer.tel);
    var email = typeof customer.email === "string" ? customer.email.trim() : "";
    var note = typeof customer.note === "string" ? customer.note.trim() : "";

    if (!name || name.length > 50) return fail("INVALID", "お名前をご確認ください（50文字以内で入力してください）。");
    if (!kana || kana.length > 50) return fail("INVALID", "フリガナをご確認ください（50文字以内で入力してください）。");
    if (!TEL_RE.test(telNormalized) || telNormalized.length > 20) return fail("INVALID", "電話番号をご確認ください。");
    if (!EMAIL_RE.test(email) || email.length > 254) return fail("INVALID", "メールアドレスをご確認ください。");
    if (note.length > 1000) return fail("INVALID", "ご要望は1000文字以内でご入力ください。");

    /* ---- 時間帯制約の積集合が両立しない組み合わせ ---- */
    var serviceWindow = combineServiceWindows(selectedMenus);
    if (serviceWindow && serviceWindow.impossible){
      return fail("INVALID", "選択いただいたメニューの組み合わせは、対応可能な時間帯が重ならないため恐れ入りますがご予約いただけません。");
    }

    /* ---- 予約可能範囲・受付締切・営業時間内・重複（予約/ブロック）を一括で再判定 ----
       ここが【重大】「確定時の可用性再検証がない」への対応の中核。
       画面を開いたまま時間が経過した場合や、締切・過去日をまたいだ場合、
       ここで必ず今の時刻（ctx.now）を基準に再判定される。 */
    var dayReservations = (ctx.reservations || []).filter(function(r){ return r.dateISO === payload.dateISO; });
    var dayBlocked = (ctx.blockedSlots || []).filter(function(b){ return b.dateISO === payload.dateISO; });
    var availableStarts = computeAvailableStartTimes({
      dateISO: payload.dateISO,
      totalMinutes: totalMinutes,
      now: now,
      reservations: dayReservations,
      blockedSlots: dayBlocked,
      serviceWindow: serviceWindow,
      cfg: cfg
    });
    if (availableStarts.indexOf(payload.startMin) === -1){
      return fail("UNAVAILABLE", "申し訳ございません。ただいま受付を締め切りました。恐れ入りますが別の日時をお選びください。");
    }

    return {
      ok: true,
      normalized: {
        dateISO: payload.dateISO,
        startMin: payload.startMin,
        endMin: payload.endMin,
        totalMinutes: totalMinutes,
        totalPrice: totalPrice,
        menuIds: menuIds,
        optionIds: optionIds,
        cuppingOptionIds: cuppingOptionIds,
        customer: { name: name, kana: kana, tel: telNormalized, email: email, note: note }
      }
    };
  }

  /* ============================================================
     ⚠ フェーズ②：この api オブジェクトの中身を Cloudflare Workers への
     fetch に差し替える。呼び出し側（index.html / admin.html）は
     すべて await / .then() で呼んでいるため変更不要。
     ============================================================ */
  /* localStorage の read-modify-write はアトミックではないため、同一オリジンの
     複数タブから同時に呼ばれると競合しうる。navigator.locks（Web Locks API）が
     使える環境ではそれで同一オリジン内の直列化を行い、無い環境でも壊れないように
     素通しにする（＝下記の「保存直後の読み直し検証」だけで守る）。
     ⚠ これはフェーズ①の暫定緩和であり、競合を完全に防止するものではない
     （README「(D) 保留中の事項」および バグ報告.md【致命的】を参照）。 */
  function withOptionalLock(name, fn){
    if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function"){
      return navigator.locks.request(name, fn);
    }
    return fn();
  }
  function filterByRange(list, range){
    if (!range) return list.slice();
    return list.filter(function(item){
      if (range.from && item.dateISO < range.from) return false;
      if (range.to && item.dateISO > range.to) return false;
      return true;
    });
  }

  var api = {
    /* 期間指定で予約取得 */
    getReservations: function(range){
      return Promise.resolve().then(function(){
        var loaded = loadReservations();
        return filterByRange(loaded.list, range);
      });
    },

    /* 予約作成。validateReservationPayload で検証・再計算した上で保存する。
       保存直後に読み直して自分のIDが残っているか・重なる他予約が混入していないかを検証する
       （【致命的】同時予約競合への暫定緩和。README を参照。完全な解決ではない）。 */
    createReservation: function(payload){
      return withOptionalLock("cocosiaBooking.reservations.lock", function(){
        return Promise.resolve().then(function(){
          var loadedRes = loadReservations();
          var loadedBlocked = loadBlockedSlots();
          if (loadedRes.corrupted || loadedBlocked.corrupted){
            return { ok:false, code:"STORAGE_CORRUPTED", error:"保存されているデータを正しく読み取れませんでした。安全のため新規のご予約を一時的に停止しております。お手数ですがお電話（" + BOOKING_CONFIG.TEL + "）にてご連絡ください。" };
          }

          var cfg = getEffectiveConfig();
          var check = validateReservationPayload(payload, {
            cfg: cfg,
            now: new Date(),
            reservations: loadedRes.list,
            blockedSlots: loadedBlocked.list,
            menuItems: MENU_ITEMS,
            optionItems: OPTION_ITEMS,
            cuppingOptions: CUPPING_OPTIONS,
            cuppingMenuId: CUPPING_MENU_ID
          });
          if (!check.ok) return check;

          var normalized = check.normalized;
          var reservations = loadedRes.list;

          // validateReservationPayload 内でも重複判定は行っているが、明示的な文言のためここでも判定する
          var conflict = reservations.some(function(r){
            return r.dateISO === normalized.dateISO && overlaps(normalized.startMin, normalized.endMin, r.startMin, r.endMin);
          });
          if (conflict){
            return { ok:false, code:"UNAVAILABLE", error:"申し訳ございません。この時間帯はすでに予約またはブロックされています。お手数ですが別の時間をお選びください。" };
          }

          var reservation = Object.assign({
            id: uid("r"),
            createdAt: new Date().toISOString()
          }, normalized);

          reservations.push(reservation);
          var saved = saveReservations(reservations);
          if (!saved){
            return { ok:false, error:"保存に失敗しました。ブラウザの設定をご確認のうえ、もう一度お試しください。" };
          }

          /* ---- 致命的バグ「同時予約で片方が消滅する」への暫定緩和 ----
             localStorage の read-modify-write はアトミックではないため、同一オリジンの別タブ/別窓
             から同時に同じ時間帯へ確定されると、後勝ちの書き込みでどちらかの予約が消えることがある
             （フェーズ①の構造的な限界。navigator.locks が使える環境では上の withOptionalLock で
             直列化されるが、使えない環境でも壊れないよう、保存直後にもう一度読み直して確認する）。
             ⚠ これは緩和であり、競合を完全に防止するものではない。完全な解決はフェーズ②で
             D1のユニーク制約または「重なる行が無いことを条件にした単一のINSERT文」によって行う
             （README の D1 テーブル設計案を参照）。 */
          var verify = loadReservations();
          if (verify.corrupted){
            return { ok:false, error:"ご予約の保存後の確認に失敗しました。恐れ入りますが、ご予約が完了しているか店舗までお電話にてご確認ください。" };
          }
          var stillThere = verify.list.some(function(r){ return r.id === reservation.id; });
          var overlapCount = verify.list.filter(function(r){
            return r.id !== reservation.id && r.dateISO === reservation.dateISO && overlaps(reservation.startMin, reservation.endMin, r.startMin, r.endMin);
          }).length;
          if (!stillThere || overlapCount > 0){
            // 競合を検出。安全側に倒し、この呼び出し分の予約だけを取り除いてエラーを返す
            // （相手側の予約が存在する場合はそちらには触れない）。
            var recovered = verify.list.filter(function(r){ return r.id !== reservation.id; });
            saveReservations(recovered);
            return { ok:false, code:"CONFLICT", error:"混雑によりご予約の確定を完了できませんでした。恐れ入りますが、少し時間をおいて「予約の確認・変更」からご予約状況をご確認いただくか、最初からもう一度お試しください。" };
          }

          return { ok:true, reservation: reservation };
        });
      });
    },

    /* 予約キャンセル。対象が存在しない場合は ok:false を返す */
    cancelReservation: function(id){
      return Promise.resolve().then(function(){
        var loaded = loadReservations();
        if (loaded.corrupted){
          return { ok:false, error:"予約データを正しく読み取れませんでした。恐れ入りますが店舗までお電話にてご連絡ください。" };
        }
        var reservations = loaded.list;
        var exists = reservations.some(function(r){ return r.id === id; });
        if (!exists){
          return { ok:false, error:"該当する予約が見つかりませんでした。すでにキャンセル済みの可能性があります。" };
        }
        var next = reservations.filter(function(r){ return r.id !== id; });
        var saved = saveReservations(next);
        if (!saved){
          return { ok:false, error:"保存に失敗しました。" };
        }
        return { ok:true };
      });
    },

    /* お客様が予約後に連絡先（電話・メール）を修正する。
       呼び出し側で本人確認（予約番号＋電話番号の一致など）を行ってから呼ぶこと。
       データ層でも TEL_RE / EMAIL_RE による形式検証を行う。電話番号は normalizeTel で正規化して保存する。 */
    updateReservationContact: function(id, contact){
      return Promise.resolve().then(function(){
        var loaded = loadReservations();
        if (loaded.corrupted){
          return { ok:false, error:"予約データを正しく読み取れませんでした。恐れ入りますが店舗までお電話にてご連絡ください。" };
        }
        var reservations = loaded.list;
        var idx = -1;
        reservations.some(function(r, i){ if (r.id === id){ idx = i; return true; } return false; });
        if (idx === -1){
          return { ok:false, error:"該当する予約が見つかりませんでした。" };
        }
        var current = reservations[idx];
        var hasTel = contact && typeof contact.tel === "string" && contact.tel.trim();
        var hasEmail = contact && typeof contact.email === "string" && contact.email.trim();
        var newTel = hasTel ? normalizeTel(contact.tel) : current.customer.tel;
        var newEmail = hasEmail ? contact.email.trim() : current.customer.email;

        if (hasTel && (!TEL_RE.test(newTel) || newTel.length > 20)){
          return { ok:false, error:"電話番号の形式が正しくありません。" };
        }
        if (hasEmail && (!EMAIL_RE.test(newEmail) || newEmail.length > 254)){
          return { ok:false, error:"メールアドレスの形式が正しくありません。" };
        }

        var target = Object.assign({}, current, {
          customer: Object.assign({}, current.customer, { tel: newTel, email: newEmail })
        });
        var next = reservations.slice();
        next[idx] = target;
        var saved = saveReservations(next);
        if (!saved){
          return { ok:false, error:"保存に失敗しました。" };
        }
        return { ok:true, reservation: target };
      });
    },

    /* 休業日・ブロック時間の取得（期間指定）。各要素に source（'manual'|'google-calendar'）を含む */
    getBlockedSlots: function(range){
      return Promise.resolve().then(function(){
        var loaded = loadBlockedSlots();
        return filterByRange(loaded.list, range);
      });
    },

    /* 休業日・ブロック時間の登録。source省略時は 'manual'（管理画面からの手動登録）扱い。
       'google-calendar' はフェーズ③でカレンダー同期処理から呼ばれる想定。 */
    createBlockedSlot: function(payload){
      return Promise.resolve().then(function(){
        var loaded = loadBlockedSlots();
        if (loaded.corrupted){
          return { ok:false, error:"ブロックデータを正しく読み取れませんでした。安全のため保存を停止しています。" };
        }
        var blockedSlots = loaded.list;
        var slot = Object.assign({ id: uid("b"), source: "manual" }, payload);
        blockedSlots.push(slot);
        var saved = saveBlockedSlots(blockedSlots);
        if (!saved){
          return { ok:false, error:"保存に失敗しました。" };
        }
        return { ok:true, blockedSlot: slot };
      });
    },

    /* 休業日・ブロック時間の削除。対象が存在しない場合は ok:false を返す。
       source が 'google-calendar' のものは次回同期で復活してしまうため削除を拒否する
       （カレンダー側の予定を削除する運用を想定。フェーズ③実装時に自動再削除ロジックへ差し替え可）。 */
    deleteBlockedSlot: function(id){
      return Promise.resolve().then(function(){
        var loaded = loadBlockedSlots();
        if (loaded.corrupted){
          return { ok:false, error:"ブロックデータを正しく読み取れませんでした。恐れ入りますが管理者にご連絡ください。" };
        }
        var blockedSlots = loaded.list;
        var target = blockedSlots.filter(function(b){ return b.id === id; })[0];
        if (!target){
          return { ok:false, error:"該当する休業日・ブロックが見つかりませんでした。すでに削除済みの可能性があります。" };
        }
        if (target.source === "google-calendar"){
          return { ok:false, error:"Googleカレンダー由来のブロックは削除できません。カレンダー側の予定を削除してください。" };
        }
        var next = blockedSlots.filter(function(b){ return b.id !== id; });
        var saved = saveBlockedSlots(next);
        if (!saved){
          return { ok:false, error:"保存に失敗しました。" };
        }
        return { ok:true };
      });
    },

    /* その日の予約可能な開始時刻(分)の一覧を返す
       opts: { dateISO, totalMinutes, menuConstraints:{serviceWindow} } */
    getAvailability: function(opts){
      return Promise.resolve().then(function(){
        var cfg = getEffectiveConfig();
        var loadedRes = loadReservations();
        var loadedBlocked = loadBlockedSlots();
        var reservations = (loadedRes.corrupted ? [] : loadedRes.list).filter(function(r){ return r.dateISO === opts.dateISO; });
        var blockedSlots = (loadedBlocked.corrupted ? [] : loadedBlocked.list).filter(function(b){ return b.dateISO === opts.dateISO; });
        return computeAvailableStartTimes({
          dateISO: opts.dateISO,
          totalMinutes: opts.totalMinutes,
          now: new Date(),
          reservations: reservations,
          blockedSlots: blockedSlots,
          serviceWindow: opts.menuConstraints && opts.menuConstraints.serviceWindow,
          cfg: cfg
        });
      });
    },

    /* 設定（通知先メール・営業時間・締切・予約可能日数）の取得。
       未設定の項目は BOOKING_CONFIG の初期値で補完して返す。 */
    getSettings: function(){
      return Promise.resolve().then(function(){
        return getEffectiveConfig();
      });
    },

    /* 設定の更新。渡したキーのみ上書きする（部分更新）。
       payload: { notificationEmails, businessStart, businessEnd, cutoffMin, maxAdvanceDays }
       営業開始 >= 営業終了 の場合は保存を拒否する（【重大】予約システム全体が停止するバグへの対応）。 */
    updateSettings: function(payload){
      return Promise.resolve().then(function(){
        var loaded = loadSettings();
        if (loaded.corrupted){
          return { ok:false, error:"設定データを正しく読み取れませんでした。安全のため保存を停止しています。" };
        }
        var current = loaded.list || {};
        var next = Object.assign({}, current, payload || {});
        var effStart = (typeof next.businessStart === "number") ? next.businessStart : BOOKING_CONFIG.BUSINESS_START;
        var effEnd = (typeof next.businessEnd === "number") ? next.businessEnd : BOOKING_CONFIG.BUSINESS_END;
        if (effStart >= effEnd){
          return { ok:false, error:"営業終了時刻は営業開始時刻より後にしてください。" };
        }
        var saved = saveSettings(next);
        if (!saved){
          return { ok:false, error:"保存に失敗しました。" };
        }
        return { ok:true, settings: getEffectiveConfig() };
      });
    },

    /* localStorage破損の検知状況を返す（画面側の警告表示用） */
    getStorageHealth: function(){
      return Promise.resolve().then(function(){
        return getStorageHealth();
      });
    },

    /* 破損状態を手動で解消する（管理画面からの操作を想定）。target: 'reservations'|'blockedSlots'|'settings' */
    acknowledgeStorageCorruption: function(target){
      return Promise.resolve().then(function(){
        var done = acknowledgeStorageCorruption(target);
        return done ? { ok:true } : { ok:false, error:"解除に失敗しました。" };
      });
    }
  };

  return {
    BOOKING_CONFIG: BOOKING_CONFIG,
    LINE_QR_SRC: LINE_QR_SRC,
    MENU_ITEMS: MENU_ITEMS,
    OPTION_ITEMS: OPTION_ITEMS,
    CUPPING_MENU_ID: CUPPING_MENU_ID,
    CUPPING_OPTIONS: CUPPING_OPTIONS,

    isStorageAvailable: isStorageAvailable,
    getEffectiveConfig: getEffectiveConfig,

    sundayOf: sundayOf,
    addDays: addDays,
    addMonths: addMonths,
    startOfMonth: startOfMonth,
    dateISO: dateISO,
    isoToDate: isoToDate,
    minutesToLabel: minutesToLabel,
    fmtMonthDate: fmtMonthDate,
    fmtFullDate: fmtFullDate,
    fmtCardDate: fmtCardDate,
    fmtMonthLabel: fmtMonthLabel,
    buildMonthGrid: buildMonthGrid,
    isSameMonth: isSameMonth,

    escapeHtml: escapeHtml,
    normalizeEmail: normalizeEmail,
    normalizeTel: normalizeTel,
    TEL_RE: TEL_RE,
    EMAIL_RE: EMAIL_RE,

    overlaps: overlaps,
    computeTotalMinutes: computeTotalMinutes,
    computeTotalPrice: computeTotalPrice,
    combineServiceWindows: combineServiceWindows,
    TIME_WINDOW_MODE: TIME_WINDOW_MODE,
    bookableRange: bookableRange,
    isBookableDate: isBookableDate,
    computeAvailableStartTimes: computeAvailableStartTimes,
    validateReservationPayload: validateReservationPayload,

    api: api
  };
})();
