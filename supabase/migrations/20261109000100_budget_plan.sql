-- =====================================================================
-- Budsjettplan: budsjettet kan bygges opp fra poster (inntekt, utgift, sparing)
-- i stedet for bare å utledes av tidligere forbruk.
--
--  * budget_plan_items – brukerens «plan»: hver post har beløp og frekvens
--    (uke/måned/kvartal/år), og regnes om til månedsbeløp i appen.
--  * budgets.planned_saving – planlagt sparing i en periode (øyeblikksbilde
--    sammen med planned_income og kategorilinjene).
-- =====================================================================

alter table public.budgets
  add column planned_saving numeric(14, 2)
  check (planned_saving is null or planned_saving >= 0);

create table public.budget_plan_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('income', 'expense', 'saving')),
  -- Faste utgifter (avtalt beløp) eller variable (en ramme å holde seg innenfor).
  nature          text not null default 'variable' check (nature in ('fixed', 'variable')),
  -- Stabil nøkkel for forslagsradene i veiviseren, f.eks. «bolig.husleie». NULL for egne poster.
  slot            text check (slot is null or char_length(slot) <= 60),
  name            text not null check (char_length(name) between 1 and 80),
  category_id     uuid,
  subcategory_id  uuid,
  amount          numeric(14, 2) not null check (amount >= 0 and amount <= 99999999),
  frequency       text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  check (kind <> 'expense' or category_id is not null),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade,
  foreign key (subcategory_id, user_id) references public.subcategories (id, user_id)
    on delete set null (subcategory_id)
);

create unique index budget_plan_items_slot_idx     on public.budget_plan_items (user_id, slot) where slot is not null;
create index        budget_plan_items_user_idx     on public.budget_plan_items (user_id, kind, sort_order);
create index        budget_plan_items_category_idx on public.budget_plan_items (category_id, user_id);

create trigger budget_plan_items_updated_at before update on public.budget_plan_items
  for each row execute function public.set_updated_at();

-- Row Level Security (samme mønster som øvrige brukerdata)
revoke all on public.budget_plan_items from anon;

alter table public.budget_plan_items enable row level security;
alter table public.budget_plan_items force row level security;

create policy budget_plan_items_select_own on public.budget_plan_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy budget_plan_items_insert_own on public.budget_plan_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy budget_plan_items_update_own on public.budget_plan_items
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy budget_plan_items_delete_own on public.budget_plan_items
  for delete to authenticated using (user_id = (select auth.uid()));
