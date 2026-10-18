import { admin } from "@/lib/server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 3 * 1024 * 1024;

// Cek isi file (bukan hanya tipe yang dikirim browser): JPEG, PNG, atau WebP
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["image/jpeg", "jpg"];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ["image/png", "png"];
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return ["image/webp", "webp"];
  return null;
}

// Pembeli mengirim BUKTI TRANSFER (wajib) lalu menandai "sudah bayar". Produk baru dikirim setelah penjual konfirmasi.
export async function POST(req, { params }) {
  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!UUID.test(token)) return Response.json({ error: "Link tidak valid." }, { status: 400 });
    const form = await req.formData().catch(() => null);
    const file = form?.get("proof");
    if (!file || typeof file === "string") return Response.json({ error: "Unggah foto bukti transfer terlebih dahulu." }, { status: 400 });
    if (file.size > MAX) return Response.json({ error: "Ukuran foto maksimal 3 MB." }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniff(buf);
    if (!kind) return Response.json({ error: "Bukti harus berupa foto JPG, PNG, atau WebP." }, { status: 400 });

    const db = admin();
    const { data: o } = await db.from("orders").select("id, seller_id, proof_path").eq("id", params.id).eq("access_token", token).eq("payment_mode", "manual").eq("status", "pending").maybeSingle();
    if (!o) return Response.json({ error: "Pesanan tidak ditemukan atau sudah diproses." }, { status: 404 });

    const path = `${o.seller_id}/${o.id}-${Date.now()}.${kind[1]}`;
    const up = await db.storage.from("payment-proofs").upload(path, buf, { contentType: kind[0] });
    if (up.error) throw up.error;
    const { error } = await db.from("orders").update({
      proof_path: path, buyer_claimed_at: new Date().toISOString(),
      buyer_note: String(form.get("note") || "").slice(0, 120) || null,
    }).eq("id", o.id).eq("status", "pending");
    if (error) throw error;
    if (o.proof_path) await db.storage.from("payment-proofs").remove([o.proof_path]).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || "Terjadi kesalahan." }, { status: 500 });
  }
}
