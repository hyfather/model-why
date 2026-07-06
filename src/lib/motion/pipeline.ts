import { COMFORT } from '../../config/comfort';
import { CascadedLowPass, LowPass } from './filters';
import { JerkEstimator } from './jerk';
import { angleDegrees, norm, projectVehicle, type Vec3 } from './frame';
import { QueasinessEstimator } from './queasiness';

export type MotionInput={acceleration:Vec3; includingGravity:Vec3; dt:number; timestamp:number};
export type MotionOutput=MotionInput&{longitudinal:number;lateral:number;filtered:number;jerk:number;queasiness:number;magnitudeMode:boolean;orientationError:number};

export class MotionPipeline {
  private filter=new CascadedLowPass(COMFORT.filters.accelerationHz);
  private jerkEstimator=new JerkEstimator(COMFORT.filters.jerkHz);
  private vectorFilters={x:new CascadedLowPass(COMFORT.filters.accelerationHz),y:new CascadedLowPass(COMFORT.filters.accelerationHz),z:new CascadedLowPass(COMFORT.filters.accelerationHz)};
  private previousVector:Vec3|null=null;
  private vectorJerkFilter=new LowPass(COMFORT.filters.jerkHz);
  private sick=new QueasinessEstimator();

  constructor(public gravity:Vec3={x:0,y:0,z:1},public forward?:Vec3){}

  next(input:MotionInput):MotionOutput {
    const projected=projectVehicle(input.acceleration,this.gravity,this.forward);
    let filtered:number;
    let jerk:number;
    if(this.forward){
      filtered=this.filter.next(projected.longitudinal,input.dt);
      jerk=this.jerkEstimator.next(filtered,input.dt);
    }else{
      const vector={x:this.vectorFilters.x.next(input.acceleration.x,input.dt),y:this.vectorFilters.y.next(input.acceleration.y,input.dt),z:this.vectorFilters.z.next(input.acceleration.z,input.dt)};
      filtered=norm(vector);
      const rawJerk=this.previousVector?norm({x:vector.x-this.previousVector.x,y:vector.y-this.previousVector.y,z:vector.z-this.previousVector.z})/Math.max(input.dt,.001):0;
      this.previousVector=vector;
      jerk=this.vectorJerkFilter.next(rawJerk,input.dt);
    }
    const orientationError=angleDegrees(input.includingGravity,this.gravity);
    return {...input,...projected,filtered,jerk,orientationError,queasiness:this.sick.update(filtered,jerk,input.dt,input.timestamp/1000)};
  }

  reset(){this.filter.reset();this.jerkEstimator.reset();this.vectorFilters.x.reset();this.vectorFilters.y.reset();this.vectorFilters.z.reset();this.previousVector=null;this.vectorJerkFilter.reset();}
  setFrame(gravity:Vec3,forward?:Vec3){this.gravity=gravity;this.forward=forward;this.reset();}
}
