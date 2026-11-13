// The PolarisDX dot ring, measured from the printed logo. Shared by the logo, the QR code and the pages.
export const BRAND = { blue: '#4A86CF', grey: '#6B7079' };

// One quarter of the ring (the logo repeats it 4x, rotated by 90°):
// [angle° clockwise from 3 o'clock, distance from centre, dot radius], ring outer edge ≈ 100.
const QUARTER = [
  [-13, 84.1, 12.7], [12, 74.2, 10.7], [36.5, 94.0, 7.5], [55, 90.5, 9.9], // outer ring
  [36, 67.5, 7.9], [56, 62.3, 4.4], [71, 59.5, 3.2],                       // inner ring
  [12.5, 96.8, 2.8], [22.5, 96.8, 4.2],                                     // tiny outer pair
];
const DOT = 1.08; // dots read slightly fuller in print than the raw measurement
const f = (n) => +n.toFixed(2);

export function ringDots(cx = 0, cy = 0, scale = 1) {
  const dots = [];
  for (let q = 0; q < 4; q++) {
    for (const [a, d, r] of QUARTER) {
      const t = ((a + q * 90) * Math.PI) / 180;
      dots.push({ x: f(cx + Math.cos(t) * d * scale), y: f(cy + Math.sin(t) * d * scale), r: f(r * DOT * scale) });
    }
  }
  return dots;
}

export const ringSvgCircles = (cx = 0, cy = 0, scale = 1) =>
  ringDots(cx, cy, scale).map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}"/>`).join('');
