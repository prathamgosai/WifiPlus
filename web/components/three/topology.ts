import * as THREE from "three";
import { HOP_NAME } from "@/lib/hops";

/**
 * The network the scene draws.
 * -----------------------------------------------------------------------------
 * A deliberately small, named graph rather than a decorative particle cloud:
 * DEVICE to ROUTER to ISP to EDGE to INTERNET is the path a measurement
 * actually takes, and naming the hops is what makes the visual explain
 * something instead of merely moving.
 *
 * WHAT THIS IS NOT: the browser cannot see these hops. There is no ICMP, no
 * traceroute and no way to observe a router from a page. The scene is an
 * illustration of the path, animated by values the engine really did measure
 * (throughput, probe returns, phase) - not a live view of the path itself. The
 * caption rendered beside it says exactly that, and it must keep saying it.
 *
 * Coordinates are chosen so the chain reads left-to-right with enough Z spread
 * for parallax to be legible, while staying inside a frustum that also has to
 * hold the gauge in front of it without the two fighting.
 */

export type NodeKind = "device" | "router" | "isp" | "edge" | "internet" | "satellite";

export interface TopologyNode {
  id: string;
  kind: NodeKind;
  label: string;
  position: THREE.Vector3;
  /** Sphere radius in world units. The ISP is the visual anchor, so it is largest. */
  radius: number;
  /** Which stage lights this node. Empty means it is ambient. */
  litBy: Array<"discovering" | "latency" | "download" | "upload" | "complete">;
}

export interface TopologyLink {
  from: string;
  to: string;
  /** Share of the packet budget this link carries. Weighted toward the middle. */
  weight: number;
  /** How far the packet path bows away from the straight line, in world units. */
  curve: number;
}

/** The named hops. */
export const NODES: TopologyNode[] = [
  {
    id: "device",
    kind: "device",
    label: HOP_NAME.device ?? "Your device",
    position: new THREE.Vector3(-4.35, -0.45, 0.75),
    radius: 0.2,
    litBy: ["latency", "download", "upload", "complete"],
  },
  {
    id: "router",
    kind: "router",
    label: HOP_NAME.router ?? "Router",
    position: new THREE.Vector3(-2.15, 0.55, -0.25),
    radius: 0.17,
    litBy: ["latency", "download", "upload", "complete"],
  },
  {
    id: "isp",
    kind: "isp",
    label: HOP_NAME.isp ?? "ISP",
    position: new THREE.Vector3(0.05, -0.25, 0),
    radius: 0.32,
    litBy: ["latency", "download", "upload", "complete"],
  },
  {
    id: "edge",
    kind: "edge",
    label: HOP_NAME.edge ?? "Measurement edge",
    position: new THREE.Vector3(2.3, 0.65, -0.35),
    radius: 0.21,
    litBy: ["discovering", "latency", "download", "upload", "complete"],
  },
  {
    id: "internet",
    kind: "internet",
    label: HOP_NAME.internet ?? "Internet",
    position: new THREE.Vector3(4.45, -0.35, 0.55),
    radius: 0.25,
    litBy: ["download", "upload", "complete"],
  },
];

/** The measured path. Order is downstream; upload reverses the flow. */
export const LINKS: TopologyLink[] = [
  { from: "device", to: "router", weight: 0.9, curve: 0.28 },
  { from: "router", to: "isp", weight: 1.15, curve: -0.34 },
  { from: "isp", to: "edge", weight: 1.15, curve: 0.3 },
  { from: "edge", to: "internet", weight: 0.9, curve: -0.26 },
];

/**
 * Ambient nodes scattered behind the chain, suggesting the wider network the
 * edge sits in. Generated from a fixed seed so the layout is identical on every
 * load and between server and client - a random scatter would change on each
 * render and, in a component that can remount, visibly reshuffle.
 */
export function satellites(count: number): TopologyNode[] {
  const out: TopologyNode[] = [];
  // Golden-angle spiral: even coverage without clumping, and fully deterministic.
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const angle = i * golden;
    const radius = 3.1 + t * 3.4;
    out.push({
      id: `sat-${i}`,
      kind: "satellite",
      label: "",
      position: new THREE.Vector3(
        Math.cos(angle) * radius * 0.92,
        Math.sin(angle) * radius * 0.46,
        -2.4 - t * 3.6,
      ),
      // Graded with depth as well as dimmed by fog. Aerial perspective is
      // size AND value; attenuating brightness alone reads as a fade rather
      // than as distance.
      radius: (0.035 + (i % 5 === 0 ? 0.03 : 0)) * (1 - t * 0.45),
      litBy: [],
    });
  }
  return out;
}

/** Look-up so links can resolve endpoints without a scan per frame. */
export function nodeMap(nodes: TopologyNode[]): Map<string, TopologyNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}
