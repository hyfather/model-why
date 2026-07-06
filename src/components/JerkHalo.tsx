import { jerkBand } from '../config/comfort';
export function JerkHalo({value,showNumber}:{value:number;showNumber:boolean}){const band=jerkBand(value);return <div className="jerk" data-band={band}><span>JERK · {band==='green'?'BUTTERY':band==='yellow'?'EASE UP':'LURCH'}</span>{showNumber&&<strong>{Math.abs(value).toFixed(1)} <small>m/s³</small></strong>}</div>}
