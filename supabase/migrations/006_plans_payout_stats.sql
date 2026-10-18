-- Jalankan setelah 005. Aman dijalankan ulang.

-- ---------- Paket Free: maksimal 5 produk (Pro: tanpa batas) ----------
create or replace function public.enforce_product_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prof public.profiles; n int;
begin
  perform pg_advisory_xact_lock(hashtext(new.seller_id::text));
  select * into v_prof from public.profiles where id = new.seller_id;
  if public.effective_plan(v_prof) <> 'pro' then
    select count(*) into n from public.products where seller_id = new.seller_id;
    if n >= 5 then raise exception 'Paket Free maksimal 5 produk. Upgrade ke Pro untuk produk tanpa batas.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists products_limit on public.products;
create trigger products_limit before insert on public.products for each row execute function public.enforce_product_limit();

-- ---------- Rekening penarikan (payout) milik penjual ----------
alter table public.stores add column if not exists payout_bank text not null default '';
alter table public.stores add column if not exists payout_account text not null default '';
alter table public.stores add column if not exists payout_holder text not null default '';

-- ---------- Mode penarikan: 'demo' (tampilan/simulasi) atau 'xendit' (nanti) ----------
alter table public.settings add column if not exists payout_mode text not null default 'demo';
alter table public.settings drop constraint if exists settings_payout_mode_check;
alter table public.settings add constraint settings_payout_mode_check check (payout_mode in ('demo','xendit'));

-- Penarikan simulasi tidak memindahkan uang dan TIDAK menyentuh ledger
alter table public.withdrawals add column if not exists simulated boolean not null default false;

create or replace function public.payout_simulate(p_amount int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles; v_set public.settings; v_st public.stores;
  v_earned bigint; v_used bigint; v_id uuid;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  select * into v_set from public.settings where id = 1;
  if v_set.payout_mode <> 'demo' then raise exception 'Mode simulasi sedang tidak aktif.'; end if;
  select * into v_prof from public.profiles where id = v_uid for update;
  if v_prof.suspended then raise exception 'Akun dinonaktifkan.'; end if;
  select * into v_st from public.stores where user_id = v_uid;
  if not found or v_st.payout_account !~ '^[0-9]{6,20}$' or coalesce(trim(v_st.payout_bank), '') = '' or coalesce(trim(v_st.payout_holder), '') = ''
    then raise exception 'Isi rekening penarikan terlebih dahulu.'; end if;
  if p_amount < v_set.min_withdraw then raise exception 'Penarikan minimal Rp%.', v_set.min_withdraw; end if;
  select coalesce(sum(amount), 0) into v_earned from public.orders where seller_id = v_uid and status = 'paid';
  select coalesce(sum(amount), 0) into v_used from public.withdrawals where seller_id = v_uid and simulated and status = 'berhasil';
  if p_amount > v_earned - v_used then raise exception 'Saldo tidak mencukupi.'; end if;
  insert into public.withdrawals (seller_id, amount, fee, net, rate, bank, account, holder, status, simulated, processed_at)
  values (v_uid, p_amount, 0, p_amount, 0, v_st.payout_bank, v_st.payout_account, v_st.payout_holder, 'berhasil', true, now())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.payout_simulate(int) from public;
grant execute on function public.payout_simulate(int) to authenticated;
