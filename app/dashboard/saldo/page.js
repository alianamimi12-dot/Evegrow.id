"use client";
import { useState } from "react";
import DashShell from "@/components/DashShell";
import Confetti from "@/components/Confetti";
import { rupiah, fullDate, sb, withdrawable, payoutMode, feeRate } from "@/lib/db";

const BANKS = ["BCA", "BRI", "BNI", "Mandiri", "BSI", "CIMB Niaga", "Permata", "Jago", "SeaBank", "DANA", "OVO", "GoPay", "ShopeePay", "Lainnya"];

function View({ s }) {
  const { db, user, store, reload } = s;
  const mode = payoutMode(db);
  const demo = mode === "demo";
  const bal = withdrawable(db, user.id);
  const min = db.settings.minWithdraw;
  const rate = demo ? 0 : feeRate(db, user);
  const hasAcc = !!(store.payoutBank && store.payoutAccount && store.payoutHolder);

  const [acc, setAcc] = useState({ bank: store.payoutBank, account: store.payoutAccount, holder: store.payoutHolder });
  const [editing, setEditing] = useState(!hasAcc);
  const [accMsg, setAccMsg] = useState(null);
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [step, setStep] = useState(null); // null | "confirm" | "done"
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const amt = Number(amount) || 0;
  const fee = Math.round(amt * rate);
  const hist = db.withdrawals;

  const saveAcc = async (e) => {
    e.preventDefault(); setAccMsg(null);
    if (!acc.bank) return setAccMsg({ bad: "Pilih bank atau e-wallet." });
    if (!/^[0-9]{6,20}$/.test(acc.account)) return setAccMsg({ bad: "Nomor rekening harus 6-20 digit angka." });
    if (!acc.holder.trim()) return setAccMsg({ bad: "Isi nama pemilik rekening." });
    setBusy(true);
    const { error } = await sb().from("stores").update({ payout_bank: acc.bank, payout_account: acc.account, payout_holder: acc.holder.trim() }).eq("user_id", store.userId);
    setBusy(false);
    if (error) return setAccMsg({ bad: error.message });
    setEditing(false); setAccMsg({ ok: "Rekening penarikan tersimpan." }); reload();
  };

  const ask = (e) => {
    e.preventDefault(); setErr("");
    if (!hasAcc) return setErr("Simpan rekening penarikan dulu.");
    if (amt < min) return setErr(`Penarikan minimal ${rupiah(min)}.`);
    if (amt > bal.available) return setErr("Saldo tidak mencukupi.");
    setStep("confirm");
  };

  const withdraw = async () => {
    setBusy(true); setErr("");
    // Pemeriksaan saldo dan pencatatan dilakukan di server (fungsi database), bukan di browser
    const { error } = demo
      ? await sb().rpc("payout_simulate", { p_amount: amt })
      : await sb().rpc("request_withdrawal", { p_amount: amt, p_bank: store.payoutBank, p_account: store.payoutAccount, p_holder: store.payoutHolder });
    setBusy(false);
    if (error) { setStep(null); return setErr(error.message); }
    setDone({ amount: amt, fee, bank: store.payoutBank, account: store.payoutAccount, holder: store.payoutHolder });
    setAmount(""); setStep("done"); reload();
  };

  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi hl"><div className="l">Saldo dapat ditarik</div><div className="v">{rupiah(bal.available)}</div></div>
        <div className="kpi"><div className="l">Total pendapatan</div><div className="v">{rupiah(bal.earned)}</div></div>
        <div className="kpi"><div className="l">Total ditarik</div><div className="v">{rupiah(bal.paidOut)}</div></div>
        {!demo && <div className="kpi"><div className="l">Sedang diproses</div><div className="v">{rupiah(bal.processing)}</div></div>}
      </div>

      <div className="card">
        <div className="row between wrap"><h3>Rekening penarikan</h3>{hasAcc && !editing && <button className="btn btn-ghost btn-sm" onClick={() => { setAcc({ bank: store.payoutBank, account: store.payoutAccount, holder: store.payoutHolder }); setEditing(true); setAccMsg(null); }}>Ubah</button>}</div>
        {editing ? (
          <form onSubmit={saveAcc} style={{ marginTop: 10 }}>
            <p className="small muted" style={{ marginBottom: 12 }}>Tujuan dana saat kamu menarik saldo. Ini terpisah dari rekening penerima pembayaran pembeli di Mode Admin.</p>
            <div className="grid2">
              <div className="field"><label htmlFor="pb">Bank / e-wallet</label><select id="pb" className="input" value={acc.bank} onChange={(e) => setAcc({ ...acc, bank: e.target.value })}><option value="">Pilih</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></div>
              <div className="field"><label htmlFor="pa">Nomor rekening / HP</label><input id="pa" className="input" inputMode="numeric" value={acc.account} onChange={(e) => setAcc({ ...acc, account: e.target.value.replace(/\D/g, "") })} /></div>
            </div>
            <div className="field"><label htmlFor="ph">Nama pemilik rekening</label><input id="ph" className="input" value={acc.holder} onChange={(e) => setAcc({ ...acc, holder: e.target.value })} /></div>
            {accMsg?.bad && <div className="err" role="alert">{accMsg.bad}</div>}
            <div className="row" style={{ marginTop: 12 }}><button className="btn btn-primary btn-sm" disabled={busy}>Simpan rekening</button>{hasAcc && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Batal</button>}</div>
          </form>
        ) : (
          <div style={{ marginTop: 10 }}>
            <b>{store.payoutBank}</b> {store.payoutAccount}<div className="small muted">a.n. {store.payoutHolder}</div>
            {accMsg?.ok && <div className="okmsg" style={{ marginTop: 10 }} role="status">{accMsg.ok}</div>}
          </div>
        )}
      </div>

      <form className="card" onSubmit={ask}>
        <h3>Tarik dana</h3>
        <div className="field"><label htmlFor="wa">Nominal (Rp)</label>
          <input id="wa" className="input" type="number" min={min} step="1000" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="chips" style={{ marginTop: 8 }}>
            {bal.available >= min && <button type="button" className="chip" onClick={() => setAmount(String(bal.available))}>Tarik semua ({rupiah(bal.available)})</button>}
          </div>
        </div>
        {!demo && rate > 0 && amt > 0 && <div className="okmsg" style={{ marginBottom: 12 }}>Biaya penarikan {+(rate * 100).toFixed(2)}%: <b>{rupiah(fee)}</b>. Dana yang kamu terima: <b>{rupiah(amt - fee)}</b>.</div>}
        {err && <div className="err" style={{ marginBottom: 12 }} role="alert">{err}</div>}
        <button className="btn btn-primary" disabled={busy || !hasAcc}>Tarik dana</button>
        <p className="hint">Penarikan minimal {rupiah(min)}. {!hasAcc ? "Simpan rekening penarikan dulu." : "Kamu akan diminta konfirmasi sebelum diproses."}</p>
      </form>

      <div className="card tablewrap">
        <h3>Riwayat penarikan</h3>
        {hist.length === 0 ? <div className="empty">Belum ada penarikan.</div> : (
          <table>
            <thead><tr><th>Tanggal</th><th>Nominal</th>{!demo && <><th>Biaya</th><th>Diterima</th></>}<th>Rekening tujuan</th><th>Status</th></tr></thead>
            <tbody>{hist.map((w) => (
              <tr key={w.id}><td>{fullDate(w.createdAt)}</td><td><b>{rupiah(w.amount)}</b></td>{!demo && <><td>{rupiah(w.fee)}</td><td>{rupiah(w.net)}</td></>}
                <td>{w.bank} {w.account}<div className="small muted">{w.holder}</div></td>
                <td><span className={"badge " + (w.status === "berhasil" ? "ok" : w.status === "ditolak" ? "bad" : "wait")}>{w.status === "berhasil" ? "Berhasil" : w.status === "ditolak" ? "Ditolak" : "Diproses"}</span></td></tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {step === "confirm" && (
        <div className="modalbg" role="dialog" aria-modal="true" aria-labelledby="cf-t" onClick={() => !busy && setStep(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="cf-t" style={{ fontSize: 24 }}>Konfirmasi penarikan</h2>
            <p className="muted" style={{ margin: "6px 0 14px" }}>Periksa dulu sebelum melanjutkan.</p>
            <div className="sumrow"><span className="muted">Nominal</span><b>{rupiah(amt)}</b></div>
            {!demo && rate > 0 && <><div className="sumrow"><span className="muted">Biaya</span><b>{rupiah(fee)}</b></div><div className="sumrow"><span className="muted">Diterima</span><b>{rupiah(amt - fee)}</b></div></>}
            <div className="sumrow"><span className="muted">Tujuan</span><span style={{ textAlign: "right" }}><b>{store.payoutBank} {store.payoutAccount}</b><br /><span className="small muted">a.n. {store.payoutHolder}</span></span></div>
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={withdraw} disabled={busy}>{busy ? "Memproses…" : "Ya, tarik sekarang"}</button>
              <button className="btn btn-ghost" onClick={() => setStep(null)} disabled={busy}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {step === "done" && done && (
        <>
          {demo && <Confetti />}
          <div className="modalbg" role="dialog" aria-modal="true" aria-labelledby="ok-t" onClick={() => setStep(null)}>
            <div className="modal" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
              <div className="okcheck" aria-hidden="true"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg></div>
              <h2 id="ok-t" style={{ fontSize: 26 }}>{demo ? "Penarikan berhasil" : "Permintaan terkirim"}</h2>
              <div style={{ font: "800 32px var(--fd)", margin: "10px 0 4px" }}>{rupiah(done.amount)}</div>
              <p className="muted">{demo ? "ke" : "akan ditransfer ke"} {done.bank} {done.account} a.n. {done.holder}</p>
              <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={() => setStep(null)}>Selesai</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export default function Saldo() { return <DashShell title="Penarikan" subtitle="Saldo, rekening penarikan, dan riwayat penarikan dana.">{(s) => <View s={s} />}</DashShell>; }
