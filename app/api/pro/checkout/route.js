import { admin, createInvoice, siteUrl, userFromRequest, xenditReady } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    if (!xenditReady()) return Response.json({ error: "Pembayaran belum dikonfigurasi." }, { status: 503 });
    const user = await userFromRequest(req);
    if (!user) return Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
    const db = admin();
    const { data: set } = await db.from("settings").select("pro_price").eq("id", 1).single();
    const external = `PRO-${user.id}-${Date.now()}`;
    const { error } = await db.from("pro_payments").insert({ user_id: user.id, external_id: external, amount: set.pro_price });
    if (error) throw error;
    const back = `${siteUrl(req)}/dashboard/saldo`;
    const inv = await createInvoice({
      external_id: external, amount: set.pro_price, currency: "IDR", payer_email: user.email,
      description: "Evegrow Pro 30 hari", invoice_duration: 86400, success_redirect_url: back, failure_redirect_url: back,
    });
    await db.from("pro_payments").update({ invoice_id: inv.id }).eq("external_id", external);
    return Response.json({ invoiceUrl: inv.invoice_url });
  } catch (e) {
    return Response.json({ error: e.message || "Terjadi kesalahan." }, { status: 500 });
  }
}
