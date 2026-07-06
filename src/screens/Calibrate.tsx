import { useEffect, useRef, useState } from 'react';
import { motionSensor } from '../lib/motion/sensor';
import { ForwardCapture, type CalibrationFrame } from '../lib/motion/calibration';
import { GravityCapture, norm, type Vec3 } from '../lib/motion/frame';

type Stage = 'choose' | 'still' | 'forward' | 'error' | 'complete';

export function Calibrate({ fake, onDone }: { fake: boolean; onDone: (frame: CalibrationFrame) => void }) {
  const [stage, setStage] = useState<Stage>('choose');
  const [progress, setProgress] = useState(0);
  const [issue, setIssue] = useState('');
  const [telemetry, setTelemetry] = useState('Waiting for sensor…');
  const stageRef = useRef<Stage>('choose');
  const stillStarted = useRef(performance.now());
  const gravityCapture = useRef(new GravityCapture());
  const gravity = useRef<Vec3 | null>(null);
  const forwardCapture = useRef<ForwardCapture | null>(null);
  const lastUi = useRef(0);

  const changeStage = (next: Stage) => { stageRef.current = next; setStage(next); setProgress(0); };
  const retry = () => {
    gravityCapture.current = new GravityCapture();
    gravity.current = null;
    forwardCapture.current = null;
    stillStarted.current = performance.now();
    setIssue('');
    changeStage('still');
  };
  const chooseMounted = () => { motionSensor.start(fake); retry(); };
  const chooseHandheld = () => onDone({mode:'handheld',gravity:{x:0,y:0,z:1},calibratedAt:Date.now()});

  useEffect(() => {
    motionSensor.start(fake);
    const noSensorTimer = window.setInterval(() => {
      if (stageRef.current === 'still' && performance.now() - stillStarted.current > 1800 && gravityCapture.current.count < 3) {
        setIssue('No motion samples arrived. Check Safari Motion & Orientation access, then try again. This page must use HTTPS on iPhone.');
        changeStage('error');
      }
    }, 400);
    const unsubscribe = motionSensor.subscribe(sample => {
      const now = performance.now();
      if (stageRef.current === 'still') {
        gravityCapture.current.add(sample.includingGravity, motionSensor.usingGravityFallback ? {x:0,y:0,z:0} : sample.acceleration);
        const elapsed = (now - stillStarted.current) / 1000;
        setProgress(Math.min(1, elapsed / 2));
        if (now - lastUi.current > 120) {
          setTelemetry(`motion ${norm(sample.acceleration).toFixed(2)} m/s² · gravity ${norm(sample.includingGravity).toFixed(2)} m/s²`);
          lastUi.current = now;
        }
        if (elapsed >= 2) {
          const candidate = gravityCapture.current.result();
          const variance = gravityCapture.current.variance();
          const movement = gravityCapture.current.accelerationRms();
          const gravityStrength = candidate ? norm(sample.includingGravity) : 0;
          if (!candidate || gravityStrength < 7 || gravityStrength > 12.5 || variance > .16 || movement > .45) {
            setIssue(`The phone moved too much (motion ${movement.toFixed(2)}, stability ${variance.toFixed(2)}). Keep the car stopped and phone untouched.`);
            changeStage('error');
            return;
          }
          gravity.current = candidate;
          forwardCapture.current = new ForwardCapture(candidate);
          motionSensor.setFrame(candidate, undefined, false);
          changeStage('forward');
        }
      } else if (stageRef.current === 'forward' && gravity.current && forwardCapture.current) {
        forwardCapture.current.add(sample.acceleration, sample.dt);
        setProgress(forwardCapture.current.progress);
        if (now - lastUi.current > 120) {
          setTelemetry(`drive-off ${forwardCapture.current.meanAcceleration.toFixed(2)} m/s² · direction quality ${Math.round(forwardCapture.current.coherence * 100)}%`);
          lastUi.current = now;
        }
        const forward = forwardCapture.current.result();
        if (forward) {
          const frame: CalibrationFrame = { mode:'mounted', gravity: gravity.current, forward, calibratedAt: Date.now() };
          motionSensor.setFrame(frame.gravity, frame.forward);
          changeStage('complete');
          window.setTimeout(() => onDone(frame), 650);
        }
      }
    });
    return () => { clearInterval(noSensorTimer); unsubscribe(); motionSensor.stop(); };
  }, [fake, onDone]);

  return <main className="calibration page">
    <div className="calibration-card">
      <div className="eyebrow">{stage === 'choose' ? 'CHOOSE A MODE' : `CALIBRATION · ${stage === 'still' || stage === 'error' ? '1 OF 2' : '2 OF 2'}`}</div>
      {stage !== 'choose' && <div className="ring" style={{ '--progress': `${progress * 360}deg` } as React.CSSProperties}><span>{stage === 'complete' ? '✓' : `${Math.round(progress * 100)}%`}</span></div>}
      {stage === 'choose' && <><h2>How are you using it?</h2><p>Choose the frame of reference that matches this session.</p><div className="mode-grid"><button onClick={chooseMounted}><b>Mounted in car</b><span>Learns forward and braking direction. Best for driving.</span></button><button onClick={chooseHandheld}><b>Handheld motion</b><span>No fixed direction. Measures smooth movement versus jolts.</span></button></div><div className="calibration-tip">At constant speed the meter correctly returns toward zero. Starts, stops, turns, and jerks create a reading.</div></>}
      {stage === 'still' && <><h2>Mount it. Hold still.</h2><p>Park on level ground, secure the phone in its driving position, and don’t touch it for two seconds.</p><div className="calibration-tip">The phone must remain in this exact position for the trip.</div></>}
      {stage === 'forward' && <><h2>Now drive off gently</h2><p>Without touching the phone, accelerate straight ahead from a stop. Detection is automatic.</p><div className="calibration-tip safe">Set the phone down before moving. Never operate it while driving.</div></>}
      {stage === 'error' && <><h2>Too much movement</h2><p>{issue}</p><button className="primary" onClick={retry}>Try the still step again</button></>}
      {stage === 'complete' && <><h2>Direction locked</h2><p>Gravity and the car’s forward axis are calibrated.</p></>}
      {stage !== 'choose' && <code className="calibration-debug">{telemetry}</code>}
    </div>
  </main>;
}
