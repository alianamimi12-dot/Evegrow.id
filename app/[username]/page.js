"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { loadPublicStore, recordVisit, rupiah, effPrice, hasDiscount } from "@/lib/db";
import { Problem } from "@/components/DashShell";

const refParam = () => new URLSearchParams(window.location.search).get("ref") || "Langsung";

export default function StorePage() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [pick, setPick] = useState(null);

  useEffect(() => {
    let live = true;
    loadPublicStore(username).then((d) => {
      if (!live) return;
      setData(d);
      if (d.store) {
        const k = "evegrow_seen_" + d.store.userId;
        if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); recordVisit(d.store.userId, null, refParam()); }
      }
    });
    return () => { live = false; };
  }, [username]);

  if (!data) return <div className="storepage" />;
  if (data.error) return <Problem error={data.error} />;
  if (!data.store) {
    return (
      <div className="authwrap"><div className="authbox" style={{ textAlign: "center" }}>
        <h1>Toko tidak ditemukan</h1>
        <p className="muted" style={{ margin: "8px 0 18px" }}>Periksa kembali link tokonya, atau buat tokomu sendiri.</p>
        <Link href="/register" className="btn btn-primary">Buat toko gratis</Link>
      </div></div>
    );
  }

  const { store, products } = data;
  const soc = store.socials || {};
  const open = (p) => { recordVisit(store.userId, p.id, refParam()); setPick(p); };

  return (
    <div className="storepage" style={{ "--store": store.color }}>
      <div className="storebox">
        <div className="storehead">
          <div className="av">{store.name.charAt(0).toUpperCase()}</div>
          <h1>{store.name} {store.isPro && <span className="badge pro" style={{ verticalAlign: "middle" }}>Pro</span>}</h1>
          {store.bio && <p className="muted" style={{ marginTop: 6 }}>{store.bio}</p>}
          <div className="socials">
            {soc.instagram && <a href={soc.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
            {soc.tiktok && <a href={soc.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a>}
            {soc.whatsapp && <a href={soc.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          </div>
        </div>
        {store.links.map((l) => <a key={l.id} className="sl" href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a>)}
        {products.length === 0 && <div className="card empty">Belum ada produk.</div>}
        <div className="pgrid">
          {products.map((p) => {
            const sz = p.card_size || "large";
            const pp = { ...p, discountPrice: p.discount_price };
            const Price = () => hasDiscount(pp) ? <><s className="old">{rupiah(p.price)}</s> <b>{rupiah(effPrice(pp))}</b></> : <b>{rupiah(p.price)}</b>;
            if (sz === "tiny") return (
              <button key={p.id} className="sp sp-tiny" onClick={() => open(p)}><span className="t">{p.name}</span><span className="pr"><Price /></span></button>
            );
            return (
              <button key={p.id} className={"sp " + (sz === "small" ? "sp-small" : "sp-large")} onClick={() => open(p)}>
                {p.cover_url ? <img className="cv" src={p.cover_url} alt={p.name} loading="lazy" /> : <div className="th cv">{p.type.charAt(0)}</div>}
                <div className="body"><div className="t">{p.name}</div><div className="small muted">{p.type}</div><div className="pr"><Price /></div></div>
              </button>
            );
          })}
        </div>
        <div className="poweredby">Dibuat dengan <Link href="/" style={{ fontWeight: 700, color: "var(--brand-d)" }}>Evegrow</Link></div>
      </div>
      {pick && <Checkout product={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

function Checkout({ product, onClose }) {
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [wantPhone, setWantPhone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const price = effPrice({ price: product.price, discountPrice: product.discount_price });

  const pay = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, name: f.name, email: f.email, phone: wantPhone ? f.phone : "" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal membuat pesanan.");
      window.location.href = j.manual ? j.orderUrl : j.invoiceUrl; // manual: halaman cara bayar ke penjual; Xendit: halaman pembayaran
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <div className="modalbg" onClick={onClose} role="dialog" aria-modal="true" aria-label="Detail produk dan checkout">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h2 style={{ fontSize: 24 }}>{product.name}</h2><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Tutup</button></div>
        {product.cover_url && <img className="pcover" src={product.cover_url} alt={product.name} />}
        {product.landing_url && <img className="pcover" src={product.landing_url} alt={"Halaman " + product.name} />}
        {product.html_code && <iframe className="phtml" title={"Detail " + product.name} sandbox="" srcDoc={product.html_code} />}
        {product.description && <p className="muted" style={{ margin: "12px 0", whiteSpace: "pre-wrap" }}>{product.description}</p>}
        <div style={{ font: "700 24px var(--fd)", margin: "8px 0 16px" }}>
          {product.discount_price && product.discount_price < product.price && <s className="old" style={{ marginRight: 8 }}>{rupiah(product.price)}</s>}
          {rupiah(price)}
        </div>
        <form onSubmit={pay}>
          <div className="field"><label htmlFor="bn">Nama</label><input id="bn" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="be">Email</label><input id="be" className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <label className="check"><input type="checkbox" checked disabled readOnly /> Kirim produk ke email ini (wajib)</label></div>
          <div className="field">
            <label className="check"><input type="checkbox" checked={wantPhone} onChange={(e) => setWantPhone(e.target.checked)} /> Tambahkan nomor HP (opsional)</label>
            {wantPhone && <input id="bp" className="input" style={{ marginTop: 8 }} type="tel" inputMode="tel" placeholder="081234567890" aria-label="Nomor HP" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}
          </div>
          {err && <div className="err" style={{ marginTop: 14 }} role="alert">{err}</div>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={busy}>{busy ? "Memproses…" : `Beli ${rupiah(price)}`}</button>
        </form>
      </div>
    </div>
  );
}
