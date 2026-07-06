import { queasinessLabel } from '../lib/motion/queasiness';
export function QueasinessGauge({value}:{value:number}){return <div className="gauge"><div><small>PASSENGERS FEEL</small><strong>{queasinessLabel(value)}</strong></div><div className="gauge-track"><i style={{width:`${value}%`}}/></div><b>{Math.round(value)}</b></div>}
