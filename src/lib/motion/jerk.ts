import { LowPass } from './filters';
export class JerkEstimator {
  private previous: number | null = null;
  private filter: LowPass;
  constructor(cutoffHz = 1) { this.filter = new LowPass(cutoffHz); }
  next(acceleration: number, dt: number) { const raw=this.previous===null?0:(acceleration-this.previous)/Math.max(dt,.001); this.previous=acceleration; return this.filter.next(raw,dt); }
  reset() { this.previous=null; this.filter.reset(); }
}
