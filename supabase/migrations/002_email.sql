-- Jalankan HANYA jika database sudah dibuat dengan versi schema.sql sebelumnya (tanpa fitur email).
alter table public.orders add column if not exists buyer_emailed_at timestamptz;
alter table public.orders add column if not exists seller_notified_at timestamptz;
