-- =====================================================================
-- RPC-funksjoner. Alle (unntatt delete_my_account) kjører som innlogget
-- bruker (security invoker), så RLS gjelder fortsatt.
-- =====================================================================

-- Angre en import: sletter alle transaksjoner fra importen og markerer den som angret.
create or replace function public.undo_import_batch(p_batch_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  perform 1
    from public.import_batches
   where id = p_batch_id and user_id = (select auth.uid()) and status = 'imported'
     for update;
  if not found then
    raise exception 'Importen finnes ikke eller er allerede angret' using errcode = 'P0002';
  end if;

  with d as (
    delete from public.transactions
     where import_batch_id = p_batch_id and user_id = (select auth.uid())
    returning 1
  )
  select count(*) into v_deleted from d;

  update public.import_batches
     set status = 'undone', undone_at = now()
   where id = p_batch_id;

  return v_deleted;
end
$$;

-- Legg til (eller trekk fra, med negativt beløp) penger på et sparemål – atomisk.
create or replace function public.add_goal_contribution(
  p_goal_id uuid,
  p_amount  numeric,
  p_note    text default null,
  p_date    date default current_date
)
returns public.savings_goals
language plpgsql
set search_path = ''
as $$
declare
  g public.savings_goals;
  v_new numeric(14, 2);
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'Beløpet må være ulikt null' using errcode = '22023';
  end if;

  select * into g
    from public.savings_goals
   where id = p_goal_id and user_id = (select auth.uid())
     for update;
  if not found then
    raise exception 'Sparemålet finnes ikke' using errcode = 'P0002';
  end if;

  v_new := greatest(0, g.current_amount + p_amount);

  insert into public.goal_contributions (user_id, goal_id, amount, contributed_on, note)
  values ((select auth.uid()), p_goal_id, p_amount, coalesce(p_date, current_date), left(p_note, 200));

  update public.savings_goals
     set current_amount = v_new,
         completed_at   = case when v_new >= target_amount then coalesce(completed_at, now()) else null end
   where id = p_goal_id
  returning * into g;

  return g;
end
$$;

-- Slett alle transaksjoner og avledede data (importhistorikk, gjentakende, innsikter).
-- Kontoer, kategorier, regler, budsjetter og sparemål beholdes.
create or replace function public.delete_my_transactions()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with d as (
    delete from public.transactions where user_id = (select auth.uid()) returning 1
  )
  select count(*) into v_deleted from d;

  delete from public.import_batches        where user_id = (select auth.uid());
  delete from public.recurring_transactions where user_id = (select auth.uid());
  delete from public.financial_insights     where user_id = (select auth.uid());
  return v_deleted;
end
$$;

-- Fjern eksempeldata (demo-kontoer med transaksjoner, demo-sparemål og -budsjetter).
create or replace function public.delete_demo_data()
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.accounts      where user_id = (select auth.uid()) and is_demo;
  delete from public.savings_goals where user_id = (select auth.uid()) and is_demo;
  delete from public.budgets       where user_id = (select auth.uid()) and is_demo;
  -- Avledede data beregnes på nytt av appen.
  delete from public.recurring_transactions where user_id = (select auth.uid());
  delete from public.financial_insights     where user_id = (select auth.uid());
end
$$;

-- Slett hele brukerkontoen med alle data (cascade fra auth.users).
-- security definer: en vanlig bruker har ikke rett til å slette fra auth.users,
-- men funksjonen kan bare slette den innloggede brukeren selv.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Ikke innlogget' using errcode = '28000';
  end if;
  delete from auth.users where id = v_uid;
end
$$;

-- Tilgang: kun innloggede brukere kan kalle funksjonene.
revoke execute on function public.undo_import_batch(uuid)                         from public, anon;
revoke execute on function public.add_goal_contribution(uuid, numeric, text, date) from public, anon;
revoke execute on function public.delete_my_transactions()                        from public, anon;
revoke execute on function public.delete_demo_data()                              from public, anon;
revoke execute on function public.delete_my_account()                             from public, anon;

grant execute on function public.undo_import_batch(uuid)                          to authenticated;
grant execute on function public.add_goal_contribution(uuid, numeric, text, date) to authenticated;
grant execute on function public.delete_my_transactions()                         to authenticated;
grant execute on function public.delete_demo_data()                               to authenticated;
grant execute on function public.delete_my_account()                              to authenticated;

-- Triggerfunksjonene skal ikke kunne kalles direkte via API-et.
revoke execute on function public.handle_new_user()               from public, anon, authenticated;
revoke execute on function public.protect_transaction_originals() from public, anon, authenticated;
revoke execute on function public.set_updated_at()                from public, anon, authenticated;
