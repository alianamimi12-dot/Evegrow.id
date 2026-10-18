-- Jalankan setelah 003. Aman dijalankan ulang.
alter table public.orders add column if not exists proof_path text;

-- Bucket PRIVAT untuk bukti transfer. Unggahan lewat server (service role); tidak ada policy insert untuk publik.
insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false) on conflict do nothing;

-- Penjual hanya bisa membaca bukti di folder miliknya (path: <seller_id>/<order_id>-<waktu>.<ext>)
drop policy if exists "penjual baca bukti transfer" on storage.objects;
create policy "penjual baca bukti transfer" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
