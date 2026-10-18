-- Warna brand baru: ungu. Default toko baru + pindahkan toko yang masih memakai tema biru lama.
alter table public.stores alter column color set default '#7C3AED';
update public.stores set color = case upper(color)
  when '#2B9BE6' then '#7C3AED' when '#1678BE' then '#5B21B6'
  when '#67BAEB' then '#7C3AED' when '#0B2540' then '#1E1033' else color end
where upper(color) in ('#2B9BE6','#1678BE','#67BAEB','#0B2540');
