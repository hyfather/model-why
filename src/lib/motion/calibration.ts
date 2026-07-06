import { add, horizontal, norm, normalize, scale, type Vec3 } from './frame';

export type CalibrationFrame = { mode: 'mounted' | 'handheld'; gravity: Vec3; forward?: Vec3; calibratedAt: number };

/** Finds a sustained, coherent horizontal acceleration—the car's initial drive-off. */
export class ForwardCapture {
  private vector: Vec3 = { x: 0, y: 0, z: 0 };
  private energy = 0;
  private activeSeconds = 0;
  private quietSeconds = 0;

  constructor(private readonly gravity: Vec3) {}

  add(acceleration: Vec3, dt: number) {
    const candidate = horizontal(acceleration, this.gravity);
    const magnitude = norm(candidate);
    if (magnitude >= 0.18 && magnitude <= 3.5) {
      this.vector = add(this.vector, scale(candidate, dt));
      this.energy += magnitude * dt;
      this.activeSeconds += dt;
      this.quietSeconds = 0;
    } else if (this.activeSeconds > 0) {
      this.quietSeconds += dt;
      if (this.quietSeconds > 0.35) this.reset();
    }
  }

  get progress() { return Math.min(1, this.activeSeconds / 0.9); }
  get meanAcceleration() { return this.activeSeconds ? this.energy / this.activeSeconds : 0; }
  get coherence() { return this.energy ? norm(this.vector) / this.energy : 0; }
  result(): Vec3 | null {
    return this.activeSeconds >= 0.9 && this.meanAcceleration >= 0.25 && this.coherence >= 0.78
      ? normalize(this.vector)
      : null;
  }
  reset() { this.vector = {x:0,y:0,z:0}; this.energy=0; this.activeSeconds=0; this.quietSeconds=0; }
}
