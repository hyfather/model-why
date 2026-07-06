import type { MotionInput, MotionOutput } from './pipeline';
import { MotionPipeline } from './pipeline';
import type { Vec3 } from './frame';

export type Permission = 'idle' | 'granted' | 'denied' | 'unsupported';
type Listener = (value: MotionOutput) => void;
const xyz = (v: DeviceMotionEventAcceleration | null): Vec3 => ({ x: v?.x ?? 0, y: v?.y ?? 0, z: v?.z ?? 0 });
const hasVector = (v: DeviceMotionEventAcceleration | null) => v != null && v.x != null && v.y != null && v.z != null;

class MotionSensor {
  permission: Permission = 'idle';
  latest: MotionOutput | null = null;
  stalled = false;
  usingGravityFallback = false;
  dynamicGravityFallback = false;
  private listeners = new Set<Listener>();
  private pipeline = new MotionPipeline();
  private lastTime = 0;
  private lastEvent = 0;
  private timer = 0;
  private fakeTimer = 0;
  private fakeStart = 0;
  private fallbackGravity: Vec3 | null = null;

  async requestPermission(): Promise<Permission> {
    if (typeof DeviceMotionEvent === 'undefined') return this.permission = 'unsupported';
    const ctor = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
    if (typeof ctor.requestPermission !== 'function') return this.permission = 'granted';
    try { return this.permission = (await ctor.requestPermission()) === 'granted' ? 'granted' : 'denied'; }
    catch { return this.permission = 'denied'; }
  }

  start(fake = false) {
    this.stop(); this.lastTime = 0; this.stalled = false; this.fallbackGravity = null;
    if (fake) { this.permission='granted'; this.fakeStart=performance.now(); this.fakeTimer=window.setInterval(()=>this.emitFake(),1000/60); return; }
    window.addEventListener('devicemotion', this.onMotion);
    this.timer = window.setInterval(() => this.stalled = document.visibilityState === 'visible' && performance.now() - this.lastEvent > 1000, 250);
  }
  stop() { window.removeEventListener('devicemotion',this.onMotion); clearInterval(this.timer); clearInterval(this.fakeTimer); }
  pause() { this.stop(); this.pipeline.reset(); }
  subscribe(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  setFrame(gravity: Vec3, forward?: Vec3, dynamicGravityFallback = false) { this.dynamicGravityFallback = dynamicGravityFallback; this.pipeline.setFrame(gravity, forward); }

  private onMotion = (event: DeviceMotionEvent) => {
    const now = performance.now();
    const dt = Math.min(.1, Math.max(.001, (event.interval || now - this.lastTime || 16.7) / 1000));
    this.lastTime = now; this.lastEvent = now;
    const includingGravity = xyz(event.accelerationIncludingGravity);
    this.usingGravityFallback = !hasVector(event.acceleration);
    let acceleration: Vec3;
    if (this.usingGravityFallback) {
      if (this.dynamicGravityFallback) {
        this.fallbackGravity ??= includingGravity;
        const rc = 1 / (2 * Math.PI * .12);
        const alpha = dt / (rc + dt);
        this.fallbackGravity = {
          x: this.fallbackGravity.x + alpha * (includingGravity.x - this.fallbackGravity.x),
          y: this.fallbackGravity.y + alpha * (includingGravity.y - this.fallbackGravity.y),
          z: this.fallbackGravity.z + alpha * (includingGravity.z - this.fallbackGravity.z),
        };
        acceleration = {x:includingGravity.x-this.fallbackGravity.x,y:includingGravity.y-this.fallbackGravity.y,z:includingGravity.z-this.fallbackGravity.z};
      } else acceleration = { x: includingGravity.x - this.pipeline.gravity.x * 9.81, y: includingGravity.y - this.pipeline.gravity.y * 9.81, z: includingGravity.z - this.pipeline.gravity.z * 9.81 };
    } else acceleration = xyz(event.acceleration);
    this.push({ acceleration, includingGravity, dt, timestamp: now });
  };

  private emitFake() {
    const now=performance.now(), t=(now-this.fakeStart)/1000%42;
    let a=0;
    if(t>3&&t<9)a=Math.min(1,(t-3)/2); else if(t>=9&&t<15)a=0; else if(t>=15&&t<21)a=-Math.min(1,(t-15)/3); else if(t>=23&&t<24)a=-3.4; else if(t>=27)a=1.8*Math.sin(2*Math.PI*.3*(t-27));
    const noise=.08*Math.sin(t*2*Math.PI*10);
    this.push({acceleration:{x:0,y:a+noise,z:0},includingGravity:{x:0,y:a+noise,z:9.81},dt:1/60,timestamp:now});
  }
  private push(input: MotionInput) { this.latest=this.pipeline.next(input); this.listeners.forEach(fn=>fn(this.latest!)); }
}

export const motionSensor = new MotionSensor();
