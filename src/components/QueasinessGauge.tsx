import { queasinessLabel } from '../lib/motion/queasiness';
export function QueasinessGauge({value,label='PASSENGERS FEEL'}:{value:number;label?:string}){return <div className="gauge"><div><small>{label}</small><strong>{queasinessLabel(value)}</strong></div><div className="gauge-track"><i style={{width:`${value}%`}}/></div><b>{Math.round(value)}</b></div>}
