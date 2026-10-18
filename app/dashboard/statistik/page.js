"use client";
import { useState } from "react";
import DashShell from "@/components/DashShell";
import BarChart from "@/components/BarChart";
import { rupiah, statsFor, earliestFor, inputDate } from "@/lib/db";

const METRICS = [["value", "Omzet penjualan"], ["withdrawn", "Penarikan"], ["visits", "Pengunjung"], ["orders", "Transaksi"]];

function View({ s }) {
  const [period, setPeriod] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [metric, setMetric] = useState("value");
  const now = Date.now();
  const first = earliestFor(s.db, s.user.id);
  const y1 = new Date(now).getFullYear(), y0 = Math.max(new Date(first).getFullYear(), y1 - 9);
  const years = []; for (let y = y1; y >= y0; y--) years.push(y);

  let a, b = now;
  if (/^\d+$/.test(period)) a = now - (Number(period) - 1) * 86400000;
  else if (period === "all") a = first;
  else if (period.startsWith("y")) { const y = Number(period.slice(1)); a = new Date(y, 0, 1).getTime(); b = Math.min(now, new Date(y, 11, 31, 23, 59, 59).getTime()); }
  else if (from && to) { a = new Date(from + "T00:00:00").getTime(); b = new Date(to + "T23:59:59").getTime(); }
  else a = now - 6 * 86400000;

  const st = statsFor(s.db, s.user.id, a, b);
  const money = metric === "value" || metric === "withdrawn";
  const data = st.series.map((x) => ({ label: x.label, value: x[metric] }));
  const maxSrc = Math.max(1, ...st.sources.map((x) => x[1]));
  const maxSold = Math.max(1, ...st.top.map((x) => x.sold));
  const chips = [["7", "7 hari"], ["30", "30 hari"], ["90", "90 hari"], ...years.map((y) => ["y" + y, "Tahun " + y]), ["all", "Semua waktu"], ["custom", "Pilih tanggal"]];

  return (
    <div className="stack">
      <div className="card">
        <p className="small muted" style={{ marginBottom: 8 }}>Periode</p>
        <div className="chips">
          {chips.map(([v, l]) => <button key={v} className={"chip" + (period === v ? " on" : "")} onClick={() => { setPeriod(v); if (v === "custom" && !from) { setFrom(inputDate(now - 6 * 86400000)); setTo(inputDate(now)); } }}>{l}</button>)}
        </div>
        {period === "custom" && <div className="grid2" style={{ marginTop: 12 }}>
          <div><label htmlFor="df">Dari</label><input id="df" className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label htmlFor="dt">Sampai</label><input id="dt" className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        </div>}
        <p className="hint">Rentang lebih dari 3 bulan ditampilkan per bulan, jadi data tahun lalu tetap terbaca utuh.</p>
      </div>

      <div className="kpis">
        <div className="kpi hl"><div className="l">Total omzet</div><div className="v">{rupiah(st.revenue)}</div></div>
        <div className="kpi"><div className="l">Total penarikan</div><div className="v">{rupiah(st.withdrawn)}</div></div>
        <div className="kpi"><div className="l">Transaksi berhasil</div><div className="v">{st.orders}</div></div>
        <div className="kpi"><div className="l">Rata-rata transaksi</div><div className="v">{rupiah(st.avg)}</div></div>
        <div className="kpi"><div className="l">Pengunjung toko</div><div className="v">{st.visitors}</div></div>
        <div className="kpi"><div className="l">Kunjungan produk</div><div className="v">{st.productViews}</div></div>
        <div className="kpi"><div className="l">Konversi</div><div className="v">{st.conversion.toFixed(1)}%</div></div>
      </div>

      <div className="card">
        <div className="row between wrap"><h3>Grafik per {st.bucket.toLowerCase()}</h3>
          <div className="chips">{METRICS.map(([k, l]) => <button key={k} className={"chip" + (metric === k ? " on" : "")} onClick={() => setMetric(k)}>{l}</button>)}</div></div>
        <BarChart data={data} format={money ? rupiah : (v) => v} label={METRICS.find((m) => m[0] === metric)[1]} />
      </div>

      <div className="card tablewrap">
        <h3>Rekap per {st.bucket.toLowerCase()}</h3>
        <div style={{ maxHeight: 360, overflowY: "auto", marginTop: 8 }}>
          <table>
            <thead><tr><th>{st.bucket}</th><th>Omzet</th><th>Transaksi</th><th>Pengunjung</th><th>Penarikan</th></tr></thead>
            <tbody>{[...st.series].reverse().map((r, i) => <tr key={i}><td>{r.label}</td><td>{rupiah(r.value)}</td><td>{r.orders}</td><td>{r.visits}</td><td>{rupiah(r.withdrawn)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="grid2">
        <div className="card"><h3>Produk terlaris</h3>
          {st.top.length === 0 ? <div className="empty">Belum ada produk.</div> : st.top.map((p) => (
            <div key={p.id} style={{ margin: "12px 0" }}><div className="row between"><span>{p.name}</span><b>{p.sold} terjual</b></div>
              <div className="bar-row"><div className="track"><div className="fill" style={{ width: (p.sold / maxSold) * 100 + "%" }} /></div></div>
              <div className="small muted">{rupiah(p.revenue)} · {p.views} kunjungan</div></div>
          ))}</div>
        <div className="card"><h3>Sumber pengunjung</h3>
          {st.sources.length === 0 ? <div className="empty">Belum ada data kunjungan.</div> : st.sources.map(([n, c]) => (
            <div className="bar-row" key={n}><span style={{ width: 86 }}>{n}</span><div className="track"><div className="fill" style={{ width: (c / maxSrc) * 100 + "%" }} /></div><b>{c}</b></div>
          ))}
          <p className="hint">Tambahkan ?ref=instagram di akhir link tokomu untuk melacak sumber.</p></div>
      </div>
    </div>
  );
}
export default function Statistik() { return <DashShell title="Statistik" subtitle="Penjualan, penarikan, dan pengunjung dari awal sampai sekarang.">{(s) => <View s={s} />}</DashShell>; }
