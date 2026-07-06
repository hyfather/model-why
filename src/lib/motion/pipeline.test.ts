import { describe, expect, it } from 'vitest';
import { LowPass } from './filters';
import { JerkEstimator } from './jerk';
import { QueasinessEstimator } from './queasiness';
import { jerkBand } from '../../config/comfort';
import { MotionPipeline } from './pipeline';

describe('motion pipeline', () => {
  it('attenuates 10 Hz road vibration', () => {
    const filter=new LowPass(1.5); let peak=0;
    for(let i=0;i<600;i++){const output=filter.next(Math.sin(2*Math.PI*10*i/60),1/60);if(i>120)peak=Math.max(peak,Math.abs(output));}
    expect(peak).toBeLessThan(.2);
  });
  it('flags one abrupt ramp region', () => {
    const estimator=new JerkEstimator(1);let entries=0,red=false;
    for(let i=0;i<180;i++){const t=i/60,a=Math.min(1,t/.1),next=jerkBand(estimator.next(a,1/60))==='red';if(next&&!red)entries++;red=next;}
    expect(entries).toBe(1);
  });
  it('builds sickness from stop-and-go oscillation', () => {
    const estimator=new QueasinessEstimator();let value=0;
    for(let i=0;i<180*10;i++){const t=i/10;value=estimator.update(2*Math.sin(2*Math.PI*.3*t),0,.1,t);}
    expect(value).toBeGreaterThanOrEqual(45);
  });
  it('detects a handheld direction reversal as jerk', () => {
    const pipeline=new MotionPipeline({x:0,y:0,z:1});let peak=0;
    for(let i=0;i<120;i++){const x=i<60?1:-1;const output=pipeline.next({acceleration:{x,y:0,z:0},includingGravity:{x,y:0,z:9.81},dt:1/60,timestamp:i/60*1000});if(i>=60)peak=Math.max(peak,output.jerk);}
    expect(peak).toBeGreaterThan(2);
  });
});
