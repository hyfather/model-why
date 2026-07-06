import { useEffect, useRef, useState } from 'react';
import { BigBar } from '../components/BigBar';
import { QueasinessGauge } from '../components/QueasinessGauge';
import { StatsStrip } from '../components/StatsStrip';
import { CompactTelemetry, DebugOverlay } from '../components/DebugOverlay';
import { motionSensor } from '../lib/motion/sensor';
import type { MotionOutput } from '../lib/motion/pipeline';
import type { CalibrationFrame } from '../lib/motion/calibration';
import { accelerationBand, jerkBand } from '../config/comfort';
import { keepAwake, releaseWakeLock } from '../lib/wakeLock';

type Props = { fake: boolean; debug: boolean; frame: CalibrationFrame; paused: boolean; onPause: () => void; onResume: () => void; onEnd: (score: number) => void; onRecalibrate: () => void };

export function Live({ fake, debug, frame, paused, onPause, onResume, onEnd, onRecalibrate }: Props) {
  const [sample, setSample] = useState<MotionOutput | null>(null);
  const [nerd, setNerd] = useState(false);
  const stats = useRef({ total: 0, green: 0, lurches: 0, streak: 0, best: 0, red: false });

  useEffect(() => {
    if (paused) { motionSensor.pause(); void releaseWakeLock(); return; }
    motionSensor.setFrame(frame.gravity, frame.forward, frame.mode === 'handheld');
    motionSensor.start(fake);
    void keepAwake();
    let latest: MotionOutput | null = null;
    let shown: MotionOutput | null = null;
    let animationFrame = 0;
    const paint = () => {
      if (latest && latest !== shown) { shown = latest; setSample(latest); }
      animationFrame = requestAnimationFrame(paint);
    };
    animationFrame = requestAnimationFrame(paint);
    const unsubscribe = motionSensor.subscribe(next => {
      latest = next;
      const current = stats.current;
      current.total += next.dt;
      if (accelerationBand(next.filtered) === 'green') { current.green += next.dt; current.streak += next.dt; current.best = Math.max(current.best, current.streak); } else current.streak = 0;
      const red = jerkBand(next.jerk) === 'red';
      if (red && !current.red) current.lurches++;
      current.red = red;
    });
    return () => { cancelAnimationFrame(animationFrame); unsubscribe(); motionSensor.stop(); void releaseWakeLock(); };
  }, [fake, frame, paused]);

  const st = stats.current;
  const green = st.total ? st.green / st.total * 100 : 100;
  const score = Math.max(0, 100 - (sample?.queasiness ?? 0) - st.lurches * 2);
  return <main className="live page">
    <header><div><div className="brand">Smooth<span>Drive</span></div><small className="mode-label">{frame.mode === 'handheld' ? 'HANDHELD MOTION' : 'MOUNTED CAR'}</small></div><button className="pill" onClick={() => setNerd(!nerd)}>{nerd ? 'Simple' : 'Numbers'}</button></header>
    {paused ? <section className="paused"><div className="pause-icon">Ⅱ</div><h2>Trip paused</h2><button className="primary" onClick={onResume}>Resume</button></section> : <>
      <QueasinessGauge value={sample?.queasiness ?? 0} label={frame.mode === 'handheld' ? 'MOTION COMFORT' : 'PASSENGERS FEEL'} />
      <div className="visual">
        <BigBar value={sample?.filtered ?? 0} metric="acceleration" showNumber={nerd} directional={frame.mode === 'mounted'} />
        <BigBar value={sample?.jerk ?? 0} metric="jerk" showNumber={nerd} directional={frame.mode === 'mounted'} />
        {motionSensor.stalled && !fake && <div className="stall">Sensor hasn’t responded. Check motion access.</div>}
      </div>
      {frame.mode === 'mounted' && sample && sample.orientationError > 24 && <button className="frame-warning" onClick={onRecalibrate}>Phone position changed · recalibrate</button>}
      <CompactTelemetry sample={sample} />
      <StatsStrip green={green} lurches={st.lurches} streak={st.best} />
    </>}
    <footer><button onClick={onRecalibrate}>↻<small>Calibrate</small></button><button onClick={paused ? onResume : onPause}>{paused ? '▶' : 'Ⅱ'}<small>{paused ? 'Resume' : 'Pause'}</small></button><button onClick={() => onEnd(score)}>■<small>End trip</small></button></footer>
    {debug && <DebugOverlay sample={sample} permission={motionSensor.permission} gravity={frame.gravity} forward={frame.forward} />}
  </main>;
}
