import Link from "next/link";

// Logo Evegrow: tanda "E" ungu + teks. Dibuat sebagai SVG/teks, jadi tajam di semua ukuran dan tanpa file gambar.
export default function Logo({ href = "/", height = 36 }) {
  return (
    <Link href={href} className="logo" aria-label="Evegrow beranda" style={{ display: "inline-flex", alignItems: "center", gap: Math.round(height * 0.28) }}>
      <svg width={height} height={height} viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="var(--brand)" />
        <rect x="11" y="10" width="5" height="20" rx="2.5" fill="#fff" />
        <rect x="11" y="10" width="18" height="5" rx="2.5" fill="#fff" />
        <rect x="11" y="17.5" width="14" height="5" rx="2.5" fill="#fff" />
        <rect x="11" y="25" width="18" height="5" rx="2.5" fill="#fff" />
      </svg>
      <span style={{ font: `800 ${Math.round(height * 0.64)}px var(--fd)`, letterSpacing: "-.02em", color: "var(--brand)", lineHeight: 1 }}>Evegrow</span>
    </Link>
  );
}
