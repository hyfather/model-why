import { COMFORT } from '../../config/comfort';
import { CascadedLowPass } from './filters'; import { JerkEstimator } from './jerk'; import { projectVehicle, type Vec3 } from './frame'; import { QueasinessEstimator } from './queasiness';
export type MotionInput={acceleration:Vec3; includingGravity:Vec3; dt:number; timestamp:number};
export type MotionOutput=MotionInput&{longitudinal:number;lateral:number;filtered:number;jerk:number;queasiness:number;magnitudeMode:boolean};
export class MotionPipeline {
  private filter=new CascadedLowPass(COMFORT.filters.accelerationHz); private jerk=new JerkEstimator(COMFORT.filters.jerkHz); private sick=new QueasinessEstimator();
  constructor(public gravity:Vec3={x:0,y:0,z:1},public forward?:Vec3){}
  next(input:MotionInput):MotionOutput { const p=projectVehicle(input.acceleration,this.gravity,this.forward); const filtered=this.filter.next(p.longitudinal,input.dt); const jerk=this.jerk.next(filtered,input.dt); return {...input,...p,filtered,jerk,queasiness:this.sick.update(filtered,jerk,input.dt,input.timestamp/1000)}; }
  reset(){this.filter.reset();this.jerk.reset();} setFrame(gravity:Vec3,forward?:Vec3){this.gravity=gravity;this.forward=forward;this.reset();}
}
