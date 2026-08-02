-- ════════════════════════════════════════════════════════════════════════
-- 飲み屋 売上管理（nomiya-uriage）の棚
--
--   ★配るアプリ(nomiya-uriage.html)が向いているのは本番倉庫 tnfwipbgfgjaymlszeid。★
--     この1本を、本番倉庫とテスト用DB(DB-test / khawdrnvssdenumbiwfg)の両方に当てる。
--     （開発版 exally-staging だけが DB-test を向く。本番から DB-test には書かない）
--   ★本番倉庫は Kyually/代行の実データと同居。適用は司さんの許可を取ってから。
--     適用できたかの確認は node tests/probe-nomiya-db.mjs（公開鍵で7表を叩いて出力を残す）。
--   ★このファイルは「新規テーブル3つを作るだけ」。既存テーブル/既存データには触らない。★
--   ★冪等（create if not exists / drop policy if exists）＝何度実行しても安全。★
--   適用方法: Supabase ダッシュボード > SQL Editor に貼って Run（1回）。
--
--   新規:
--     nomiya_sales    ... 売上1件＝1組のお会計
--     nomiya_partners ... 宛先（請求書送りの相手＝会社名・敬称・担当者）
--     nomiya_settings ... 店の情報・ロゴ・判子・請求書のデザイン（1アカウント1行）
--     nomiya_invoices ... 請求書番号の台帳（機種を替えても番号が続くように）
--     nomiya_closes   ... レジ締め（1日1行・釣銭/出金/数えた実数/差額の元）
--     nomiya_staff    ... スタッフと給与の決め方（時給/日給/バック単価/歩合/保証）
--     nomiya_work     ... 日々の実績（出勤・指名・同伴・罰金・前借り・日払い済み）
--
--   共通方針: account_id = auth.uid() + RLS 本人のみ（既存 pay_* と同方式）。
--             お金の記録はソフト削除(deleted_at)＝物理削除しない。
--             端末でも打てる（オフライン）ので、突合の鍵は端末が作る id（cid）。
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 売上（1組のお会計） ───────────────────────────────────────────────
--   cid          = 端末が作ったID（画面の売上.id）。同期の突合はこれで行う。
--   pay          = cash / credit / paypay / invoice / tsuke
--   receipt      = none / issued / later / na
--   paid_date    = 入金日（請求書送り・ツケが回収済みになった日。未回収は null）
--   staff        = 担当（誰の客か）。今は画面に出さないが、後からキャスト別売上を
--                  出すときに過去分が空だと使えないので、最初から器を持つ。
create table if not exists nomiya_sales (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cid        text not null,
  ymd        date not null,
  name       text not null default '',
  people     integer not null default 1,
  amount     integer not null default 0,
  pay        text not null default 'cash',
  receipt      text not null default 'none',
  receipt_date date,                              -- 領収書を渡した日（出していなければ null）
  memo       text not null default '',
  paid_date  date,
  paid_cash  boolean not null default false,      -- ツケ回収を現金で受けたか（レジ締めの現金に効く）
  paid_by    text not null default '',            -- 'payment'=入金の記録で埋まった分（二重に数えないための印）
  staff      text not null default '',              -- 担当（誰の客か）＝歩合が付く人
  crew       jsonb not null default '[]'::jsonb,   -- ついた人 [{name,role}]（ヘルプ・場内など）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, cid)
);
create index if not exists idx_nomiya_sales_acct_ymd on nomiya_sales(account_id, ymd);
create index if not exists idx_nomiya_sales_acct_upd on nomiya_sales(account_id, updated_at);
-- 既に作ってある店にも足す（あとから列を増やすときはこの形で書く）
alter table nomiya_sales add column if not exists paid_cash boolean not null default false;
alter table nomiya_sales add column if not exists crew jsonb not null default '[]'::jsonb;
-- 「調整」に入れる印（人が1件ずつ選ぶ。領収書の記録そのものは変えない）
alter table nomiya_sales add column if not exists adj boolean not null default false;
-- 入金の記録で埋まった分の印（空＝前の作りで入金済みにした分）
alter table nomiya_sales add column if not exists paid_by text not null default '';

-- ── 宛先（請求書送りの相手） ──────────────────────────────────────────
--   name  = 会社名（そのまま売上の名前になる＝突合の鍵）
--   honor = 御中 / 様
create table if not exists nomiya_partners (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  honor        text not null default '御中',
  person       text not null default '',
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (account_id, name)
);
create index if not exists idx_nomiya_partners_acct on nomiya_partners(account_id, name);

-- ── 請求書番号の台帳（相手＋期間ごとに1つ） ───────────────────────────
--   端末の中だけに置くと、機種を替えた時に番号が重複・欠番する。
--   （適格請求書の写しを7年保存する話に直結するので、クラウドに置く）
--   key  = 相手＋期間（アプリが作る一意キー）
create table if not exists nomiya_invoices (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  no         text not null,
  name       text not null default '',
  ymd_from   date,
  ymd_to     date,
  issued_at  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, key)
);
create index if not exists idx_nomiya_invoices_acct on nomiya_invoices(account_id, no);

-- ── 店の設定（1アカウント1行） ────────────────────────────────────────
--   config 例: { store:'', addr:'', tel:'', regNo:'', bank:'', rate:0.1,
--                tpl:'card', accent:'', font:'mincho', logoPos:'top',
--                logo:'data:image/png;base64,...', hanko:'data:image/png;base64,...' }
create table if not exists nomiya_settings (
  account_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── レジ締め（1日1行） ───────────────────────────────────────────────
--   閉店後の現金合わせ。あるべき額 = 釣銭 ＋ 現金売上 ＋ 現金で回収したツケ − 出金。
--   outs 例: [{id:'', kind:'buy|taxi|pay|lend|other', amount:0, memo:'', staff:''}]
--   counted = 数えた実数（数えていないうちは null。0と区別する）
create table if not exists nomiya_closes (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ymd        date not null,
  opening    integer not null default 0,          -- 釣銭準備金
  outs       jsonb   not null default '[]'::jsonb, -- 現金の出金
  counted    integer,                              -- 数えた実数
  memo       text    not null default '',
  closed_at  timestamptz,                          -- 締めた時刻（入るとロック）
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, ymd)
);
create index if not exists idx_nomiya_closes_acct_ymd on nomiya_closes(account_id, ymd);

-- ── スタッフ（人と「決め方」） ───────────────────────────────────────
--   夜の店の給与は店ごとに全部違うので、決め方をデータで持つ。
--   back 例: { shimei:2000, jonai:1000, douhan:3000, drink:500, bottle:1000 }
--   employ = employee(雇用) / contract(業務委託)  cycle = daily/weekly/monthly
create table if not exists nomiya_staff (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sid        text not null,                      -- アプリが作るID
  name       text not null default '',
  role       text not null default '',
  hourly     integer not null default 0,         -- 時給
  daily      integer not null default 0,         -- 日給
  back       jsonb   not null default '{}'::jsonb,   -- 円で決めたバック単価
  back_pct   jsonb   not null default '{}'::jsonb,   -- ％で決めたバック率（シャンパン等）
  use_items  jsonb   not null default '{}'::jsonb,   -- この人に使う項目（外した物だけ false・空＝全部使う）
  rate       numeric not null default 0,         -- 売上歩合(%)
  guarantee  integer not null default 0,         -- 最低保証
  kousei     integer not null default 0,         -- 厚生費（1日）
  cycle      text    not null default 'daily',
  employ     text    not null default 'employee',
  cash       boolean not null default true,      -- 現金で渡すか
  memo       text    not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, sid)
);
alter table nomiya_staff add column if not exists back_pct jsonb not null default '{}'::jsonb;
alter table nomiya_staff add column if not exists use_items jsonb not null default '{}'::jsonb;
-- 締め方（人ごと）。close_wday=週払いの締め曜日(0=日…6=土) / pay_after=締めてから何日後に渡すか
alter table nomiya_staff add column if not exists close_wday integer not null default 0;
alter table nomiya_staff add column if not exists pay_after integer not null default 0;
-- 生年月日（任意）。18歳未満の深夜の注意にだけ使う
alter table nomiya_staff add column if not exists birth date;
-- 渡し方（register=レジから / hand=手元の現金 / bank=振込）。空なら cash から決める
alter table nomiya_staff add column if not exists pay_from text not null default 'register';
-- 並び順（0＝まだ決めていない＝入れた順）
alter table nomiya_staff add column if not exists ord integer not null default 0;
create index if not exists idx_nomiya_staff_acct on nomiya_staff(account_id, name);

-- ── 日々の実績（1人×1日） ────────────────────────────────────────────
--   count 例: { shimei:2, jonai:0, douhan:1, drink:4, bottle:0 }
--   paid_at が入ると「その日ぶんを渡した」＝日払い済み
create table if not exists nomiya_work (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  wid        text not null,                      -- アプリが作るID
  ymd        date not null,
  staff_id   text not null,
  in_at      text not null default '',           -- 'HH:MM'
  out_at     text not null default '',
  count      jsonb   not null default '{}'::jsonb,   -- 本数（円バック用）
  amount     jsonb   not null default '{}'::jsonb,   -- 売った額（手で打った分）
  picks      jsonb   not null default '{}'::jsonb,   -- 押した銘柄 { 商品id: 本数 }
  sales      integer not null default 0,         -- 自分の客の売上（手入力ぶん）
  fine       integer not null default 0,         -- 罰金
  lend       integer not null default 0,         -- 前借り
  repay      integer not null default 0,         -- 返済
  paid_at    timestamptz,
  memo       text    not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, wid)
);
alter table nomiya_work add column if not exists amount jsonb not null default '{}'::jsonb;
alter table nomiya_work add column if not exists picks jsonb not null default '{}'::jsonb;
-- 渡したその時の額（あとで決め方を直しても、渡した記録が動かないように固める）
alter table nomiya_work add column if not exists paid_amount integer not null default 0;
create index if not exists idx_nomiya_work_acct_ymd on nomiya_work(account_id, ymd);
create index if not exists idx_nomiya_work_acct_staff on nomiya_work(account_id, staff_id, ymd);

-- ── RLS: 本人(account_id = auth.uid())の行だけ ────────────────────────
alter table nomiya_sales    enable row level security;
alter table nomiya_partners enable row level security;
alter table nomiya_settings enable row level security;
alter table nomiya_invoices enable row level security;
alter table nomiya_closes   enable row level security;
alter table nomiya_staff    enable row level security;
alter table nomiya_work     enable row level security;

drop policy if exists own_nomiya_sales on nomiya_sales;
create policy own_nomiya_sales on nomiya_sales for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_nomiya_partners on nomiya_partners;
create policy own_nomiya_partners on nomiya_partners for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_nomiya_invoices on nomiya_invoices;
create policy own_nomiya_invoices on nomiya_invoices for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_nomiya_closes on nomiya_closes;
create policy own_nomiya_closes on nomiya_closes for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_nomiya_staff on nomiya_staff;
create policy own_nomiya_staff on nomiya_staff for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_nomiya_work on nomiya_work;
create policy own_nomiya_work on nomiya_work for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_nomiya_settings on nomiya_settings;
create policy own_nomiya_settings on nomiya_settings for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- ── 確認用（適用後に SQL Editor で実行すると3行とも rowsecurity=true で返る） ──
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in
--     ('nomiya_sales','nomiya_partners','nomiya_settings','nomiya_invoices',
--      'nomiya_closes','nomiya_staff','nomiya_work');

-- ── 入金（ツケ・請求書送りの回収） ──────────────────────────────────
--   入金は1件ずつ記録して、古いツケから順に充てる（消込）。
--   充てた結果は持たない＝毎回アプリが計算する。入金を消せば充当もやり直される。
--   how = bank(振込・カード) / cash(現金で受け取った→レジの現金が増える)
create table if not exists nomiya_payments (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid        text not null,                      -- アプリが作るID
  ymd        date,                               -- 入金日
  name       text not null default '',           -- 相手（売上の名前と同じ）
  amount     integer not null default 0,
  how        text not null default 'bank',
  memo       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, pid)
);
create index if not exists idx_nomiya_payments_acct on nomiya_payments(account_id, name, ymd);

alter table nomiya_payments enable row level security;
drop policy if exists own_nomiya_payments on nomiya_payments;
create policy own_nomiya_payments on nomiya_payments for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());
