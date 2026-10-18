"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Logo from "@/components/Logo";

// Halaman untuk pembeli setelah membayar. Mengecek status berkala sampai pembayaran terverifikasi webhook.
export default function Pesanan() {
  const { id } = useParams();
  const [res, setRes] = useState(null);
  const [tries, setTries] = useState(0);
  const [mail, setMail] = useState(null);
  const [note, setNote] = useState("");
  const [claim, setClaim] = useState(null);
  const [proof, setProof] = useState(null);
  const sendClaim = async () => {
    if (!proof) return setClaim({ bad: "Pilih foto bukti transfer dulu." });
    if (proof.size > 3 * 1024 * 1024) return setClaim({ bad: "Ukuran foto maksimal 3 MB." });
    setClaim({ wait: true });
    const token = new URLSearchParams(window.location.search).get("t") || "";
    const fd = new FormData(); fd.append("proof", proof); fd.append("note", note);
    const r = await fetch(`/api/orders/${id}/claim?token=${token}`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setClaim(null); setRes((x) => ({ ...x, claimed: true })); } else setClaim({ bad: j.error || "Gagal. Coba lagi." });
  };
  const resend = async () => {
    setMail({ wait: true });
    const token = new URLSearchParams(window.location.search).get("t") || "";
    const r = await fetch(`/api/orders/${id}/resend?token=${token}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMail(r.ok ? { ok: "Email bukti dikirim ulang. Cek kotak masuk dan folder spam." } : { bad: j.error || "Gagal mengirim email." });
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t") || "";
    let stop = false, timer;
    const run = async (n) => {
      try {
        const r = await fetch(`/api/orders/${id}/access?token=${token}`, { cache: "no-store" });
        const j = await r.json();
        if (stop) return;
        setRes({ ok: r.ok, ...j }); setTries(n);
        if (r.ok && j.status === "pending" && n < (j.mode === "manual" ? 360 : 60)) timer = setTimeout(() => run(n + 1), j.mode === "manual" ? 10000 : 4000);
      } catch { if (!stop) setRes({ ok: false, error: "Koneksi bermasalah. Muat ulang halaman ini." }); }
    };
    run(0);
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);

  return (
    <div className="authwrap"><div className="authbox" style={{ textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center" }}><Logo /></div>
      {!res && <p className="muted" style={{ marginTop: 20 }}>Memeriksa pesanan…</p>}
      {res && !res.ok && <><h1 style={{ fontSize: 24 }}>Pesanan tidak ditemukan</h1><p className="muted" style={{ marginTop: 8 }}>{res.error}</p></>}
      {res?.ok && res.status === "pending" && res.mode === "manual" && (
        <div className="stack" style={{ textAlign: "left" }}>
          <h1 style={{ fontSize: 24, textAlign: "center" }}>Selesaikan pembayaran</h1>
          <p className="muted" style={{ textAlign: "center" }}>{res.productName} · pesanan <b>{id}</b></p>
          <div className="card" style={{ background: "var(--mist)" }}>
            <div className="small muted">Transfer tepat sejumlah</div>
            <div style={{ font: "700 26px var(--fd)" }}>{"Rp" + Math.round(res.amount).toLocaleString("id-ID")}</div>
            {res.pay?.account && <p style={{ marginTop: 10 }}><b>{res.pay.bank}</b> {res.pay.account}<br /><span className="small muted">a.n. {res.pay.holder || res.pay.storeName}</span></p>}
            {res.pay?.qris && <div style={{ textAlign: "center", marginTop: 12 }}><div className="small muted">atau scan QRIS</div><img src={res.pay.qris} alt="QRIS pembayaran" style={{ width: "100%", maxWidth: 260, borderRadius: 12, background: "#fff" }} /></div>}
          </div>
          {res.claimed ? (
            <div className="okmsg" role="status">Bukti transfer terkirim. Penjual akan mengecek pembayaranmu. Setelah dikonfirmasi, produk dikirim ke emailmu dan halaman ini berubah otomatis.</div>
          ) : (
            <>
              <div className="field"><label htmlFor="pr">Foto bukti transfer (wajib)</label>
                <input id="pr" className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setProof(e.target.files?.[0] || null)} />
                <div className="hint">JPG, PNG, atau WebP, maksimal 3 MB. Tangkapan layar dari m-banking atau e-wallet juga boleh.</div></div>
              <input className="input" placeholder="Nama pengirim / bank asal (opsional)" aria-label="Catatan untuk penjual" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-primary btn-block" onClick={sendClaim} disabled={claim?.wait || !proof}>{claim?.wait ? "Mengirim…" : "Kirim bukti & saya sudah bayar"}</button>
              {claim?.bad && <div className="err" role="alert">{claim.bad}</div>}
              <p className="hint" style={{ textAlign: "center" }}>Produk dikirim setelah penjual memastikan dana masuk.</p>
            </>
          )}
        </div>
      )}
      {res?.ok && res.status === "pending" && res.mode !== "manual" && (
        <><h1 style={{ fontSize: 24 }}>Menunggu pembayaran</h1>
          <p className="muted" style={{ margin: "8px 0" }}>{res.productName}. Halaman ini diperbarui otomatis setelah pembayaranmu terkonfirmasi{tries >= 60 ? " (berhenti memeriksa, muat ulang halaman untuk cek lagi)" : ""}.</p></>
      )}
      {res?.ok && res.status === "rejected" && <><h1 style={{ fontSize: 24 }}>Pesanan ditolak</h1><p className="muted" style={{ marginTop: 8 }}>Penjual tidak menemukan pembayaran untuk pesanan ini. Hubungi penjual jika kamu sudah transfer.</p></>}
      {res?.ok && res.status === "expired" && <><h1 style={{ fontSize: 24 }}>Pembayaran kedaluwarsa</h1><p className="muted" style={{ marginTop: 8 }}>Silakan buat pesanan baru dari halaman toko.</p></>}
      {res?.ok && res.status === "paid" && (
        <div className="stack">
          <h1 style={{ fontSize: 26 }}>Pembayaran berhasil</h1>
          <p className="muted">{res.productName} · pesanan <b>{id}</b></p>
          {res.url ? <a className="btn btn-primary btn-block" href={res.url} target="_blank" rel="noopener noreferrer">Buka produk</a> : <p className="err">Penjual belum mengisi file produk. Hubungi penjual dengan nomor pesanan di atas.</p>}
          <button className="btn btn-ghost btn-block" onClick={resend} disabled={mail?.wait}>Kirim ulang email bukti</button>
          {mail?.ok && <div className="okmsg" role="status">{mail.ok}</div>}
          {mail?.bad && <div className="err" role="alert">{mail.bad}</div>}
          <p className="hint">Simpan link halaman ini untuk membuka produk lagi nanti.</p>
        </div>
      )}
      <p className="small" style={{ marginTop: 20 }}><Link href="/" style={{ color: "var(--brand-d)", fontWeight: 700 }}>Evegrow</Link></p>
    </div></div>
  );
}
