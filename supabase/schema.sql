-- =====================================================================
-- Evegrow - skema database Supabase (jalankan sekali di SQL Editor)
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Tabel ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  fee_free numeric not null default 0.05,
  fee_pro numeric not null default 0.02,
  pro_price int not null default 49000,
  min_withdraw int not null default 50000
);
insert into public.settings default values on conflict do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'seller' check (role in ('seller','admin')),
  plan text not null default 'free' check (plan in ('free','pro')),
  plan_expires_at timestamptz,            -- null + plan 'pro' = Pro tanpa batas (diatur admin)
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.stores (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  name text not null,
  bio text not null default '',
  color text not null default '#7C3AED',
  socials jsonb not null default '{}'::jsonb,
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_.]{3,30}$'),
  constraint username_reserved check (username not in ('dashboard','admin','login','register','api','pesanan','checkout','_next','favicon.ico','logo.png'))
);
create unique index stores_username_key on public.stores (lower(username));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type text not null default 'Lainnya',
  description text not null default '',
  price int not null check (price >= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.products (seller_id);

-- File produk dipisah supaya TIDAK ikut terbaca publik
create table public.product_files (
  product_id uuid primary key references public.products(id) on delete cascade,
  file_url text not null            -- tautan https, atau path di bucket 'product-files'
);

create table public.orders (
  id text primary key default ('LK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))),
  seller_id uuid not null references public.profiles(id),
  product_id uuid references public.products(id) on delete restrict,
  product_name text not null,
  buyer_name text not null,
  buyer_email text not null,
  amount int not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','expired')),
  invoice_id text,
  access_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  buyer_emailed_at timestamptz,
  seller_notified_at timestamptz
);
create index on public.orders (seller_id, created_at);

create table public.visits (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  source text not null default 'Langsung',
  created_at timestamptz not null default now()
);
create index on public.visits (seller_id, created_at);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  amount int not null check (amount > 0),
  fee int not null,
  net int not null,
  rate numeric not null,
  bank text not null,
  account text not null,
  holder text not null,
  status text not null default 'diproses' check (status in ('diproses','berhasil','ditolak')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index on public.withdrawals (seller_id, created_at);

-- Buku besar saldo: setiap perubahan saldo tercatat di sini (positif = masuk, negatif = keluar)
create table public.ledger (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('sale','withdrawal','withdrawal_refund')),
  amount int not null,
  ref text not null,
  created_at timestamptz not null default now(),
  unique (kind, ref)                 -- mencegah pencatatan ganda
);
create index on public.ledger (seller_id);

create table public.pro_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  external_id text not null unique,
  invoice_id text,
  amount int not null,
  status text not null default 'pending' check (status in ('pending','paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- ---------- Fungsi bantu ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not suspended)
$$;

create or replace function public.effective_plan(p public.profiles) returns text
language sql stable as $$
  select case when p.plan = 'pro' and (p.plan_expires_at is null or p.plan_expires_at > now()) then 'pro' else 'free' end
$$;

-- Membuat profil + toko otomatis saat pengguna mendaftar
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1));
  v_user text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  insert into public.profiles (id, name, email) values (new.id, v_name, new.email);
  insert into public.stores (user_id, username, name) values (new.id, v_user, v_name);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select p ~ '^[a-z0-9_.]{3,30}$'
     and p not in ('dashboard','admin','login','register','api','pesanan','checkout','_next','favicon.ico','logo.png')
     and not exists (select 1 from public.stores where lower(username) = lower(p))
$$;

-- ---------- Tampilan publik (hanya kolom yang aman) ----------
create or replace view public.public_stores as
  select s.user_id, s.username, s.name, s.bio, s.color, s.socials, s.links,
         public.effective_plan(p) = 'pro' as is_pro
  from public.stores s join public.profiles p on p.id = s.user_id
  where not p.suspended;

create or replace view public.public_products as
  select pr.id, pr.seller_id, pr.name, pr.type, pr.description, pr.price
  from public.products pr join public.profiles p on p.id = pr.seller_id
  where pr.active and not p.suspended;

grant select on public.public_stores, public.public_products to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.settings      enable row level security;
alter table public.profiles      enable row level security;
alter table public.stores        enable row level security;
alter table public.products      enable row level security;
alter table public.product_files enable row level security;
alter table public.orders        enable row level security;
alter table public.visits        enable row level security;
alter table public.withdrawals   enable row level security;
alter table public.ledger        enable row level security;
alter table public.pro_payments  enable row level security;

create policy settings_read   on public.settings for select using (true);
create policy settings_admin  on public.settings for update using (public.is_admin()) with check (public.is_admin());

create policy profiles_read   on public.profiles for select using (id = auth.uid() or public.is_admin());

create policy stores_read     on public.stores for select using (user_id = auth.uid() or public.is_admin());
create policy stores_update   on public.stores for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy products_read   on public.products for select using (seller_id = auth.uid() or public.is_admin());
create policy products_insert on public.products for insert with check (seller_id = auth.uid());
create policy products_update on public.products for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy products_delete on public.products for delete using (seller_id = auth.uid());

create policy pfiles_all on public.product_files for all
  using (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()))
  with check (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()));

create policy orders_read      on public.orders      for select using (seller_id = auth.uid() or public.is_admin());
create policy visits_read      on public.visits      for select using (seller_id = auth.uid() or public.is_admin());
create policy withdrawals_read on public.withdrawals for select using (seller_id = auth.uid() or public.is_admin());
create policy ledger_read      on public.ledger      for select using (seller_id = auth.uid() or public.is_admin());
create policy propay_read      on public.pro_payments for select using (user_id = auth.uid() or public.is_admin());
-- Tidak ada policy insert/update/delete untuk orders, visits, withdrawals, ledger, profiles:
-- semua perubahan lewat fungsi di bawah atau server (service role).

-- ---------- Fungsi transaksi ----------
create or replace function public.record_visit(p_seller uuid, p_product uuid, p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.stores where user_id = p_seller) then return; end if;
  if p_product is not null and not exists (select 1 from public.products where id = p_product and seller_id = p_seller) then p_product := null; end if;
  insert into public.visits (seller_id, product_id, source)
  values (p_seller, p_product, left(coalesce(nullif(trim(p_source), ''), 'Langsung'), 30));
end $$;

-- Penarikan: dikunci per kreator supaya tidak bisa ditarik ganda
create or replace function public.request_withdrawal(p_amount int, p_bank text, p_account text, p_holder text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles;
  v_set public.settings;
  v_bal bigint; v_rate numeric; v_fee int; v_id uuid;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  select * into v_prof from public.profiles where id = v_uid for update;
  if v_prof.suspended then raise exception 'Akun dinonaktifkan.'; end if;
  select * into v_set from public.settings where id = 1;
  if p_amount < v_set.min_withdraw then raise exception 'Penarikan minimal Rp%.', v_set.min_withdraw; end if;
  if p_account !~ '^[0-9]{6,20}$' then raise exception 'Nomor rekening harus 6-20 digit angka.'; end if;
  if coalesce(trim(p_bank), '') = '' or coalesce(trim(p_holder), '') = '' then raise exception 'Data rekening belum lengkap.'; end if;
  select coalesce(sum(amount), 0) into v_bal from public.ledger where seller_id = v_uid;
  if p_amount > v_bal then raise exception 'Saldo tidak mencukupi.'; end if;
  v_rate := case when public.effective_plan(v_prof) = 'pro' then v_set.fee_pro else v_set.fee_free end;
  v_fee := round(p_amount * v_rate);
  insert into public.withdrawals (seller_id, amount, fee, net, rate, bank, account, holder)
  values (v_uid, p_amount, v_fee, p_amount - v_fee, v_rate, trim(p_bank), p_account, trim(p_holder))
  returning id into v_id;
  insert into public.ledger (seller_id, kind, amount, ref) values (v_uid, 'withdrawal', -p_amount, v_id::text);
  return v_id;
end $$;

create or replace function public.admin_set_withdrawal(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare w public.withdrawals;
begin
  if not public.is_admin() then raise exception 'Hanya admin.'; end if;
  if p_status not in ('berhasil', 'ditolak') then raise exception 'Status tidak valid.'; end if;
  select * into w from public.withdrawals where id = p_id for update;
  if not found then raise exception 'Penarikan tidak ditemukan.'; end if;
  if w.status <> 'diproses' then raise exception 'Penarikan ini sudah diproses.'; end if;
  update public.withdrawals set status = p_status, processed_at = now() where id = p_id;
  if p_status = 'ditolak' then
    insert into public.ledger (seller_id, kind, amount, ref) values (w.seller_id, 'withdrawal_refund', w.amount, w.id::text);
  end if;
end $$;

create or replace function public.admin_set_plan(p_user uuid, p_plan text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin.'; end if;
  if p_plan not in ('free', 'pro') then raise exception 'Paket tidak valid.'; end if;
  update public.profiles set plan = p_plan, plan_expires_at = null where id = p_user;
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin.'; end if;
  if p_user = auth.uid() then raise exception 'Tidak bisa menonaktifkan akun sendiri.'; end if;
  update public.profiles set suspended = p_value where id = p_user;
end $$;

-- Hanya server (service role) yang boleh memanggil dua fungsi ini
create or replace function public.mark_order_paid(p_order text, p_invoice text, p_amount int) returns boolean
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then return false; end if;
  if o.status = 'paid' then return true; end if;
  if o.amount <> p_amount then raise exception 'Nominal pembayaran tidak cocok.'; end if;
  update public.orders set status = 'paid', paid_at = now(), invoice_id = coalesce(p_invoice, invoice_id) where id = p_order;
  insert into public.ledger (seller_id, kind, amount, ref) values (o.seller_id, 'sale', o.amount, o.id) on conflict (kind, ref) do nothing;
  return true;
end $$;

create or replace function public.activate_pro(p_external text, p_invoice text, p_amount int) returns boolean
language plpgsql security definer set search_path = public as $$
declare pp public.pro_payments; pr public.profiles;
begin
  select * into pp from public.pro_payments where external_id = p_external for update;
  if not found then return false; end if;
  if pp.status = 'paid' then return true; end if;
  if pp.amount <> p_amount then raise exception 'Nominal pembayaran tidak cocok.'; end if;
  update public.pro_payments set status = 'paid', paid_at = now(), invoice_id = coalesce(p_invoice, invoice_id) where id = pp.id;
  select * into pr from public.profiles where id = pp.user_id for update;
  if not (pr.plan = 'pro' and pr.plan_expires_at is null) then
    update public.profiles set plan = 'pro',
      plan_expires_at = greatest(coalesce(pr.plan_expires_at, now()), now()) + interval '30 days'
    where id = pr.id;
  end if;
  return true;
end $$;

-- Atur siapa yang boleh memanggil fungsi
revoke execute on function public.record_visit(uuid, uuid, text)        from public;
revoke execute on function public.request_withdrawal(int, text, text, text) from public;
revoke execute on function public.admin_set_withdrawal(uuid, text)      from public;
revoke execute on function public.admin_set_plan(uuid, text)            from public;
revoke execute on function public.admin_set_suspended(uuid, boolean)    from public;
revoke execute on function public.mark_order_paid(text, text, int)      from public;
revoke execute on function public.activate_pro(text, text, int)         from public;
revoke execute on function public.username_available(text)              from public;

grant execute on function public.record_visit(uuid, uuid, text)         to anon, authenticated;
grant execute on function public.username_available(text)               to anon, authenticated;
grant execute on function public.request_withdrawal(int, text, text, text) to authenticated;
grant execute on function public.admin_set_withdrawal(uuid, text)       to authenticated;
grant execute on function public.admin_set_plan(uuid, text)             to authenticated;
grant execute on function public.admin_set_suspended(uuid, boolean)     to authenticated;
grant execute on function public.mark_order_paid(text, text, int)       to service_role;
grant execute on function public.activate_pro(text, text, int)          to service_role;

-- ---------- Penyimpanan file produk (privat) ----------
insert into storage.buckets (id, name, public) values ('product-files', 'product-files', false) on conflict do nothing;

create policy "kreator unggah file sendiri" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kreator baca file sendiri" on storage.objects for select to authenticated
  using (bucket_id = 'product-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kreator hapus file sendiri" on storage.objects for delete to authenticated
  using (bucket_id = 'product-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Menjadikan seseorang admin (jalankan manual, ganti emailnya) ----------
-- update public.profiles set role = 'admin' where email = 'emailkamu@contoh.com';
