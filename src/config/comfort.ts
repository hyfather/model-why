export const COMFORT = {
  acceleration: { greenMax: 1.1, yellowMax: 2.5, displayMax: 4 },
  jerk: { greenMax: 0.9, yellowMax: 2 },
  filters: { accelerationHz: 1.5, jerkHz: 1 },
  queasiness: { halfLifeSeconds: 90, cycleMinSeconds: 2, cycleMaxSeconds: 10 },
  calibrationSeconds: 2,
} as const;

export type Band = 'green' | 'yellow' | 'red';
export const bandFor = (value: number, green: number, yellow: number): Band =>
  Math.abs(value) <= green ? 'green' : Math.abs(value) <= yellow ? 'yellow' : 'red';
export const accelerationBand = (v: number) => bandFor(v, COMFORT.acceleration.greenMax, COMFORT.acceleration.yellowMax);
export const jerkBand = (v: number) => bandFor(v, COMFORT.jerk.greenMax, COMFORT.jerk.yellowMax);
