-- Jalankan SETELAH schema.sql (dan 002_email.sql bila perlu). Aman dijalankan ulang.

-- ---------- Produk: foto cover, landing, kode HTML, harga diskon, tampilan ----------
alter table public.products add column if not exists discount_price int;
alter table public.products add column if not exists cover_url text not null default '';
alter table public.products add column if not exists landing_url text not null default '';
alter table public.products add column if not exists html_code text not null default '';
alter table public.products add column if not exists delivery text not null default 'link';
alter table public.products add column if not exists card_size text not null default 'large';

alter table public.products drop constraint if exists products_delivery_check;
alter table public.products add constraint products_delivery_check check (delivery in ('link','pdf'));
alter table public.products drop constraint if exists products_card_size_check;
alter table public.products add constraint products_card_size_check check (card_size in ('large','small','tiny'));
alter table public.products drop constraint if exists products_discount_check;
alter table public.products add constraint products_discount_check check (discount_price is null or (discount_price >= 1000 and discount_price < price));
alter table public.products drop constraint if exists products_html_len;
alter table public.products add constraint products_html_len check (char_length(html_code) <= 50000);

-- Kolom baru hanya boleh ditambah di AKHIR view
create or replace view public.public_products as
  select pr.id, pr.seller_id, pr.name, pr.type, pr.description, pr.price,
         pr.discount_price, pr.cover_url, pr.landing_url, pr.html_code, pr.delivery, pr.card_size
  from public.products pr join public.profiles p on p.id = pr.seller_id
  where pr.active and not p.suspended;
grant select on public.public_products to anon, authenticated;

-- ---------- Toko: rekening dan QRIS milik penjual ----------
-- Sengaja TIDAK dimasukkan ke view publik. Hanya dikirim ke pembeli yang sudah membuat pesanan.
alter table public.stores add column if not exists pay_bank text not null default '';
alter table public.stores add column if not exists pay_account text not null default '';
alter table public.stores add column if not exists pay_holder text not null default '';
alter table public.stores add column if not exists pay_qris_url text not null default '';

-- ---------- Pesanan: mode pembayaran, no HP, klaim pembeli ----------
alter table public.orders add column if not exists payment_mode text not null default 'xendit';
alter table public.orders add column if not exists buyer_phone text;
alter table public.orders add column if not exists buyer_claimed_at timestamptz;
alter table public.orders add column if not exists buyer_note text;

alter table public.orders drop constraint if exists orders_payment_mode_check;
alter table public.orders add constraint orders_payment_mode_check check (payment_mode in ('xendit','manual'));
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending','paid','expired','rejected'));

-- Pesanan manual: uang masuk LANGSUNG ke rekening penjual, jadi TIDAK dicatat di ledger.
-- (Kalau dicatat, penjual bisa menarik saldo platform untuk uang yang tidak pernah diterima platform.)
create or replace function public.mark_order_manual(p_order text, p_seller uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.seller_id <> p_seller or o.payment_mode <> 'manual' then return false; end if;
  if o.status = 'paid' then return true; end if;
  if o.status <> 'pending' then raise exception 'Pesanan ini sudah ditutup.'; end if;
  update public.orders set status = 'paid', paid_at = now() where id = p_order;
  return true;
end $$;
revoke execute on function public.mark_order_manual(text, uuid) from public;
grant execute on function public.mark_order_manual(text, uuid) to service_role;

-- ---------- Bucket gambar (publik): cover, landing page, QRIS ----------
insert into storage.buckets (id, name, public) values ('store-assets', 'store-assets', true) on conflict do nothing;
drop policy if exists "aset toko dibaca publik" on storage.objects;
create policy "aset toko dibaca publik" on storage.objects for select using (bucket_id = 'store-assets');
drop policy if exists "aset toko unggah sendiri" on storage.objects;
create policy "aset toko unggah sendiri" on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "aset toko hapus sendiri" on storage.objects;
create policy "aset toko hapus sendiri" on storage.objects for delete to authenticated
  using (bucket_id = 'store-assets' and (storage.foldername(name))[1] = auth.uid()::text);
