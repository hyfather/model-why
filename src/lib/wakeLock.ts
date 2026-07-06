let sentinel:WakeLockSentinel|null=null;
export const wakeLockState=()=>sentinel&&!sentinel.released?'active':'inactive';
export async function keepAwake(){if(!('wakeLock'in navigator))return false;try{sentinel=await navigator.wakeLock.request('screen');return true;}catch{return false;}}
export async function releaseWakeLock(){try{await sentinel?.release();}catch{/* graceful fallback */}sentinel=null;}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&sentinel?.released)void keepAwake();});
