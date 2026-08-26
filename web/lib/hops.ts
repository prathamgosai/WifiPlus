/**
 * The named hops, without any 3D.
 * -----------------------------------------------------------------------------
 * Identity only — id and label. Deliberately free of any `three` import, and
 * that is the entire reason this file exists separately from
 * `components/three/topology.ts`.
 *
 * The hop legend in the hero is plain DOM: it must render on every tier,
 * including the one where no WebGL context is ever created. Importing the names
 * from `topology.ts` looked equivalent and cost 97 KB gzipped on the INITIAL
 * bundle, because that module imports `three` for its `Vector3` positions and
 * `Hero` is statically imported by the homepage. Measured, not guessed:
 * 211 KB → 308 KB from one import of a five-element array.
 *
 * `topology.ts` builds its scene nodes from this list, so the names still have
 * exactly one definition.
 */

export interface Hop {
  id: string;
  label: string;
}

/** Order is the path a measurement takes, and the order the legend reads in. */
export const HOPS: Hop[] = [
  { id: "device", label: "Your device" },
  { id: "router", label: "Router" },
  { id: "isp", label: "ISP" },
  { id: "edge", label: "Measurement edge" },
  { id: "internet", label: "Internet" },
];

/** Look-up for the few places that need a label from an id. */
export const HOP_NAME: Record<string, string> = Object.fromEntries(
  HOPS.map((hop) => [hop.id, hop.label]),
);
