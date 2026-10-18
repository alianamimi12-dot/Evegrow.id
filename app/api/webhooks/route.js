import { admin, getInvoice, siteUrl } from "@/lib/server";
import { sendBuyerReceipt, sendSellerNotice } from "@/lib/email";

export const dynamic = "force-dynamic";

// Xendit memanggil alamat ini saat status tagihan berubah.
// Daftarkan di Xendit: Settings > Webhooks > Invoices paid & expired -> https://DOMAINMU/api/webhooks/xendit
export async function POST(req) {
  if (!process.env.XENDIT_CALLBACK_TOKEN || req.headers.get("x-callback-token") !== process.env.XENDIT_CALLBACK_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const p = await req.json();
    const db = admin();
    const ext = p.external_id;
    if (!p.id || !ext) return new Response("ok");

    if (p.status === "PAID" || p.status === "SETTLED") {
      // Jangan percaya isi webhook begitu saja: cek ulang langsung ke Xendit
      const inv = await getInvoice(p.id);
      if (!["PAID", "SETTLED"].includes(inv.status) || inv.external_id !== ext) return new Response("ok");
      const fn = ext.startsWith("PRO-") ? "activate_pro" : "mark_order_paid";
      const args = ext.startsWith("PRO-")
        ? { p_external: ext, p_invoice: inv.id, p_amount: inv.amount }
        : { p_order: ext, p_invoice: inv.id, p_amount: inv.amount };
      const { error } = await db.rpc(fn, args);
      if (error) throw error;
      if (!ext.startsWith("PRO-")) {
        // Kegagalan email tidak boleh menggagalkan webhook (pembayaran sudah tercatat)
        const site = siteUrl(req);
        await Promise.allSettled([sendBuyerReceipt(db, ext, site), sendSellerNotice(db, ext, site)]);
      }
    } else if (p.status === "EXPIRED" && !ext.startsWith("PRO-")) {
      await db.from("orders").update({ status: "expired" }).eq("id", ext).eq("status", "pending");
    }
    return new Response("ok");
  } catch (e) {
    console.error("webhook xendit gagal:", e.message);
    return new Response("error", { status: 500 }); // Xendit akan mencoba lagi
  }
}
