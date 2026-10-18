import { admin } from "@/lib/server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pembeli membuka halaman pesanan dengan nomor pesanan + token rahasia (ada di link)
export async function GET(req, { params }) {
  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!UUID.test(token)) return Response.json({ error: "Link tidak valid." }, { status: 400 });
    const db = admin();
    const { data: o } = await db.from("orders").select("id, seller_id, status, product_id, product_name, amount, payment_mode, buyer_claimed_at").eq("id", params.id).eq("access_token", token).maybeSingle();
    if (!o) return Response.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });

    if (o.status !== "paid") {
      const out = { status: o.status, productName: o.product_name, amount: o.amount, mode: o.payment_mode };
      if (o.payment_mode === "manual" && o.status === "pending") {
        const { data: st } = await db.from("stores").select("name, pay_bank, pay_account, pay_holder, pay_qris_url").eq("user_id", o.seller_id).maybeSingle();
        out.claimed = !!o.buyer_claimed_at;
        out.pay = { storeName: st?.name || "", bank: st?.pay_bank || "", account: st?.pay_account || "", holder: st?.pay_holder || "", qris: st?.pay_qris_url || "" };
      }
      return Response.json(out);
    }

    const { data: f } = await db.from("product_files").select("file_url").eq("product_id", o.product_id).maybeSingle();
    if (!f) return Response.json({ status: "paid", productName: o.product_name, url: null });
    let url = f.file_url;
    if (!/^https?:\/\//i.test(url)) {
      const { data, error } = await db.storage.from("product-files").createSignedUrl(url, 3600);
      if (error) throw error;
      url = data.signedUrl;
    }
    return Response.json({ status: "paid", productName: o.product_name, url });
  } catch (e) {
    return Response.json({ error: e.message || "Terjadi kesalahan." }, { status: 500 });
  }
}
