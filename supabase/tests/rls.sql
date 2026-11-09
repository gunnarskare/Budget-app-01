-- =====================================================================
-- RLS- og funksjonstest. Kjøres med psql mot en database der
-- local_auth_stub.sql og alle migrasjoner allerede er anvendt (se run-local.sh).
-- Stopper ved første feil (ON_ERROR_STOP).
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.assert(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'TEST FEILET: %', msg;
  end if;
  raise notice 'ok  - %', msg;
end $$;

-- Hjelper: kjør som bruker
create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.no', '{"display_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.no', '{}');

select pg_temp.assert((select count(*) from public.profiles) = 2, 'profil opprettes automatisk ved registrering');
select pg_temp.assert((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice', 'display_name hentes fra metadata');

-- ----------------------------- som Alice ----------------------------
set role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

insert into public.accounts (id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Brukskonto');
insert into public.categories (id, name, system_key) values ('cccccccc-0000-0000-0000-000000000001', 'Dagligvarer', 'dagligvarer');
insert into public.import_batches (id, account_id, filename) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'test.csv');
insert into public.transactions
  (id, account_id, import_batch_id, booked_date, original_description, description, amount, category_id, fingerprint, occurrence)
values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   '2026-11-01', 'REMA 1000 SENTRUM', 'REMA 1000 SENTRUM', -845.00, 'cccccccc-0000-0000-0000-000000000001', 'fp-1-abcdefgh', 1),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   '2026-11-02', 'KIWI 505', 'KIWI 505', -320.00, 'cccccccc-0000-0000-0000-000000000001', 'fp-2-abcdefgh', 1);

select pg_temp.assert((select count(*) from public.transactions) = 2, 'Alice ser sine egne transaksjoner (user_id settes av default auth.uid())');
select pg_temp.assert((select user_id from public.transactions limit 1) = '11111111-1111-1111-1111-111111111111', 'user_id = auth.uid()');

-- Duplikat (samme fingerprint + occurrence) avvises
do $$
begin
  insert into public.transactions (account_id, booked_date, original_description, description, amount, fingerprint, occurrence)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-11-01', 'REMA 1000 SENTRUM', 'REMA', -845.00, 'fp-1-abcdefgh', 1);
  raise exception 'skulle feilet';
exception when unique_violation then
  perform pg_temp.assert(true, 'duplikat (fingerprint+occurrence) avvises av unik indeks');
end $$;

-- Originaldata kan ikke endres, men kategori kan
do $$
begin
  update public.transactions set amount = -1 where id = 'dddddddd-0000-0000-0000-000000000001';
  raise exception 'skulle feilet';
exception when insufficient_privilege then
  perform pg_temp.assert(true, 'beløp på importert transaksjon kan ikke endres');
end $$;
do $$
begin
  update public.transactions set original_description = 'x' where id = 'dddddddd-0000-0000-0000-000000000001';
  raise exception 'skulle feilet';
exception when insufficient_privilege then
  perform pg_temp.assert(true, 'originalbeskrivelse kan ikke endres');
end $$;
update public.transactions set description = 'Rema', review_status = 'user', note = 'ok' where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.assert((select description from public.transactions where id = 'dddddddd-0000-0000-0000-000000000001') = 'Rema', 'visningsnavn og kategori kan endres');

-- Kan ikke opprette rad på vegne av en annen bruker
do $$
begin
  insert into public.accounts (user_id, name) values ('22222222-2222-2222-2222-222222222222', 'Snik');
  raise exception 'skulle feilet';
exception when insufficient_privilege then
  perform pg_temp.assert(true, 'kan ikke sette inn rad med annen brukers user_id (RLS with check)');
end $$;

-- Budsjett-sjekk: måned må starte den 1.
do $$
begin
  insert into public.budgets (period_type, period_start) values ('month', '2026-11-15');
  raise exception 'skulle feilet';
exception when check_violation then
  perform pg_temp.assert(true, 'månedsbudsjett må starte den 1.');
end $$;
insert into public.budgets (id, period_type, period_start) values ('eeeeeeee-0000-0000-0000-000000000001', 'month', '2026-11-01');
insert into public.budget_categories (budget_id, category_id, amount)
  values ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 8000);

-- Budsjettplan: poster med frekvens + planlagt sparing
update public.budgets set planned_saving = 6000 where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.assert((select planned_saving from public.budgets) = 6000, 'planlagt sparing lagres på budsjettet');
insert into public.budget_plan_items (id, kind, nature, slot, name, category_id, amount, frequency)
  values ('99999999-0000-0000-0000-000000000001', 'expense', 'variable', 'var.dagligvarer', 'Mat og dagligvarer', 'cccccccc-0000-0000-0000-000000000001', 1500, 'weekly');
select pg_temp.assert((select count(*) from public.budget_plan_items) = 1, 'Alice ser sin egen budsjettpost (user_id settes av default)');
do $$
begin
  insert into public.budget_plan_items (kind, nature, slot, name, category_id, amount)
  values ('expense', 'variable', 'var.dagligvarer', 'Dobbel', 'cccccccc-0000-0000-0000-000000000001', 100);
  raise exception 'skulle feilet';
exception when unique_violation then
  perform pg_temp.assert(true, 'samme forslagsrad (slot) kan bare brukes én gang per bruker');
end $$;
do $$
begin
  insert into public.budget_plan_items (kind, name, amount) values ('expense', 'Uten kategori', 100);
  raise exception 'skulle feilet';
exception when check_violation then
  perform pg_temp.assert(true, 'utgiftspost må ha kategori');
end $$;
do $$
begin
  insert into public.budget_plan_items (kind, name, amount, frequency) values ('income', 'Lønn', 100, 'daily');
  raise exception 'skulle feilet';
exception when check_violation then
  perform pg_temp.assert(true, 'ugyldig frekvens avvises');
end $$;
do $$
begin
  insert into public.budget_plan_items (kind, name, amount) values ('saving', 'Negativ', -5);
  raise exception 'skulle feilet';
exception when check_violation then
  perform pg_temp.assert(true, 'negativt beløp avvises');
end $$;
insert into public.budget_plan_items (kind, nature, slot, name, amount) values ('income', 'fixed', 'inntekter.lonn', 'Lønn etter skatt', 38000);

-- Sparemål + atomisk innskudd
insert into public.savings_goals (id, name, target_amount) values ('ffffffff-0000-0000-0000-000000000001', 'Ferie', 10000);
select pg_temp.assert((select current_amount from public.add_goal_contribution('ffffffff-0000-0000-0000-000000000001', 4000)) = 4000, 'innskudd øker current_amount');
select pg_temp.assert((select completed_at is null from public.savings_goals), 'mål ikke fullført ved 40 %');
select pg_temp.assert((select completed_at is not null from public.add_goal_contribution('ffffffff-0000-0000-0000-000000000001', 7000)), 'mål fullføres når målsum nås');
select pg_temp.assert((select count(*) from public.goal_contributions) = 2, 'innskudd logges');

-- ----------------------------- som Bob ------------------------------
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select pg_temp.assert((select count(*) from public.transactions) = 0, 'Bob ser ingen av Alices transaksjoner');
select pg_temp.assert((select count(*) from public.accounts) = 0, 'Bob ser ingen av Alices kontoer');
select pg_temp.assert((select count(*) from public.categories) = 0, 'Bob ser ingen av Alices kategorier');
select pg_temp.assert((select count(*) from public.budgets) = 0, 'Bob ser ingen av Alices budsjetter');
select pg_temp.assert((select count(*) from public.savings_goals) = 0, 'Bob ser ingen av Alices sparemål');
select pg_temp.assert((select count(*) from public.budget_plan_items) = 0, 'Bob ser ingen av Alices budsjettposter');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'Bob ser kun sin egen profil');

with u as (update public.transactions set note = 'hacked' returning 1) select pg_temp.assert((select count(*) from u) = 0, 'Bob kan ikke oppdatere Alices transaksjoner');
with d as (delete from public.transactions returning 1) select pg_temp.assert((select count(*) from d) = 0, 'Bob kan ikke slette Alices transaksjoner');

with u as (update public.budget_plan_items set amount = 1 returning 1) select pg_temp.assert((select count(*) from u) = 0, 'Bob kan ikke endre Alices budsjettposter');
with d as (delete from public.budget_plan_items returning 1) select pg_temp.assert((select count(*) from d) = 0, 'Bob kan ikke slette Alices budsjettposter');
do $$
begin
  insert into public.budget_plan_items (kind, name, category_id, amount)
  values ('expense', 'Snik', 'cccccccc-0000-0000-0000-000000000001', 1);
  raise exception 'skulle feilet';
exception when foreign_key_violation then
  perform pg_temp.assert(true, 'kan ikke knytte budsjettpost til annen brukers kategori (sammensatt FK)');
end $$;

-- Bob prøver å henge en transaksjon på Alices konto (sammensatt FK stopper det)
do $$
begin
  insert into public.transactions (account_id, booked_date, original_description, description, amount, fingerprint)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-11-03', 'X', 'X', -1, 'fp-bob-abcdefgh');
  raise exception 'skulle feilet';
exception when foreign_key_violation then
  perform pg_temp.assert(true, 'kan ikke knytte transaksjon til annen brukers konto (sammensatt FK)');
end $$;

do $$
begin
  perform public.undo_import_batch('bbbbbbbb-0000-0000-0000-000000000001');
  raise exception 'skulle feilet';
exception when no_data_found or sqlstate 'P0002' then
  perform pg_temp.assert(true, 'Bob kan ikke angre Alices import');
end $$;
do $$
begin
  perform public.add_goal_contribution('ffffffff-0000-0000-0000-000000000001', 1);
  raise exception 'skulle feilet';
exception when sqlstate 'P0002' then
  perform pg_temp.assert(true, 'Bob kan ikke sette inn på Alices sparemål');
end $$;

-- ----------------------------- anon ---------------------------------
reset role;
set role anon;
do $$
begin
  perform count(*) from public.transactions;
  raise exception 'skulle feilet';
exception when insufficient_privilege then
  perform pg_temp.assert(true, 'anon har ikke tilgang til transaksjoner');
end $$;
do $$
begin
  perform count(*) from public.budget_plan_items;
  raise exception 'skulle feilet';
exception when insufficient_privilege then
  perform pg_temp.assert(true, 'anon har ikke tilgang til budsjettposter');
end $$;
do $$
begin
  perform public.delete_my_account();
  raise exception 'skulle feilet';
exception when insufficient_privilege then
  perform pg_temp.assert(true, 'anon kan ikke kalle delete_my_account');
end $$;

-- ----------------------------- Alice igjen --------------------------
reset role;
set role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select pg_temp.assert(public.undo_import_batch('bbbbbbbb-0000-0000-0000-000000000001') = 2, 'angre import sletter 2 transaksjoner');
select pg_temp.assert((select count(*) from public.transactions) = 0, 'ingen transaksjoner igjen etter angring');
select pg_temp.assert((select status from public.import_batches) = 'undone', 'import markeres som angret');
do $$
begin
  perform public.undo_import_batch('bbbbbbbb-0000-0000-0000-000000000001');
  raise exception 'skulle feilet';
exception when sqlstate 'P0002' then
  perform pg_temp.assert(true, 'kan ikke angre samme import to ganger');
end $$;

-- Demo-data
insert into public.accounts (id, name, is_demo) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Demo', true);
insert into public.savings_goals (name, target_amount, is_demo) values ('Demo-mål', 5000, true);
select public.delete_demo_data();
select pg_temp.assert((select count(*) from public.accounts where is_demo) = 0, 'delete_demo_data fjerner demo-kontoer');
select pg_temp.assert((select count(*) from public.accounts) = 1, '… men beholder ekte kontoer');
select pg_temp.assert((select count(*) from public.savings_goals) = 1, '… og ekte sparemål');

-- Slett konto: alt forsvinner for Alice, men ikke for Bob
select public.delete_my_account();
reset role;
select pg_temp.assert((select count(*) from auth.users) = 1, 'delete_my_account sletter bare Alice');
select pg_temp.assert((select count(*) from public.accounts) = 0, 'cascade: kontoer slettet');
select pg_temp.assert((select count(*) from public.categories) = 0, 'cascade: kategorier slettet');
select pg_temp.assert((select count(*) from public.budget_plan_items) = 0, 'cascade: budsjettposter slettet');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'cascade: Alices profil slettet, Bobs beholdt');

\echo
\echo 'ALLE TESTER BESTÅTT'
