/**
 * Gauge geometry. A needle that points at the wrong number looks entirely
 * plausible on screen — nothing about a mis-scaled dial appears broken — so this
 * is exactly the maths that needs pinning rather than eyeballing.
 */
import { describe, expect, it } from "vitest";
import { BASE_STOPS, fractionFor, labelFor, needleAngle, pointOnArc, scaleFor } from "../gauge.js";

describe("fractionFor", () => {
  it("puts every marked stop at an even division of the arc", () => {
    BASE_STOPS.forEach((stop, index) => {
      expect(fractionFor(stop, BASE_STOPS)).toBeCloseTo(index / (BASE_STOPS.length - 1), 6);
    });
  });

  it("interpolates inside a bracket", () => {
    // 75 sits halfway between the 50 and 100 stops, so halfway between their
    // arc positions — not at 7.5% of the dial, which a linear scale would give.
    const midpoint = (fractionFor(50, BASE_STOPS) + fractionFor(100, BASE_STOPS)) / 2;
    expect(fractionFor(75, BASE_STOPS)).toBeCloseTo(midpoint, 6);
  });

  it("gives the range real connections live in more dial than a linear scale would", () => {
    // The whole reason for a compressed scale: 20-300 Mbps covers most users,
    // and on a linear 0-1000 dial it would be squeezed into 28% of the arc.
    const compressed = fractionFor(300, BASE_STOPS) - fractionFor(20, BASE_STOPS);
    const linear = (300 - 20) / 1000;
    expect(compressed).toBeGreaterThan(linear * 1.35);
  });

  it("clamps instead of spinning the needle off the end", () => {
    expect(fractionFor(-50, BASE_STOPS)).toBe(0);
    expect(fractionFor(999_999, BASE_STOPS)).toBe(1);
  });

  it("survives a degenerate scale", () => {
    expect(fractionFor(10, [])).toBe(0);
    expect(fractionFor(10, [5])).toBe(0);
  });

  it("is monotonic — more speed never moves the needle backwards", () => {
    let last = -1;
    for (let value = 0; value <= 1000; value += 7) {
      const fraction = fractionFor(value, BASE_STOPS);
      expect(fraction).toBeGreaterThanOrEqual(last);
      last = fraction;
    }
  });
});

describe("scaleFor", () => {
  it("uses the standard scale below a gigabit", () => {
    expect(scaleFor(0)).toEqual([...BASE_STOPS]);
    expect(scaleFor(940)).toEqual([...BASE_STOPS]);
  });

  it("grows past a gigabit rather than pinning at full", () => {
    const scale = scaleFor(1800);
    expect(scale[scale.length - 1]).toBe(2500);
    expect(fractionFor(1800, scale)).toBeLessThan(1);
  });

  it("never shrinks mid-run, so a rising number cannot appear to fall", () => {
    const wide = scaleFor(4000);
    const afterDip = scaleFor(120, wide);
    expect(afterDip[afterDip.length - 1]).toBe(wide[wide.length - 1]);
  });

  it("caps at the largest ceiling for absurd inputs", () => {
    const scale = scaleFor(500_000);
    expect(scale[scale.length - 1]).toBe(10_000);
  });
});

describe("labelFor", () => {
  it("abbreviates gigabit stops", () => {
    expect(labelFor(0)).toBe("0");
    expect(labelFor(750)).toBe("750");
    expect(labelFor(1000)).toBe("1G");
    expect(labelFor(2500)).toBe("2.5G");
    expect(labelFor(10_000)).toBe("10G");
  });
});

describe("pointOnArc", () => {
  it("returns coordinates every engine agrees on, so SSR can hydrate", () => {
    // Math.sin/cos are not required to be correctly rounded, so Node and the
    // browser can disagree in the last bit. React then reports a hydration
    // mismatch on every page load and refuses to patch it up. Rounding to a
    // precision far below one device pixel makes the two agree exactly.
    for (const fraction of [0, 0.1, 0.25, 1 / 3, 0.5, 0.777, 1]) {
      const { x, y } = pointOnArc(fraction, 158, 200, 200);
      // At most three decimals: anything longer is engine-dependent noise.
      expect(String(x).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
      expect(String(y).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
    }
  });

  it("runs left → top → right across a 180° dial", () => {
    const left = pointOnArc(0, 100, 200, 200);
    const top = pointOnArc(0.5, 100, 200, 200);
    const right = pointOnArc(1, 100, 200, 200);

    expect(left.x).toBeCloseTo(100, 6);
    expect(left.y).toBeCloseTo(200, 6);
    expect(top.x).toBeCloseTo(200, 6);
    expect(top.y).toBeCloseTo(100, 6); // SVG y grows downward
    expect(right.x).toBeCloseTo(300, 6);
    expect(right.y).toBeCloseTo(200, 6);
  });

  it("handles the static site's 270° dial from the same function", () => {
    const arc = { start: 135, sweep: 270 };
    const first = pointOnArc(0, 100, 0, 0, arc);
    const last = pointOnArc(1, 100, 0, 0, arc);
    const top = pointOnArc(0.5, 100, 0, 0, arc);

    // A 270° dial opens at the bottom: both ends sit below centre, symmetrically.
    expect(first.x).toBeCloseTo(-70.71, 2);
    expect(last.x).toBeCloseTo(70.71, 2);
    expect(first.y).toBeCloseTo(70.71, 2);
    expect(last.y).toBeCloseTo(70.71, 2);
    expect(top.y).toBeCloseTo(-100, 2); // straight up, y grows downward
  });
});

describe("needleAngle", () => {
  it("points an up-drawn needle left, up, then right across a 180° dial", () => {
    expect(needleAngle(0)).toBeCloseTo(-90, 6);
    expect(needleAngle(0.5)).toBeCloseTo(0, 6);
    expect(needleAngle(1)).toBeCloseTo(90, 6);
  });

  it("matches the rotation the static site's 270° dial already uses", () => {
    // app.js rotates its needle by `fraction * 270 - 135`.
    const arc = { start: 135, sweep: 270 };
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      expect(needleAngle(fraction, arc)).toBeCloseTo(fraction * 270 - 135, 6);
    }
  });
});
