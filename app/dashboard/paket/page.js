"use client";
import { useState } from "react";
import DashShell from "@/components/DashShell";
import { rupiah, accessToken, FREE_PRODUCT_LIMIT } from "@/lib/db";

function View({ s }) {
  const { db, user } = s;
  const pro = user.plan === "pro";
  const used = db.products.length;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const upgrade = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/pro/checkout", { method: "POST", headers: { Authorization: "Bearer " + (await accessToken()) } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      window.location.href = j.invoiceUrl;
    } catch (e) { setErr((e.message || "Gagal membuat tagihan.") + " Kamu juga bisa meminta admin mengaktifkan Pro."); setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="row between wrap"><h3>Paket kamu</h3><span className={"badge " + (pro ? "pro" : "")}>{pro ? "Pro" : "Free"}</span></div>
        {pro ? (
          <p className="muted" style={{ marginTop: 8 }}>Produk tanpa batas ({used} produk saat ini).{user.planExpiresAt ? ` Pro aktif sampai ${new Date(user.planExpiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.` : ""}</p>
        ) : (
          <>
            <p className="muted" style={{ margin: "8px 0 12px" }}>{used} dari {FREE_PRODUCT_LIMIT} produk terpakai.{used >= FREE_PRODUCT_LIMIT ? " Batas tercapai, upgrade ke Pro untuk menambah produk." : ""}</p>
            <div className="bar-row"><div className="track"><div className="fill" style={{ width: Math.min(100, (used / FREE_PRODUCT_LIMIT) * 100) + "%" }} /></div></div>
          </>
        )}
      </div>
      <div className="plans" style={{ marginTop: 0 }}>
        <div className="plan"><b>Free</b><div className="big">{FREE_PRODUCT_LIMIT} produk</div><p className="muted">gratis selamanya</p>
          <ul><li>Toko dan halaman produk sendiri</li><li>Email produk otomatis ke pembeli</li><li>Statistik dan grafik penjualan</li></ul></div>
        <div className="plan pro"><b>Pro</b><div className="big">Unlimited</div><p style={{ opacity: .8 }}>{rupiah(db.settings.proPrice)} / 30 hari</p>
          <ul><li>Semua fitur Free</li><li>Jumlah produk tanpa batas</li><li>Lencana Pro di toko</li></ul>
          {!pro && <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={upgrade} disabled={busy}>{busy ? "Memproses…" : "Upgrade ke Pro"}</button>}</div>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <p className="hint">Pembayaran pembeli langsung masuk ke rekening atau QRIS-mu. Evegrow tidak memotong penjualanmu.</p>
    </div>
  );
}
export default function Paket() { return <DashShell title="Paket" subtitle="Free dibatasi 5 produk, Pro tanpa batas.">{(s) => <View s={s} />}</DashShell>; }
