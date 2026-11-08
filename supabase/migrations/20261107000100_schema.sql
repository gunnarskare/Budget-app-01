-- =====================================================================
-- Budsjettapp – skjema
-- Alle økonomiske data tilhører én bruker (user_id). RLS aktiveres i neste
-- migrasjon. Fremmednøkler mellom brukerdata er sammensatte (id, user_id),
-- slik at en rad aldri kan peke på en annen brukers rad.
-- =====================================================================

-- ---------- hjelpefunksjoner ----------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- ---------- profiles (offentlig del av auth.users) ------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or char_length(display_name) <= 80),
  currency      text not null default 'NOK' check (currency ~ '^[A-Z]{3}$'),
  ai_enabled    boolean not null default true,
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Oppretter profil automatisk når en bruker registrerer seg.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), '')
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- accounts -------------------------------------------------

create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 80),
  bank                  text check (bank is null or char_length(bank) <= 60),
  -- Kun de siste 4 sifrene lagres (nok til å gjenkjenne konto ved import).
  account_number_last4  text check (account_number_last4 is null or account_number_last4 ~ '^[0-9]{4}$'),
  kind                  text not null default 'checking'
                        check (kind in ('checking', 'savings', 'credit', 'investment', 'cash')),
  currency              text not null default 'NOK' check (currency ~ '^[A-Z]{3}$'),
  opening_balance       numeric(14, 2) not null default 0,
  is_demo               boolean not null default false,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id)
);
create index accounts_user_idx on public.accounts (user_id);
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------- categories / subcategories ------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Stabil nøkkel for innebygde kategorier (brukes av butikkregister/nøkkelord). NULL for egne.
  system_key  text check (system_key is null or char_length(system_key) <= 60),
  name        text not null check (char_length(name) between 1 and 60),
  icon        text not null default 'tag' check (char_length(icon) <= 40),
  color       text not null default '#6250d6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  kind        text not null default 'expense' check (kind in ('expense', 'income')),
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, system_key)
);
create index categories_user_idx on public.categories (user_id, sort_order);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

create table public.subcategories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id  uuid not null,
  system_key   text check (system_key is null or char_length(system_key) <= 80),
  name         text not null check (char_length(name) between 1 and 60),
  -- Sparing/investering: regnes som sparing, ikke som forbruk.
  is_saving    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, system_key),
  unique (category_id, name),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);
create index subcategories_category_idx on public.subcategories (category_id);
create trigger subcategories_updated_at before update on public.subcategories
  for each row execute function public.set_updated_at();

-- ---------- import_batches ------------------------------------------

create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id      uuid not null,
  filename        text not null check (char_length(filename) <= 255),
  bank_profile    text check (bank_profile is null or char_length(bank_profile) <= 60),
  column_mapping  jsonb,
  row_count       integer not null default 0 check (row_count >= 0),
  imported_count  integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  skipped_count   integer not null default 0 check (skipped_count >= 0),
  date_from       date,
  date_to         date,
  status          text not null default 'imported' check (status in ('imported', 'undone')),
  undone_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);
create index import_batches_user_idx on public.import_batches (user_id, created_at desc);

-- ---------- transactions --------------------------------------------

create table public.transactions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id            uuid not null,
  import_batch_id       uuid,
  source                text not null default 'import' check (source in ('import', 'manual', 'demo')),
  booked_date           date not null,
  -- Originalen fra banken: kan ikke endres (se trigger under).
  original_description  text not null check (char_length(original_description) between 1 and 500),
  -- Visningsnavn: kan endres av bruker.
  description           text not null check (char_length(description) between 1 and 500),
  -- Normalisert nøkkel for læring/regler/historikk.
  merchant_key          text not null default '' check (char_length(merchant_key) <= 120),
  amount                numeric(14, 2) not null check (amount <> 0),
  currency              text not null default 'NOK' check (currency ~ '^[A-Z]{3}$'),
  balance_after         numeric(14, 2),
  bank_type             text check (bank_type is null or char_length(bank_type) <= 80),
  category_id           uuid,
  subcategory_id        uuid,
  category_source       text not null default 'default'
                        check (category_source in ('rule', 'history', 'merchant', 'keyword', 'ai', 'manual', 'default')),
  confidence            numeric(4, 3) not null default 0 check (confidence between 0 and 1),
  review_status         text not null default 'auto' check (review_status in ('auto', 'review', 'user')),
  transfer_status       text not null default 'none' check (transfer_status in ('none', 'suggested', 'confirmed')),
  transfer_pair_id      uuid,
  note                  text check (note is null or char_length(note) <= 1000),
  fingerprint           text not null check (char_length(fingerprint) between 8 and 128),
  occurrence            integer not null default 1 check (occurrence >= 1),
  raw                   jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, account_id, fingerprint, occurrence),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (import_batch_id, user_id) references public.import_batches (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete set null (category_id),
  foreign key (subcategory_id, user_id) references public.subcategories (id, user_id)
    on delete set null (subcategory_id),
  foreign key (transfer_pair_id, user_id) references public.transactions (id, user_id)
    on delete set null (transfer_pair_id)
);
create index transactions_user_date_idx     on public.transactions (user_id, booked_date desc, id);
create index transactions_user_category_idx on public.transactions (user_id, category_id, booked_date);
create index transactions_user_merchant_idx on public.transactions (user_id, merchant_key);
create index transactions_account_idx       on public.transactions (account_id, booked_date);
create index transactions_batch_idx         on public.transactions (import_batch_id);
create index transactions_review_idx        on public.transactions (user_id, booked_date desc) where review_status = 'review';

-- Originaldata fra bank skal ikke kunne endres – verken via appen eller API-et.
create or replace function public.protect_transaction_originals()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source in ('import', 'demo') and (
       new.source                is distinct from old.source
    or new.original_description  is distinct from old.original_description
    or new.amount                is distinct from old.amount
    or new.booked_date           is distinct from old.booked_date
    or new.account_id            is distinct from old.account_id
    or new.currency              is distinct from old.currency
    or new.raw                   is distinct from old.raw
    or new.fingerprint           is distinct from old.fingerprint
    or new.occurrence            is distinct from old.occurrence
  ) then
    raise exception 'Originaldata fra banken kan ikke endres'
      using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end
$$;

create trigger transactions_protect_originals before update on public.transactions
  for each row execute function public.protect_transaction_originals();

-- ---------- budgets --------------------------------------------------

create table public.budgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_type     text not null default 'month' check (period_type in ('month', 'week')),
  -- Måned: første dag i måneden. Uke: mandag.
  period_start    date not null,
  planned_income  numeric(14, 2) check (planned_income is null or planned_income >= 0),
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, period_type, period_start),
  check (
    (period_type = 'month' and extract(day from period_start) = 1) or
    (period_type = 'week'  and extract(isodow from period_start) = 1)
  )
);
create trigger budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

create table public.budget_categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  budget_id    uuid not null,
  category_id  uuid not null,
  amount       numeric(14, 2) not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (budget_id, category_id),
  foreign key (budget_id, user_id)   references public.budgets (id, user_id)    on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);
create index budget_categories_user_idx on public.budget_categories (user_id, budget_id);
create trigger budget_categories_updated_at before update on public.budget_categories
  for each row execute function public.set_updated_at();

-- ---------- savings_goals -------------------------------------------

create table public.savings_goals (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 80),
  icon                  text not null default 'piggy-bank' check (char_length(icon) <= 40),
  color                 text not null default '#6250d6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  target_amount         numeric(14, 2) not null check (target_amount > 0),
  current_amount        numeric(14, 2) not null default 0 check (current_amount >= 0),
  target_date           date,
  monthly_contribution  numeric(14, 2) not null default 0 check (monthly_contribution >= 0),
  is_demo               boolean not null default false,
  completed_at          timestamptz,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id)
);
create index savings_goals_user_idx on public.savings_goals (user_id, created_at);
create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();

create table public.goal_contributions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id         uuid not null,
  amount          numeric(14, 2) not null check (amount <> 0),
  contributed_on  date not null default current_date,
  note            text check (note is null or char_length(note) <= 200),
  created_at      timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id, contributed_on desc);

-- ---------- categorization_rules ------------------------------------

create table public.categorization_rules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Normalisert (små bokstaver) tekst som sammenlignes med renset beskrivelse.
  pattern         text not null check (char_length(pattern) between 2 and 80),
  match_type      text not null default 'contains' check (match_type in ('contains', 'equals', 'starts_with')),
  direction       text not null default 'any' check (direction in ('any', 'in', 'out')),
  category_id     uuid,
  subcategory_id  uuid,
  mark_transfer   boolean not null default false,
  source          text not null default 'user' check (source in ('user', 'learned')),
  priority        integer not null default 100,
  hit_count       integer not null default 0 check (hit_count >= 0),
  last_hit_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, match_type, pattern, direction),
  check (category_id is not null or mark_transfer),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade,
  foreign key (subcategory_id, user_id) references public.subcategories (id, user_id)
    on delete set null (subcategory_id)
);
create index categorization_rules_user_idx on public.categorization_rules (user_id, priority);
create trigger categorization_rules_updated_at before update on public.categorization_rules
  for each row execute function public.set_updated_at();

-- ---------- recurring_transactions ----------------------------------

create table public.recurring_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant_key    text not null check (char_length(merchant_key) between 1 and 120),
  display_name    text not null check (char_length(display_name) between 1 and 200),
  category_id     uuid,
  subcategory_id  uuid,
  -- Typisk beløp med fortegn (negativt = utgift).
  typical_amount  numeric(14, 2) not null,
  frequency       text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  occurrences     integer not null default 0 check (occurrences >= 0),
  first_seen      date,
  last_seen       date,
  next_expected   date,
  is_subscription boolean not null default false,
  status          text not null default 'active' check (status in ('active', 'ignored', 'ended')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, merchant_key),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete set null (category_id),
  foreign key (subcategory_id, user_id) references public.subcategories (id, user_id)
    on delete set null (subcategory_id)
);
create index recurring_user_idx on public.recurring_transactions (user_id, status);
create trigger recurring_updated_at before update on public.recurring_transactions
  for each row execute function public.set_updated_at();

-- ---------- financial_insights --------------------------------------

create table public.financial_insights (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Stabil nøkkel (f.eks. 'food_trend:2026-11'): sørger for at avviste innsikter ikke dukker opp igjen.
  insight_key   text not null check (char_length(insight_key) <= 120),
  kind          text not null check (char_length(kind) <= 40),
  severity      text not null default 'info' check (severity in ('good', 'info', 'warn', 'bad')),
  confidence    text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  period        date,
  title         text not null check (char_length(title) <= 200),
  body          text not null check (char_length(body) <= 600),
  data          jsonb,
  sort_order    integer not null default 0,
  dismissed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, insight_key)
);
create index financial_insights_user_idx on public.financial_insights (user_id, dismissed_at, sort_order);
