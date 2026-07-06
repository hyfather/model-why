export class LowPass {
  private value = 0;
  private initialized = false;
  constructor(private readonly cutoffHz: number) {}
  next(input: number, dt: number) {
    if (!this.initialized) { this.value = input; this.initialized = true; return input; }
    const rc = 1 / (2 * Math.PI * this.cutoffHz);
    const alpha = Math.max(0, Math.min(1, dt / (rc + dt)));
    this.value += alpha * (input - this.value);
    return this.value;
  }
  reset(value = 0) { this.value = value; this.initialized = false; }
}

export class CascadedLowPass {
  private a: LowPass; private b: LowPass;
  constructor(hz: number) { this.a = new LowPass(hz); this.b = new LowPass(hz); }
  next(value: number, dt: number) { return this.b.next(this.a.next(value, dt), dt); }
  reset() { this.a.reset(); this.b.reset(); }
}
