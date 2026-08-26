"use client";

/**
 * Pointer position for the camera rig.
 * -----------------------------------------------------------------------------
 * `CameraRig` used to read `state.pointer` from React Three Fiber, and it had
 * never once received a value. R3F binds its pointer listeners to the Canvas's
 * own container element, and that container sits inside TWO `pointer-events-none`
 * ancestors — the wrapper in `NetworkStage` and the parallax layer in `Hero`,
 * both of which need it, because the canvas must never intercept a click meant
 * for the Start button behind it. So no `pointermove` ever reached the canvas,
 * `state.pointer` stayed at (0, 0), and the carefully damped parallax eased
 * toward zero forever. A shipped, documented feature that did nothing.
 *
 * The fix is not to re-enable pointer events on the canvas — that would put a
 * transparent WebGL surface in front of the page's primary control. It is to
 * listen on the hero `<section>` instead, which is an ancestor of the
 * pointer-events-none layers and therefore still the hit target for the whole
 * hero area.
 *
 * Module-scoped and mutated in place, for the same reason as `drive` and
 * `clock`: it is read inside `useFrame` at display rate and must never cause a
 * React render.
 *
 * NOTE ON THE ALTERNATIVE: R3F's `eventSource` + `eventPrefix="client"` looks
 * like the idiomatic answer and is wrong here. Fiber 9.7's default `compute`
 * divides raw `clientX/Y` by the canvas SIZE with no rect offset, and this
 * canvas is not viewport-anchored — the hero has `pt-28`/`pt-40` and the whole
 * layer is translated up to 140px by the scroll parallax. The resulting NDC
 * would be off by the scroll offset plus the parallax offset.
 */

export const pointerDrive = {
  /** -1 (left edge) to 1 (right edge) of the hero. */
  x: 0,
  /** -1 (bottom) to 1 (top) of the hero, y-up to match NDC convention. */
  y: 0,
  /** True once a real pointer has been seen; lets the light tier keep drifting. */
  engaged: false,
  /**
   * Hero scroll progress, 0 at the top to 1 when it has scrolled away.
   *
   * Published here rather than through a motion value so `CameraRig` can dolly
   * the camera on scroll without a React render. Hero used to translate the
   * whole canvas rectangle instead, which slides a frozen image around while
   * its internal parallax stays put.
   */
  scrollP: 0,
};

/**
 * The pointer projected onto the scene's z = 0 plane, in world units.
 *
 * Computed once per frame by the scene (a raycast is not free enough to run
 * per material) and read by every shader that reacts to the cursor. Mutated in
 * place, never replaced.
 */
export const pointerWorld = { x: 0, y: 0, z: 0, force: 0 };

/**
 * Attach the listener to an element and keep a cached rect.
 *
 * The rect is cached and refreshed on scroll/resize rather than read inside the
 * move handler. `getBoundingClientRect()` forces a style+layout flush, and doing
 * that on every `pointermove` over a hero containing a backdrop-filtered glass
 * panel is a reliable way to turn a free feature into jank.
 *
 * @returns a teardown function.
 */
export function trackPointer(element: HTMLElement): () => void {
  let rect = element.getBoundingClientRect();

  const measure = () => {
    rect = element.getBoundingClientRect();
  };

  const onMove = (event: PointerEvent) => {
    if (rect.width === 0 || rect.height === 0) return;
    // Clamped: the listener is on the section, but a pointer can be over a
    // child that extends past it, and an unclamped value would swing the camera
    // further than the design allows.
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pointerDrive.x = Math.max(-1, Math.min(1, x));
    // Screen y grows downward; NDC and the camera rig both expect y-up.
    pointerDrive.y = Math.max(-1, Math.min(1, -y));
    pointerDrive.engaged = true;
  };

  const onLeave = () => {
    // Ease home rather than freezing wherever the cursor left the hero. The
    // flag lets the scene decay its cursor-driven effects instead of holding
    // them frozen mid-bulge.
    pointerDrive.x = 0;
    pointerDrive.y = 0;
    pointerDrive.engaged = false;
  };

  element.addEventListener("pointermove", onMove, { passive: true });
  element.addEventListener("pointerleave", onLeave, { passive: true });
  window.addEventListener("scroll", measure, { passive: true });
  window.addEventListener("resize", measure, { passive: true });

  return () => {
    element.removeEventListener("pointermove", onMove);
    element.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("scroll", measure);
    window.removeEventListener("resize", measure);
  };
}
