import type { MotionInput, MotionOutput } from './pipeline'; import { MotionPipeline } from './pipeline'; import type { Vec3 } from './frame';
export type Permission='idle'|'granted'|'denied'|'unsupported';
type Listener=(v:MotionOutput)=>void; const xyz=(v:DeviceMotionEventAcceleration|null):Vec3=>({x:v?.x??0,y:v?.y??0,z:v?.z??0});
class MotionSensor {
  permission:Permission='idle'; latest:MotionOutput|null=null; stalled=false; private listeners=new Set<Listener>(); private pipeline=new MotionPipeline(); private lastTime=0; private lastEvent=0; private timer=0; private fakeTimer=0; private fakeStart=0;
  async requestPermission():Promise<Permission>{ if(typeof DeviceMotionEvent==='undefined')return this.permission='unsupported'; const ctor=DeviceMotionEvent as typeof DeviceMotionEvent&{requestPermission?:()=>Promise<string>}; if(typeof ctor.requestPermission!=='function')return this.permission='granted'; try{return this.permission=(await ctor.requestPermission())==='granted'?'granted':'denied';}catch{return this.permission='denied';}}
  start(fake=false){this.stop();this.lastTime=0; if(fake){this.permission='granted';this.fakeStart=performance.now();this.fakeTimer=window.setInterval(()=>this.emitFake(),1000/60);return;} window.addEventListener('devicemotion',this.onMotion);this.timer=window.setInterval(()=>this.stalled=document.visibilityState==='visible'&&performance.now()-this.lastEvent>1000,250);}
  stop(){window.removeEventListener('devicemotion',this.onMotion);clearInterval(this.timer);clearInterval(this.fakeTimer);}
  pause(){this.stop();this.pipeline.reset();}
  subscribe(fn:Listener){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  setFrame(gravity:Vec3,forward?:Vec3){this.pipeline.setFrame(gravity,forward);}
  private onMotion=(e:DeviceMotionEvent)=>{const now=performance.now();const dt=Math.min(.1,Math.max(.001,(e.interval||now-this.lastTime||16.7)/1000));this.lastTime=now;this.lastEvent=now;const including=xyz(e.accelerationIncludingGravity);let acceleration=xyz(e.acceleration);if(e.acceleration==null)acceleration={x:including.x-this.pipeline.gravity.x*9.81,y:including.y-this.pipeline.gravity.y*9.81,z:including.z-this.pipeline.gravity.z*9.81};this.push({acceleration,includingGravity:including,dt,timestamp:now});};
  private emitFake(){const now=performance.now(),t=(now-this.fakeStart)/1000%42;let a=0;if(t>3&&t<9)a=Math.min(1,(t-3)/2);else if(t>=9&&t<15)a=0;else if(t>=15&&t<21)a=-Math.min(1,(t-15)/3);else if(t>=23&&t<24)a=-3.4;else if(t>=27)a=1.8*Math.sin(2*Math.PI*.3*(t-27));const noise=.08*Math.sin(t*2*Math.PI*10);this.push({acceleration:{x:0,y:a+noise,z:0},includingGravity:{x:0,y:a+noise,z:9.81},dt:1/60,timestamp:now});}
  private push(input:MotionInput){this.latest=this.pipeline.next(input);this.listeners.forEach(f=>f(this.latest!));}
}
export const motionSensor=new MotionSensor();
