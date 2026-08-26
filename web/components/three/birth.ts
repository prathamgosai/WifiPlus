/**
 * The scene building itself.
 * -----------------------------------------------------------------------------
 * `NetworkStage` used to cross-dissolve into a canvas that was already at
 * steady state: packets pre-seeded across the whole 0-1 phase range, links
 * fully drawn, cores mid-breath, camera parked at the idle shot by a tween that
 * was literally a no-op (`base` is initialised to `SHOTS.idle`, then tweened to
 * `SHOTS.idle`). The most memorable second of a 3D site is the second it builds
 * itself, and this scene was skipping it.
 *
 * The subject is unusually well suited to it: the topology IS a path, so
 * drawing it in order — device, then router, then ISP, then edge, then the
 * wider internet — is simultaneously the best reveal available and a free
 * explanation of what the diagram means.
 *
 * 0 → 1 over ~2.2s on mount. Every consumer branches on it uniformly (the same
 * value for every fragment in a draw), so once it reaches 1 the branches are
 * uniform-coherent and the steady-state cost is nil.
 */
export const birth = { t: 0 };
