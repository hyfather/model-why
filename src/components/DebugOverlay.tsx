import type { MotionOutput } from '../lib/motion/pipeline';
import type { Permission } from '../lib/motion/sensor';
import { motionSensor } from '../lib/motion/sensor';
import { wakeLockState } from '../lib/wakeLock';
import type { Vec3 } from '../lib/motion/frame';

const vec = (v: Vec3 | undefined) => v ? `${v.x.toFixed(2)}/${v.y.toFixed(2)}/${v.z.toFixed(2)}` : '—';

export function CompactTelemetry({ sample }: { sample: MotionOutput | null }) {
  if (!sample) return <div className="telemetry">sensor waiting…</div>;
  return <div className="telemetry">
    <span>{Math.round(1 / sample.dt)} Hz</span><span>raw {vec(sample.acceleration)}</span><span>long {sample.filtered.toFixed(2)}</span><span>jerk {sample.jerk.toFixed(2)}</span><span>frame {sample.orientationError.toFixed(0)}°</span><span>{motionSensor.usingGravityFallback ? 'gravity fallback' : 'sensor fused'}</span>
  </div>;
}

export function DebugOverlay({ sample, permission, gravity, forward }: { sample: MotionOutput | null; permission: Permission; gravity: Vec3; forward?: Vec3 }) {
  return <details className="debug"><summary>full sensor debug</summary><pre>{`permission   ${permission}\nraw xyz      ${vec(sample?.acceleration)}\nwith gravity ${vec(sample?.includingGravity)}\ninterval     ${sample ? (sample.dt*1000).toFixed(1) : '—'} ms\nevent rate   ${sample ? (1/sample.dt).toFixed(0) : '—'} Hz\naLong raw    ${sample?.longitudinal.toFixed(3) ?? '—'}\naLong filt   ${sample?.filtered.toFixed(3) ?? '—'}\naLateral     ${sample?.lateral.toFixed(3) ?? '—'}\njerk         ${sample?.jerk.toFixed(3) ?? '—'}\nframe error  ${sample?.orientationError.toFixed(1) ?? '—'}°\ngravity      ${vec(gravity)}\nforward      ${vec(forward)}\nfusion       ${motionSensor.usingGravityFallback ? 'manual gravity removal' : 'OS sensor fusion'}\nwake lock    ${wakeLockState()}\nvisibility   ${document.visibilityState}`}</pre></details>;
}
