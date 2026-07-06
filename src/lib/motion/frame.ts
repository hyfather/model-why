export type Vec3 = { x: number; y: number; z: number };
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x:a.x+b.x, y:a.y+b.y, z:a.z+b.z });
export const scale = (v: Vec3, n: number): Vec3 => ({ x:v.x*n, y:v.y*n, z:v.z*n });
export const dot = (a: Vec3, b: Vec3) => a.x*b.x+a.y*b.y+a.z*b.z;
export const norm = (v: Vec3) => Math.hypot(v.x,v.y,v.z);
export const normalize = (v: Vec3): Vec3 => { const n=norm(v)||1; return scale(v,1/n); };
export const cross = (a: Vec3,b: Vec3): Vec3 => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export const horizontal = (v: Vec3, gravity: Vec3): Vec3 => { const g=normalize(gravity); return add(v,scale(g,-dot(v,g))); };
export const projectVehicle = (a: Vec3, gravity: Vec3, forward?: Vec3) => {
  const h = horizontal(a, gravity);
  if (!forward) return { longitudinal: norm(h), lateral: 0, magnitudeMode: true };
  const f=normalize(horizontal(forward,gravity)); const lateral=normalize(cross(normalize(gravity),f));
  return { longitudinal:dot(h,f), lateral:dot(h,lateral), magnitudeMode:false };
};

export class GravityCapture {
  private samples: Vec3[]=[];
  add(v: Vec3) { this.samples.push(v); }
  result() { if (!this.samples.length) return null; return normalize(scale(this.samples.reduce(add),1/this.samples.length)); }
  variance() { if (!this.samples.length) return Infinity; const mean=this.samples.reduce((s,v)=>s+norm(v),0)/this.samples.length; return this.samples.reduce((s,v)=>s+(norm(v)-mean)**2,0)/this.samples.length; }
}
