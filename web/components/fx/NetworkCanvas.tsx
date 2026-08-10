"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { rand } from "@/lib/utils";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: string;
}

const PALETTE = ["#818cf8", "#22d3ee", "#c4b5fd", "#67e8f9"];
const LINK_DISTANCE = 148;
const POINTER_RADIUS = 190;

/**
 * The animated network graph behind the hero — the visual metaphor for the
 * product. Nodes drift, nearby nodes link, and the pointer pushes them apart.
 *
 * Three things keep this cheap:
 *   1. It pauses via IntersectionObserver the moment it scrolls out of view.
 *   2. Node count scales with area, so phones draw far fewer particles.
 *   3. Under `prefers-reduced-motion` it renders one static frame and stops.
 */
export function NetworkCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let frame = 0;
    let visible = true;
    const pointer = { x: -9999, y: -9999 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap: 3x costs 2.25x fill for no visible gain
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      if (!width || !height) return;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(96, Math.max(28, Math.floor((width * height) / 15000)));
      nodes = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: rand(-0.22, 0.22),
        vy: rand(-0.16, 0.16),
        radius: index % 8 === 0 ? 2.6 : 1.3,
        hue: PALETTE[index % PALETTE.length] ?? "#22d3ee",
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (!node) continue;

        if (!reduced) {
          node.x += node.vx;
          node.y += node.vy;

          // Gentle repulsion so the graph reacts to the cursor.
          const dx = node.x - pointer.x;
          const dy = node.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < POINTER_RADIUS && distance > 0.5) {
            const push = (1 - distance / POINTER_RADIUS) * 0.7;
            node.x += (dx / distance) * push;
            node.y += (dy / distance) * push;
          }

          // Wrap rather than bounce — bouncing makes the edges visible.
          if (node.x < -24) node.x = width + 24;
          if (node.x > width + 24) node.x = -24;
          if (node.y < -24) node.y = height + 24;
          if (node.y > height + 24) node.y = -24;
        }

        for (let j = i + 1; j < nodes.length; j += 1) {
          const other = nodes[j];
          if (!other) continue;
          const distance = Math.hypot(node.x - other.x, node.y - other.y);
          if (distance < LINK_DISTANCE) {
            ctx.strokeStyle = `rgba(129, 140, 248, ${0.2 * (1 - distance / LINK_DISTANCE)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        }
      }

      for (const node of nodes) {
        ctx.beginPath();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = node.hue;
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!reduced && visible) frame = window.requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };
    const onPointerLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    // Stop drawing entirely once the hero scrolls away.
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        if (visible && !reduced) {
          window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(draw);
        }
      },
      { threshold: 0 },
    );
    observer.observe(canvas);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    resizeObserver.observe(canvas);

    resize();
    draw();

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
