"use client";
import { useState } from "react";
import DashShell from "@/components/DashShell";
import { rupiah, fullDate, sb, accessToken, uploadImage } from "@/lib/db";

const BANKS = ["BCA", "BRI", "BNI", "Mandiri", "BSI", "CIMB Niaga", "Permata", "Jago", "SeaBank", "DANA", "OVO", "GoPay", "ShopeePay", "Lainnya"];

function Payment({ s }) {
  const { store, user, reload } = s;
  const [f, setF] = useState({ bank: store.payBank, account: store.payAccount, holder: store.payHolder, qris: store.payQris });
  const [qr, setQr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setMsg(null);
    if (f.account && !/^[0-9]{6,20}$/.test(f.account.trim())) return setMsg({ bad: "Nomor rekening harus 6-20 digit angka." });
    setBusy(true);
    try {
      const qris = qr ? await uploadImage(user.id, qr, "qris") : f.qris;
      const { error } = await sb().from("stores").update({ pay_bank: f.bank, pay_account: f.account.trim(), pay_holder: f.holder.trim(), pay_qris_url: qris }).eq("user_id", store.userId);
      if (error) throw error;
      setQr(null); setMsg({ ok: "Metode pembayaran tersimpan." }); await reload();
    } catch (e2) { setMsg({ bad: e2.message || "Gagal menyimpan." }); }
    setBusy(false);
  };
  const on = !!(store.payAccount || store.payQris);
  return (
    <form className="card" onSubmit={save}>
      <div className="row between wrap"><h3>Metode pembayaran tokomu</h3><span className={"badge " + (on ? "ok" : "wait")}>{on ? "Bayar langsung ke kamu" : "Belum diisi"}</span></div>
      <p className="small muted" style={{ margin: "6px 0 14px" }}>Pembeli transfer langsung ke rekening atau QRIS-mu. Kamu cek dana masuk sendiri, lalu klik Konfirmasi di atas supaya produk terkirim ke email pembeli. Isi salah satu atau keduanya. Jika dikosongkan, pembayaran memakai Xendit (jika diaktifkan platform).</p>
      <div className="grid2">
        <div className="field"><label htmlFor="bk">Bank / e-wallet</label><select id="bk" className="input" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })}><option value="">Pilih</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></div>
        <div className="field"><label htmlFor="ac">Nomor rekening / HP</label><input id="ac" className="input" inputMode="numeric" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value.replace(/\D/g, "") })} /></div>
      </div>
      <div className="field"><label htmlFor="ho">Atas nama</label><input id="ho" className="input" value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} /></div>
      <div className="field"><label htmlFor="qr">Gambar QRIS</label><input id="qr" className="input" type="file" accept="image/*" onChange={(e) => setQr(e.target.files?.[0] || null)} />
        {f.qris && !qr && <img className="thumb" style={{ width: 140, height: 140 }} src={f.qris} alt="QRIS saat ini" />}</div>
      {msg?.bad && <div className="err" role="alert">{msg.bad}</div>}
      {msg?.ok && <div className="okmsg" role="status">{msg.ok}</div>}
      <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
    </form>
  );
}

function Orders({ s }) {
  const { db, user, reload } = s;
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);
  const all = db.orders.filter((o) => o.sellerId === user.id && o.paymentMode === "manual").sort((a, b) => b.createdAt - a.createdAt);
  const waiting = all.filter((o) => o.status === "pending");
  const done = all.filter((o) => o.status !== "pending");

  const viewProof = async (o) => {
    const { data, error } = await sb().storage.from("payment-proofs").createSignedUrl(o.proofPath, 300);
    if (error) return setNote({ bad: "Bukti tidak bisa dibuka: " + error.message });
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const act = async (o, action) => {
    if (action === "confirm" && !confirm(`Bukti transfer bisa dipalsukan, jadi cek juga mutasi rekening/e-wallet-mu: pastikan dana ${rupiah(o.amount)} dari ${o.buyerName} benar-benar sudah masuk. Produk langsung dikirim ke ${o.buyerEmail}. Lanjutkan?`)) return;
    if (action === "reject" && !confirm("Tolak pesanan ini? Pembeli tidak akan menerima produk.")) return;
    setBusy(o.id + action); setNote(null);
    try {
      const r = await fetch(`/api/orders/${o.id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await accessToken()) }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal.");
      setNote(action === "reject" ? { ok: "Pesanan ditolak." }
        : j.email === "sent" ? { ok: `Terkonfirmasi. Produk sudah dikirim ke ${o.buyerEmail}.` }
        : j.email === "disabled" ? { bad: "Terkonfirmasi, tetapi email otomatis belum diaktifkan di platform. Pembeli tetap bisa membuka produk lewat link pesanannya." }
        : j.email === "skipped" ? { ok: "Terkonfirmasi. Email sudah pernah dikirim sebelumnya." }
        : { bad: "Terkonfirmasi, tetapi email gagal dikirim. Klik Kirim ulang email di Riwayat." });
    } catch (e) { setNote({ bad: e.message }); }
    setBusy(""); reload();
  };

  const badge = (o) => o.status === "paid" ? <span className="badge ok">Terkonfirmasi</span> : o.status === "rejected" ? <span className="badge bad">Ditolak</span> : o.status === "expired" ? <span className="badge bad">Kedaluwarsa</span> : o.claimedAt ? <span className="badge pro">Pembeli sudah bayar</span> : <span className="badge wait">Belum bayar</span>;

  return (
    <div className="stack">
      {note?.ok && <div className="okmsg" role="status">{note.ok}</div>}
      {note?.bad && <div className="err" role="alert">{note.bad}</div>}
      <div className="card">
        <h3>Menunggu konfirmasi ({waiting.length})</h3>
        {waiting.length === 0 ? <div className="empty">Tidak ada pesanan yang menunggu.</div> : waiting.map((o) => (
          <div className="listrow wrap" key={o.id}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <b>{o.productName}</b> {badge(o)}
              <div className="small">{o.buyerName} · {o.buyerEmail}{o.buyerPhone ? " · " + o.buyerPhone : ""}</div>
              <div className="small muted">{o.id} · {fullDate(o.createdAt)}{o.buyerNote ? ` · catatan: ${o.buyerNote}` : ""}</div>
            </div>
            <div style={{ font: "700 18px var(--fd)" }}>{rupiah(o.amount)}</div>
            <div className="row wrap">
              {o.proofPath ? <button className="btn btn-ghost btn-sm" onClick={() => viewProof(o)}>Lihat bukti</button> : <span className="small muted">Belum ada bukti</span>}
              <button className="btn btn-primary btn-sm" disabled={!!busy || !o.proofPath} title={o.proofPath ? "" : "Menunggu bukti transfer dari pembeli"} onClick={() => act(o, "confirm")}>{busy === o.id + "confirm" ? "Mengirim…" : "Konfirmasi & kirim produk"}</button>
              <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => act(o, "reject")}>Tolak</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Riwayat</h3>
        {done.length === 0 ? <div className="empty">Belum ada riwayat.</div> : done.slice(0, 50).map((o) => (
          <div className="listrow wrap" key={o.id}>
            <div style={{ flex: 1, minWidth: 200 }}><b>{o.productName}</b> {badge(o)}<div className="small muted">{o.buyerName} · {o.buyerEmail} · {o.id} · {fullDate(o.createdAt)}</div></div>
            <b>{rupiah(o.amount)}</b>
            {o.proofPath && <button className="btn btn-ghost btn-sm" onClick={() => viewProof(o)}>Lihat bukti</button>}
            {o.status === "paid" && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act(o, "resend")}>Kirim ulang email</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Konfirmasi() {
  return (
    <DashShell title="Mode Admin" subtitle="Cek pembayaran pembeli, konfirmasi, dan produk terkirim otomatis ke email.">
      {(s) => <div className="stack"><Orders s={s} /><Payment s={s} /></div>}
    </DashShell>
  );
}
