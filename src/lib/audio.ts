let context:AudioContext|null=null;
export function unlockAudio(){try{context??=new AudioContext();void context.resume();}catch{/* unsupported */}}
export function chime(){if(!context)return;const o=context.createOscillator(),g=context.createGain();o.frequency.value=440;g.gain.setValueAtTime(.05,context.currentTime);g.gain.exponentialRampToValueAtTime(.001,context.currentTime+.18);o.connect(g).connect(context.destination);o.start();o.stop(context.currentTime+.2);}
