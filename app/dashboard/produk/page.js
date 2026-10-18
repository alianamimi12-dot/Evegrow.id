"use client";
import Link from "next/link";
import { useState } from "react";
import DashShell from "@/components/DashShell";
import { rupiah, sb, uploadImage, effPrice, hasDiscount, PRODUCT_TYPES, FREE_PRODUCT_LIMIT } from "@/lib/db";

const BLANK = { name: "", type: "E-book", description: "", price: "", discountPrice: "", coverUrl: "", landingUrl: "", htmlCode: "", delivery: "link", linkUrl: "", fileUrl: "", cardSize: "large", active: true };
const SIZES = [["large", "Besar", "1 kolom"], ["small", "Kecil", "2 kolom"], ["tiny", "Sangat kecil", "seperti tombol"]];

function View({ s }) {
  const { db, user, reload } = s;
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);       // file produk (PDF)
  const [cover, setCover] = useState(null);
  const [landing, setLanding] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const list = db.products;
  const atLimit = user.plan !== "pro" && list.length >= FREE_PRODUCT_LIMIT;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const open = (p) => {
    setErr(""); setFile(null); setCover(null); setLanding(null);
    setForm(p ? { ...BLANK, ...p, linkUrl: /^https?:/i.test(p.fileUrl) ? p.fileUrl : "" } : { ...BLANK });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (e) => {
    e.preventDefault();
    const price = Number(form.price);
    const disc = form.discountPrice === "" ? null : Number(form.discountPrice);
    if (!(price >= 1000)) return setErr("Harga normal minimal Rp1.000.");
    if (disc !== null && !(disc >= 1000 && disc < price)) return setErr("Harga diskon harus minimal Rp1.000 dan lebih kecil dari harga normal.");
    if (form.htmlCode.length > 50000) return setErr("Kode HTML terlalu panjang (maksimal 50.000 karakter).");
    setErr(""); setBusy(true);
    try {
      const c = sb();
      let fileUrl = "";
      if (form.delivery === "link") {
        fileUrl = form.linkUrl.trim();
        if (!/^https:\/\//i.test(fileUrl)) throw new Error("Tautan produk harus diawali https://");
      } else {
        fileUrl = /^https?:/i.test(form.fileUrl) ? "" : form.fileUrl;   // pakai PDF lama jika tidak diganti
        if (file) {
          if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) throw new Error("File produk harus berformat PDF.");
          if (file.size > 50 * 1024 * 1024) throw new Error("Ukuran PDF maksimal 50 MB.");
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          fileUrl = `${user.id}/${Date.now()}-${safe}`;
          const up = await c.storage.from("product-files").upload(fileUrl, file);
          if (up.error) throw up.error;
        }
        if (!fileUrl) throw new Error("Unggah file PDF produk.");
      }
      const coverUrl = cover ? await uploadImage(user.id, cover, "cover") : form.coverUrl;
      const landingUrl = landing ? await uploadImage(user.id, landing, "landing") : form.landingUrl;
      const row = {
        name: form.name.trim(), type: form.type, description: form.description, price, discount_price: disc,
        cover_url: coverUrl, landing_url: landingUrl, html_code: form.htmlCode, delivery: form.delivery,
        card_size: form.cardSize, active: form.active,
      };
      let pid = form.id;
      if (pid) { const { error } = await c.from("products").update(row).eq("id", pid); if (error) throw error; }
      else { const { data, error } = await c.from("products").insert({ ...row, seller_id: user.id }).select("id").single(); if (error) throw error; pid = data.id; }
      const { error: fe } = await c.from("product_files").upsert({ product_id: pid, file_url: fileUrl });
      if (fe) throw fe;
      setForm(null); await reload();
    } catch (e2) { setErr(e2.message || "Gagal menyimpan."); }
    setBusy(false);
  };

  const toggle = async (p) => { await sb().from("products").update({ active: !p.active }).eq("id", p.id); reload(); };
  const remove = async (p) => {
    if (!confirm("Hapus produk ini?")) return;
    const { error } = await sb().from("products").delete().eq("id", p.id);
    if (error) alert(/foreign key|violates/i.test(error.message) ? "Produk ini sudah pernah dipesan, jadi tidak bisa dihapus. Pilih Sembunyikan saja." : error.message);
    reload();
  };

  return (
    <div className="stack">
      <div className="row wrap">
        <button className="btn btn-primary btn-sm" disabled={atLimit} onClick={() => open(null)}>Tambah produk</button>
        {user.plan !== "pro" && <span className="small muted">{list.length}/{FREE_PRODUCT_LIMIT} produk (paket Free)</span>}
      </div>
      {atLimit && <div className="notice" role="note">Batas {FREE_PRODUCT_LIMIT} produk paket Free sudah tercapai. <Link href="/dashboard/paket" style={{ fontWeight: 700, textDecoration: "underline" }}>Upgrade ke Pro</Link> untuk produk tanpa batas.</div>}
      {form && (
        <form className="card" onSubmit={save}>
          <h3>{form.id ? "Ubah produk" : "Produk baru"}</h3>
          <div className="field"><label htmlFor="pn">Nama produk</label><input id="pn" className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="field"><label htmlFor="pt">Jenis</label><select id="pt" className="input" value={form.type} onChange={(e) => set("type", e.target.value)}>{PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>

          <div className="grid2">
            <div className="field"><label htmlFor="pp">Harga normal (Rp)</label><input id="pp" className="input" type="number" min="1000" step="500" required value={form.price} onChange={(e) => set("price", e.target.value)} /></div>
            <div className="field"><label htmlFor="pdp">Harga diskon (Rp)</label><input id="pdp" className="input" type="number" min="1000" step="500" placeholder="Kosongkan jika tanpa diskon" value={form.discountPrice} onChange={(e) => set("discountPrice", e.target.value)} /><div className="hint">Jika diisi, pembeli membayar harga diskon.</div></div>
          </div>

          <div className="field"><label htmlFor="pd">Deskripsi produk</label><textarea id="pd" className="input" value={form.description} onChange={(e) => set("description", e.target.value)} /></div>

          <div className="grid2">
            <div className="field"><label htmlFor="pc">Foto cover produk</label><input id="pc" className="input" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} />
              <div className="hint">{form.coverUrl && !cover ? "Sudah ada cover. Pilih gambar baru untuk mengganti. " : ""}Maks 3 MB. Disarankan persegi.</div>
              {form.coverUrl && !cover && <img className="thumb" src={form.coverUrl} alt="Cover saat ini" />}</div>
            <div className="field"><label htmlFor="pl">Foto landing page</label><input id="pl" className="input" type="file" accept="image/*" onChange={(e) => setLanding(e.target.files?.[0] || null)} />
              <div className="hint">{form.landingUrl && !landing ? "Sudah ada gambar. Pilih gambar baru untuk mengganti. " : ""}Ditampilkan di halaman detail produk. Maks 3 MB.</div>
              {form.landingUrl && !landing && <img className="thumb" src={form.landingUrl} alt="Landing saat ini" />}</div>
          </div>

          <div className="field"><label htmlFor="ph">Kode HTML (opsional)</label><textarea id="ph" className="input mono" rows={6} placeholder="<h2>Isi halaman penjualan...</h2>" value={form.htmlCode} onChange={(e) => set("htmlCode", e.target.value)} />
            <div className="hint">Ditampilkan di halaman detail produk dalam kotak aman. JavaScript tidak dijalankan, jadi pakai HTML dan CSS saja.</div></div>

          <div className="field"><label>Pengiriman produk ke pembeli</label>
            <div className="chips">
              <button type="button" className={"chip" + (form.delivery === "link" ? " on" : "")} onClick={() => set("delivery", "link")}>Via link</button>
              <button type="button" className={"chip" + (form.delivery === "pdf" ? " on" : "")} onClick={() => set("delivery", "pdf")}>Unggah PDF</button>
            </div></div>
          {form.delivery === "link" ? (
            <div className="field"><label htmlFor="pf">Tautan produk</label><input id="pf" className="input" type="url" placeholder="https:// (Google Drive, Notion, kelas, dll)" value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} /><div className="hint">Tautan ini dikirim ke email pembeli setelah pembayaran dikonfirmasi.</div></div>
          ) : (
            <div className="field"><label htmlFor="pu">File PDF</label><input id="pu" className="input" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div className="hint">{form.fileUrl && !/^https?:/i.test(form.fileUrl) && !file ? "PDF sudah tersimpan. Pilih file baru hanya jika ingin menggantinya. " : ""}Maks 50 MB. Disimpan privat; pembeli mendapat tautan unduhan lewat email setelah dikonfirmasi.</div></div>
          )}

          <div className="field"><label>Ukuran tampilan di toko</label>
            <div className="chips">{SIZES.map(([k, n, d]) => <button type="button" key={k} className={"chip" + (form.cardSize === k ? " on" : "")} onClick={() => set("cardSize", k)}>{n} <span className="muted small">({d})</span></button>)}</div></div>

          {err && <div className="err" style={{ marginTop: 12 }} role="alert">{err}</div>}
          <div className="row" style={{ marginTop: 16 }}><button className="btn btn-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan produk"}</button><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button></div>
        </form>
      )}
      <div className="card">
        {list.length === 0 ? <div className="empty">Belum ada produk. Tambahkan produk pertamamu.</div> : list.map((p) => (
          <div className="listrow wrap" key={p.id}>
            <div style={{ flex: 1, minWidth: 180 }}><b>{p.name}</b> {!p.active && <span className="badge wait">Disembunyikan</span>}
              <div className="small muted">{p.type} · {hasDiscount(p) ? <><s>{rupiah(p.price)}</s> <b>{rupiah(effPrice(p))}</b></> : rupiah(p.price)} · {p.delivery === "pdf" ? "PDF" : "Link"} · tampilan {SIZES.find((x) => x[0] === p.cardSize)?.[1].toLowerCase()}</div></div>
            <div className="row wrap">
              <button className="btn btn-ghost btn-sm" onClick={() => open(p)}>Ubah</button>
              <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>{p.active ? "Sembunyikan" : "Tampilkan"}</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>Hapus</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export default function Produk() { return <DashShell title="Produk" subtitle="Kelola produk yang dijual di tokomu.">{(s) => <View s={s} />}</DashShell>; }
