import * as THREE from "three";

/**
 * The unit quad every instanced billboard in this scene expands from.
 * -----------------------------------------------------------------------------
 * Built by hand rather than by borrowing `PlaneGeometry`'s buffers, which is
 * what this used to do. Copying an attribute out of a throwaway `PlaneGeometry`
 * and then calling `dispose()` on it means two geometries share one attribute
 * object while one of them has been told to release its GPU buffers. It happens
 * to be harmless today only because the throwaway is disposed before it is ever
 * rendered, so the renderer has no buffer recorded for it — a coincidence of
 * ordering, not a guarantee, and exactly the kind of thing that turns into an
 * invisible "geometry disappears on the second mount" bug later.
 *
 * Four vertices and six indices is also simply less work than constructing a
 * PlaneGeometry to throw it away.
 *
 * Corners are at ±0.5, so `length(position.xy)` runs 0 at the centre to ~0.707
 * at a corner. Every fragment shader here discards beyond 0.5, which is what
 * turns the quad into a disc.
 */
export function quadAttributes(): {
  position: THREE.BufferAttribute;
  index: THREE.BufferAttribute;
} {
  // prettier-ignore
  const position = new THREE.Float32BufferAttribute(
    new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0,
    ]),
    3,
  );

  const index = new THREE.Uint16BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1);

  return { position, index };
}
