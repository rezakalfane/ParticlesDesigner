/** Signed shortest travel around a periodic range. Half-turn ties retain direction. */
export function cyclicDelta(a: number, b: number, period: number): number {
  const raw = b - a;
  if (period <= 0) return raw;
  let delta = raw % period;
  if (delta > period / 2) delta -= period;
  if (delta < -period / 2) delta += period;
  return delta;
}

export function interpolateNumeric(
  p: { min: number; max: number; interpolation?: "cyclic" },
  a: number,
  b: number,
  t: number,
): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (p.interpolation !== "cyclic" || p.max <= p.min) return a + (b - a) * t;
  const period = p.max - p.min;
  const value = a + cyclicDelta(a, b, period) * t;
  return value >= p.min && value <= p.max
    ? value
    : p.min + ((((value - p.min) % period) + period) % period);
}
