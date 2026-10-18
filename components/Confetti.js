"use client";
import { useEffect, useRef } from "react";

const COLORS = ["#7C3AED", "#A78BFA", "#FFC94A", "#F472B6", "#34D399", "#60A5FA", "#FFFFFF"];

// Semburan confetti ala party popper: dari dua sudut bawah layar + satu dari tengah.
// Dilewati otomatis bila pengguna mengaktifkan "kurangi gerakan" di perangkatnya.
export default function Confetti({ onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { onDone?.(); return; }
    const cv = ref.current, ctx = cv.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const size = () => { W = window.innerWidth; H = window.innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    window.addEventListener("resize", size);

    const ps = [];
    const burst = (x, y, angle, n) => {
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * 0.95, sp = 11 + Math.random() * 14;
        ps.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 6 + Math.random() * 7, h: 4 + Math.random() * 5,
          r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.45, c: COLORS[(Math.random() * COLORS.length) | 0],
          round: Math.random() < 0.25, life: 0, max: 130 + Math.random() * 90 });
      }
    };
    burst(0, H, -Math.PI / 3.2, 110);
    burst(W, H, -Math.PI + Math.PI / 3.2, 110);
    const t2 = setTimeout(() => burst(W / 2, H * 0.92, -Math.PI / 2, 90), 350);

    let raf, frames = 0;
    const tick = () => {
      frames++;
      ctx.clearRect(0, 0, W, H);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.vy += 0.28; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
        if (p.life > p.max || p.y > H + 40) { ps.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.min(1, (p.max - p.life) / 40);
        ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.h / 1.4, 0, 6.3); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (ps.length || frames < 30) raf = requestAnimationFrame(tick); else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(t2); window.removeEventListener("resize", size); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
