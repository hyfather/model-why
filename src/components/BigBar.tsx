import { COMFORT, accelerationBand, jerkBand } from '../config/comfort';

type Metric = 'acceleration' | 'jerk';

export function BigBar({ value, metric, showNumber }: { value: number; metric: Metric; showNumber: boolean }) {
  const isAcceleration = metric === 'acceleration';
  const max = isAcceleration ? COMFORT.acceleration.displayMax : 4;
  const amount = Math.min(1, Math.abs(value) / max);
  const positive = value >= 0;
  const band = isAcceleration ? accelerationBand(value) : jerkBand(value);
  const unit = isAcceleration ? 'm/s²' : 'm/s³';
  return <section className="metric-column">
    <header className="metric-heading">
      <span>{isAcceleration ? 'ACCELERATION' : 'JERK'}</span>
      <strong>{showNumber ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}` : band.toUpperCase()}</strong>
      <small>{showNumber ? unit : isAcceleration ? 'CURRENT FORCE' : 'RATE OF CHANGE'}</small>
    </header>
    <div className="bar-shell" data-metric={metric} aria-label={`${metric} ${value.toFixed(1)} ${unit}`}>
      <div className="bar-fill" data-band={band} style={{ height: `${amount * 50}%`, bottom: positive ? '50%' : 'auto', top: positive ? 'auto' : '50%' }} />
      <span className="direction-label top">{isAcceleration ? 'ACCEL' : 'RISING'}</span>
      <span className="direction-label bottom">{isAcceleration ? 'BRAKE' : 'FALLING'}</span>
      <span className="zero-line"><b>0</b></span>
    </div>
  </section>;
}
