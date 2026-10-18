import { admin, createInvoice, siteUrl, xenditReady } from "@/lib/server";

export const dynamic = "force-dynamic";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^(\+62|62|0)8[0-9]{7,12}$/;

export async function POST(req) {
  try {
    const { productId, name, email, phone } = await req.json();
    if (!productId || !name?.trim() || !EMAIL.test(email || "")) return Response.json({ error: "Nama atau email belum benar." }, { status: 400 });
    const ph = String(phone || "").replace(/[\s-]/g, "");
    if (ph && !PHONE.test(ph)) return Response.json({ error: "Nomor HP tidak valid. Contoh: 081234567890." }, { status: 400 });

    const db = admin();
    const { data: prod } = await db.from("products").select("id, seller_id, name, price, discount_price, active").eq("id", productId).maybeSingle();
    if (!prod || !prod.active) return Response.json({ error: "Produk tidak tersedia." }, { status: 404 });
    const { data: seller } = await db.from("profiles").select("suspended").eq("id", prod.seller_id).single();
    if (seller?.suspended) return Response.json({ error: "Toko ini sedang tidak aktif." }, { status: 404 });

    // Harga (termasuk diskon) selalu dihitung di server, bukan dari browser
    const amount = prod.discount_price && prod.discount_price < prod.price ? prod.discount_price : prod.price;

    // Jika penjual mengisi rekening/QRIS, pembayaran langsung ke penjual (manual, dikonfirmasi penjual).
    // Jika tidak, pakai Xendit (uang lewat platform).
    const { data: st } = await db.from("stores").select("pay_account, pay_qris_url").eq("user_id", prod.seller_id).maybeSingle();
    const manual = !!(st && (st.pay_account || st.pay_qris_url));
    if (!manual && !xenditReady()) return Response.json({ error: "Penjual belum mengatur metode pembayaran." }, { status: 503 });

    const { data: order, error } = await db.from("orders").insert({
      seller_id: prod.seller_id, product_id: prod.id, product_name: prod.name,
      buyer_name: name.trim().slice(0, 80), buyer_email: email.trim().toLowerCase(), buyer_phone: ph || null,
      amount, payment_mode: manual ? "manual" : "xendit",
    }).select("id, access_token").single();
    if (error) throw error;

    const site = siteUrl(req);
    const back = `${site}/pesanan/${order.id}?t=${order.access_token}`;
    if (manual) return Response.json({ manual: true, orderUrl: back, orderId: order.id });

    try {
      const inv = await createInvoice({
        external_id: order.id, amount, currency: "IDR", payer_email: email.trim(),
        description: prod.name, invoice_duration: 86400, success_redirect_url: back, failure_redirect_url: back,
      });
      await db.from("orders").update({ invoice_id: inv.id }).eq("id", order.id);
      return Response.json({ invoiceUrl: inv.invoice_url, orderId: order.id });
    } catch (e) {
      await db.from("orders").update({ status: "expired" }).eq("id", order.id);
      throw e;
    }
  } catch (e) {
    return Response.json({ error: e.message || "Terjadi kesalahan." }, { status: 500 });
  }
}
