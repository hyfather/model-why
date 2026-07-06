import { COMFORT, accelerationBand, jerkBand } from '../../config/comfort';
export type QueasinessLabel = 'Fine'|'Slightly queasy'|'Car sick soon'|'Pull over';
export class QueasinessEstimator {
  private value=0; private previousSign=0; private previousChange=0;
  update(acceleration:number, jerk:number, dt:number, nowSeconds:number) {
    const decay=Math.pow(.5,dt/COMFORT.queasiness.halfLifeSeconds); this.value*=decay;
    const ab=accelerationBand(acceleration), jb=jerkBand(jerk);
    this.value += dt*(ab==='red'?2.2:ab==='yellow'?.55:.02) + dt*(jb==='red'?.8:jb==='yellow'?.15:0);
    const sign=Math.abs(acceleration)>.35?Math.sign(acceleration):0;
    if(sign&&this.previousSign&&sign!==this.previousSign){ const period=(nowSeconds-this.previousChange)*2; if(period>=2&&period<=10)this.value+=5; this.previousChange=nowSeconds; }
    if(sign){ if(!this.previousSign)this.previousChange=nowSeconds; this.previousSign=sign; }
    this.value=Math.min(100,this.value); return this.value;
  }
  reset(){this.value=0;this.previousSign=0;this.previousChange=0;}
}
export const queasinessLabel=(n:number):QueasinessLabel=>n<20?'Fine':n<45?'Slightly queasy':n<75?'Car sick soon':'Pull over';
