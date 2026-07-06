import { useCallback, useEffect, useReducer, useState } from 'react';
import { reducer, initialState } from './state/machine';
import { motionSensor } from './lib/motion/sensor';
import { unlockAudio } from './lib/audio';
import type { CalibrationFrame } from './lib/motion/calibration';
import { Intro } from './screens/Intro';
import { Calibrate } from './screens/Calibrate';
import { Live } from './screens/Live';
import { Denied } from './screens/Denied';
import { Unsupported } from './screens/Unsupported';
import { Summary } from './screens/Summary';

const params = new URLSearchParams(location.search);
const fake = params.get('fake') === '1';
const debug = params.get('debug') === '1';
const emptyFrame: CalibrationFrame = { mode:'mounted', gravity: {x:0,y:0,z:1}, forward: {x:0,y:1,z:0}, calibratedAt: 0 };

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [frame, setFrame] = useState<CalibrationFrame>(() => {
    try { return JSON.parse(localStorage.getItem('smoothdrive-frame') || 'null') || emptyFrame; }
    catch { return emptyFrame; }
  });
  const [score, setScore] = useState(100);

  const request = useCallback(async () => {
    dispatch({type:'CONTINUE'});
    unlockAudio();
    if (fake) { dispatch({type:'GRANTED'}); return; }
    const result = await motionSensor.requestPermission();
    dispatch({type:result==='granted'?'GRANTED':result==='denied'?'DENIED':'UNSUPPORTED'});
  }, []);

  useEffect(() => {
    const visibility = () => { if (document.hidden) motionSensor.pause(); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  const calibrated = useCallback((next: CalibrationFrame) => {
    setFrame(next);
    localStorage.setItem('smoothdrive-frame', JSON.stringify(next));
    dispatch({type:'CALIBRATED'});
  }, []);

  switch (state.screen) {
    case 'INTRO': return <Intro onContinue={request} />;
    case 'REQUESTING_PERMISSION': return <main className="center page"><div className="spinner"/><p>Requesting motion access…</p></main>;
    case 'CALIBRATING': return <Calibrate fake={fake} onDone={calibrated} />;
    case 'DENIED': return <Denied onRetry={request} />;
    case 'UNSUPPORTED': return <Unsupported />;
    case 'SUMMARY': return <Summary score={score} onNew={() => dispatch({type:'NEW_TRIP'})} />;
    case 'LIVE': case 'PAUSED': return <Live fake={fake} debug={debug} frame={frame} paused={state.screen==='PAUSED'} onPause={() => dispatch({type:'PAUSE'})} onResume={() => dispatch({type:'RESUME'})} onRecalibrate={() => dispatch({type:'NEW_TRIP'})} onEnd={next => {setScore(next);dispatch({type:'END'});}} />;
  }
}
