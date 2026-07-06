import { describe, expect, it } from 'vitest';
import { ForwardCapture } from './calibration';
import { GravityCapture, projectVehicle } from './frame';

describe('vehicle-frame calibration', () => {
  it('learns gravity from a phone mounted at an arbitrary angle', () => {
    const capture = new GravityCapture();
    for (let i=0;i<120;i++) capture.add({x:6.94,y:0,z:6.94},{x:.01,y:0,z:0});
    expect(capture.result()?.x).toBeCloseTo(Math.SQRT1_2,2);
    expect(capture.result()?.z).toBeCloseTo(Math.SQRT1_2,2);
    expect(capture.accelerationRms()).toBeLessThan(.02);
  });

  it('learns a coherent forward axis from a gentle drive-off', () => {
    const capture = new ForwardCapture({x:0,y:0,z:1});
    for (let i=0;i<70;i++) capture.add({x:.02,y:.6,z:0},1/60);
    const forward = capture.result();
    expect(forward).not.toBeNull();
    expect(forward!.y).toBeGreaterThan(.99);
    const braking = projectVehicle({x:0,y:-1,z:0},{x:0,y:0,z:1},forward!);
    expect(braking.longitudinal).toBeCloseTo(-1,2);
  });

  it('rejects an incoherent shake as a forward direction', () => {
    const capture = new ForwardCapture({x:0,y:0,z:1});
    for (let i=0;i<120;i++) capture.add({x:i%2?.8:-.8,y:0,z:0},1/60);
    expect(capture.result()).toBeNull();
  });

  it('rejects gravity after a rotated mount', () => {
    const gravity={x:Math.SQRT1_2,y:0,z:Math.SQRT1_2};
    const forward={x:0,y:1,z:0};
    expect(projectVehicle({x:gravity.x*9.81,y:0,z:gravity.z*9.81},gravity,forward).longitudinal).toBeCloseTo(0,5);
    expect(projectVehicle({x:0,y:1.2,z:0},gravity,forward).longitudinal).toBeCloseTo(1.2,5);
  });

  it('measures handheld acceleration independent of direction', () => {
    const gravity={x:0,y:0,z:1};
    expect(projectVehicle({x:1,y:0,z:0},gravity).longitudinal).toBeCloseTo(1,5);
    expect(projectVehicle({x:0,y:-1,z:0},gravity).longitudinal).toBeCloseTo(1,5);
    expect(projectVehicle({x:0,y:0,z:-1},gravity).longitudinal).toBeCloseTo(1,5);
    expect(projectVehicle({x:0,y:0,z:0},gravity).longitudinal).toBe(0);
  });
});
