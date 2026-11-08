-- =====================================================================
-- Row Level Security: ingen bruker kan lese eller endre andres data.
-- (select auth.uid()) evalueres én gang per spørring i stedet for per rad.
-- =====================================================================

-- Anonyme (ikke innloggede) klienter skal ikke ha noen tilgang til tabellene.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'subcategories', 'import_batches', 'transactions',
    'budgets', 'budget_categories', 'savings_goals', 'goal_contributions',
    'categorization_rules', 'recurring_transactions', 'financial_insights'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end
$$;

-- profiles: nøklet på id i stedet for user_id.
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Ingen delete-policy: profilen slettes sammen med brukeren (cascade).
