"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import type { LiveGraphData, ThroughputPoint } from "@/hooks/useSpeedTest";
import type { TestPhase } from "@/types";

interface LiveGraphProps {
  graph: RefObject<LiveGraphData>;
  running: boolean;
  phase: TestPhase;
}

const DOWN_A = "#5b5ff0";
const DOWN_B = "#22d3ee";
const UP = "#a78bfa";

/**
 * Real-time throughput graph. Reads the measurement sample buffer on its own
 * requestAnimationFrame loop (up to 60 FPS) and plots the actual download and
 * upload readings as they arrive — no tweened fake curve. Because it reads a
 * ref rather than React state, the 25 Hz of samples never trigger a re-render.
 */
export function LiveGraph({ graph, running, phase }: LiveGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let interval = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const nice = (v: number) => {
      // Round the Y ceiling up to a friendly number so grid labels read cleanly.
      const pow = Math.pow(10, Math.floor(Math.log10(v)));
      const n = v / pow;
      const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
      return step * pow;
    };

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const padT = 10;
      const padB = 6;
      ctx.clearRect(0, 0, w, h);

      const fg = getComputedStyle(canvas).color; // theme-aware (muted) colour
      const g = graph.current;
      const points = [...g.down, ...g.up];
      const rawMax = points.reduce((m, p) => Math.max(m, p.v), 0);
      const maxV = nice(Math.max(rawMax * 1.15, 10));
      const maxT = Math.max(g.down.at(-1)?.t ?? 0, g.up.at(-1)?.t ?? 0, 3000);

      const xFor = (t: number) => (t / maxT) * w;
      const yFor = (v: number) => h - padB - (v / maxV) * (h - padT - padB);

      // grid + Y labels
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "bottom";
      for (let i = 1; i <= 4; i += 1) {
        const v = (maxV / 4) * i;
        const y = yFor(v);
        ctx.strokeStyle = "rgba(128,140,170,0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.55;
        ctx.fillText(`${Math.round(v)}`, 4, y - 2);
        ctx.globalAlpha = 1;
      }

      const series = (pts: ThroughputPoint[], stroke: string | CanvasGradient, fillTop: string) => {
        if (pts.length < 2) return;
        // area
        const grad = ctx.createLinearGradient(0, padT, 0, h);
        grad.addColorStop(0, fillTop);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.moveTo(xFor(pts[0]!.t), h);
        pts.forEach((p) => ctx.lineTo(xFor(p.t), yFor(p.v)));
        ctx.lineTo(xFor(pts[pts.length - 1]!.t), h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        // line
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(xFor(p.t), yFor(p.v)) : ctx.moveTo(xFor(p.t), yFor(p.v))));
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.25;
        ctx.lineJoin = "round";
        ctx.stroke();
        // endpoint dot
        const last = pts[pts.length - 1]!;
        ctx.beginPath();
        ctx.arc(xFor(last.t), yFor(last.v), 3, 0, Math.PI * 2);
        ctx.fillStyle = typeof stroke === "string" ? stroke : DOWN_B;
        ctx.fill();
      };

      const downGrad = ctx.createLinearGradient(0, 0, w, 0);
      downGrad.addColorStop(0, DOWN_A);
      downGrad.addColorStop(1, DOWN_B);
      series(g.down, downGrad, "rgba(34,211,238,0.22)");
      series(g.up, UP, "rgba(167,139,250,0.20)");

      // live value chips (top-left)
      ctx.textBaseline = "top";
      ctx.font = "700 12px ui-sans-serif, system-ui, sans-serif";
      const dv = g.down.at(-1)?.v;
      const uv = g.up.at(-1)?.v;
      if (dv !== undefined) {
        ctx.fillStyle = DOWN_B;
        ctx.fillText(`↓ ${dv.toFixed(1)} Mbps`, 8, 8);
      }
      if (uv !== undefined) {
        ctx.fillStyle = UP;
        ctx.fillText(`↑ ${uv.toFixed(1)} Mbps`, 8, 24);
      }
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);

    if (reduced) {
      // Reduced motion: refresh at a calm cadence instead of 60 FPS.
      draw();
      interval = window.setInterval(draw, 200);
    } else {
      const loop = () => {
        draw();
        raf = window.requestAnimationFrame(loop);
      };
      raf = window.requestAnimationFrame(loop);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(interval);
      ro.disconnect();
    };
    // Re-arm when the run starts/stops so the loop tracks the active phase.
  }, [graph, running, phase, reduced]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full text-[color:var(--page-fg-muted)]"
      role="img"
      aria-label="Live throughput graph — download and upload over time"
    />
  );
}
