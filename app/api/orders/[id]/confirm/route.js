import { admin, siteUrl, userFromRequest } from "@/lib/server";
import { sendBuyerReceipt, emailReady } from "@/lib/email";

export const dynamic = "force-dynamic";

// Mode admin penjual: konfirmasi dana masuk -> produk otomatis dikirim ke email pembeli.
// Hanya pemilik toko (penjual produk tersebut) yang boleh memanggil ini.
export async function POST(req, { params }) {
  try {
    const user = await userFromRequest(req);
    if (!user) return Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
    const { action } = await req.json().catch(() => ({}));
    if (!["confirm", "reject", "resend"].includes(action)) return Response.json({ error: "Aksi tidak valid." }, { status: 400 });

    const db = admin();
    const { data: o } = await db.from("orders").select("id, seller_id, status, payment_mode, proof_path").eq("id", params.id).maybeSingle();
    if (!o || o.seller_id !== user.id) return Response.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
    if (o.payment_mode !== "manual") return Response.json({ error: "Pesanan ini dibayar lewat Xendit dan terkonfirmasi otomatis." }, { status: 400 });

    const site = siteUrl(req);
    if (action === "reject") {
      const { data } = await db.from("orders").update({ status: "rejected" }).eq("id", o.id).eq("status", "pending").select("id").maybeSingle();
      if (!data) return Response.json({ error: "Pesanan sudah diproses." }, { status: 409 });
      return Response.json({ ok: true });
    }
    if (action === "confirm") {
      if (o.status === "pending" && !o.proof_path) return Response.json({ error: "Pembeli belum mengunggah bukti transfer." }, { status: 409 });
      const { error } = await db.rpc("mark_order_manual", { p_order: o.id, p_seller: user.id });
      if (error) return Response.json({ error: error.message }, { status: 409 });
    } else if (o.status !== "paid") {
      return Response.json({ error: "Pesanan belum dikonfirmasi." }, { status: 409 });
    }
    const email = emailReady() ? await sendBuyerReceipt(db, o.id, site, { resend: action === "resend" }) : "disabled";
    return Response.json({ ok: true, email });
  } catch (e) {
    return Response.json({ error: e.message || "Terjadi kesalahan." }, { status: 500 });
  }
}
