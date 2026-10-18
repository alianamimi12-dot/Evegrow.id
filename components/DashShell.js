"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";
import { useSession, signOut, FREE_PRODUCT_LIMIT } from "@/lib/db";

const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  box: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
  wallet: "M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l12-3v3M17 14h2",
  store: "M3 9l2-5h14l2 5M3 9h18M5 9v11h14V9M10 20v-6h4v6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  crown: "M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  chev: "M15 6l-6 6 6 6",
  out: "M9 4H5v16h4M16 8l4 4-4 4M20 12H9",
};
const Ico = ({ n }) => (
  <svg className="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[n]} /></svg>
);

const GROUPS = [
  ["Utama", [["/dashboard", "Ringkasan", "home"], ["/dashboard/produk", "Produk", "box"], ["/dashboard/pesanan", "Pesanan", "receipt"]]],
  ["Pembayaran", [["/dashboard/konfirmasi", "Mode Admin", "shield"], ["/dashboard/saldo", "Penarikan", "wallet"]]],
  ["Toko", [["/dashboard/toko", "Pengaturan toko", "store"], ["/dashboard/statistik", "Statistik", "chart"], ["/dashboard/paket", "Paket", "crown"]]],
];

export function Problem({ error }) {
  return (
    <div className="authwrap"><div className="authbox">
      <Logo />
      <h1 style={{ fontSize: 24 }}>{error === "config" ? "Supabase belum disambungkan" : "Data gagal dimuat"}</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        {error === "config"
          ? "Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di Vercel (Settings > Environment Variables), lalu deploy ulang. Langkahnya ada di README."
          : `Pesan: ${error}. Pastikan skema SQL sudah dijalankan di Supabase.`}
      </p>
    </div></div>
  );
}

export default function DashShell({ title, subtitle, children, actions }) {
  const s = useSession("seller");
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => { try { setCollapsed(localStorage.getItem("ev_side") === "1"); } catch {} }, []);
  useEffect(() => { setOpen(false); }, [path]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("ev_side", c ? "0" : "1"); } catch {} return !c; });

  if (s.error) return <Problem error={s.error} />;
  if (!s.ready) return <div className="main muted">Memuat…</div>;
  const out = async () => { await signOut(); router.push("/"); };
  const on = (h) => (h === "/dashboard" ? path === h : path.startsWith(h));
  const waiting = s.db.orders.filter((o) => o.paymentMode === "manual" && o.status === "pending" && o.proofPath).length;
  const pro = s.user.plan === "pro";
  const used = s.db.products.length;

  return (
    <div className={"shell" + (collapsed ? " col" : "")}>
      <aside className={"side" + (open ? " open" : "")} aria-label="Menu utama">
        <div className="sidetop">
          <Logo href="/dashboard" height={30} />
          <button className="iconbtn deskonly" onClick={toggle} aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"} title={collapsed ? "Perluas" : "Ciutkan"}><span style={{ display: "inline-flex", transform: collapsed ? "rotate(180deg)" : "none" }}><Ico n="chev" /></span></button>
          <button className="iconbtn mobonly2" onClick={() => setOpen(false)} aria-label="Tutup menu"><Ico n="close" /></button>
        </div>
        {GROUPS.map(([g, items]) => (
          <div key={g}>
            <div className="grp">{g}</div>
            {items.map(([h, l, ic]) => (
              <Link key={h} href={h} className={"nav" + (on(h) ? " on" : "")} title={l} aria-current={on(h) ? "page" : undefined}>
                <Ico n={ic} /><span className="lbl">{l}</span>
                {h === "/dashboard/konfirmasi" && waiting > 0 && <span className="navbadge" aria-label={`${waiting} menunggu konfirmasi`}>{waiting}</span>}
              </Link>
            ))}
          </div>
        ))}
        <div className="sidefoot">
          <Link href="/dashboard/paket" className="planbox" title="Lihat paket">
            <div className="txt"><b>{s.user.name}</b><br /><span>Paket {pro ? "Pro" : "Free"}{!pro && ` · ${used}/${FREE_PRODUCT_LIMIT} produk`}</span></div>
            <span className="lbl-ico"><Ico n="crown" /></span>
          </Link>
          <button className="btn btn-ghost btn-sm btn-block sideout" onClick={out}><Ico n="out" /><span className="lbl">Keluar</span></button>
        </div>
      </aside>
      <div className={"scrim" + (open ? " show" : "")} onClick={() => setOpen(false)} />
      <div className="content">
        <div className="mobtop">
          <button className="iconbtn" onClick={() => setOpen(true)} aria-label="Buka menu"><Ico n="menu" /></button>
          <Logo href="/dashboard" height={26} />
        </div>
        <main className="main">
          <div className="pagehead row between wrap">
            <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
            <div className="row">{actions}</div>
          </div>
          {!s.store ? <div className="err">Toko belum ditemukan untuk akun ini. Hubungi admin.</div> : typeof children === "function" ? children(s) : children}
        </main>
      </div>
    </div>
  );
}
