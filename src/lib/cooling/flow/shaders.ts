import { PARTICLE_REFERENCE_SPEED, SPAWN_TRIES, TEMP_DIFFUSION, STREAK_MAX_MM, STREAK_MIN_MM, STREAK_SEGMENTS, STREAK_STALL_MM, STREAK_STEPS } from './flowParams';

const glFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** GLSL for the grid solver and particles: a straight port of `cpuSolver.ts` and `cpuParticles.ts`. The 3D grid is packed into one 2D float texture, `TX` slices per row. */

export const FULLSCREEN_VERTEX = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Fragment output for GLSL3 materials: three declares none, so gl_FragColor is mapped onto one. */
export const FRAGMENT_OUT = /* glsl */ `
layout(location = 0) out highp vec4 fragOut;
#define gl_FragColor fragOut
`;

const GRID_COMMON = /* glsl */ `
uniform vec3 uN;
uniform float uTX;
#define N ivec3(uN)
#define TX int(uTX)
ivec2 tc(ivec3 c) { return ivec2(c.x + (c.z % TX) * N.x, c.y + (c.z / TX) * N.y); }
ivec3 cellOf(ivec2 f) { int tx = f.x / N.x; int ty = f.y / N.y; return ivec3(f.x - tx * N.x, f.y - ty * N.y, ty * TX + tx); }
bool inside(ivec3 c) { return all(greaterThanEqual(c, ivec3(0))) && all(lessThan(c, N)); }
bool onBoundary(ivec3 c) { return any(equal(c, ivec3(0))) || any(equal(c, N - 1)); }
uniform sampler2D M; // r solid, g darcy, b fixed pressure, a heat per step
vec4 mask(ivec3 c) { return texelFetch(M, tc(c), 0); }
bool solidAt(ivec3 c) { return !inside(c) || mask(c).r > 0.5; }
uniform sampler2D U;
vec3 vel(ivec3 c) { if (solidAt(c)) return vec3(0.0); return texelFetch(U, tc(c), 0).xyz; }
// Trilinear velocity at cell coordinates (cell centers at integers); solid cells contribute nothing.
vec3 sampleU(vec3 p) {
  p = clamp(p, vec3(0.0), vec3(N - 1));
  ivec3 b = ivec3(floor(p));
  vec3 f = p - vec3(b);
  vec3 c000 = vel(b), c100 = vel(b + ivec3(1,0,0)), c010 = vel(b + ivec3(0,1,0)), c110 = vel(b + ivec3(1,1,0));
  vec3 c001 = vel(b + ivec3(0,0,1)), c101 = vel(b + ivec3(1,0,1)), c011 = vel(b + ivec3(0,1,1)), c111 = vel(b + ivec3(1,1,1));
  return mix(mix(mix(c000, c100, f.x), mix(c010, c110, f.x), f.y), mix(mix(c001, c101, f.x), mix(c011, c111, f.x), f.y), f.z);
}
`;

const COMMON = FRAGMENT_OUT + GRID_COMMON;

export const ADVECT = COMMON + /* glsl */ `
uniform sampler2D F; // xyz target velocity, w fan cell
uniform sampler2D T; // r degrees above room temperature
uniform float uBlend; uniform float uDamp; uniform float uVmax; uniform float uBuoy;
void main() {
  ivec3 c = cellOf(ivec2(gl_FragCoord.xy));
  if (c.z >= N.z) { gl_FragColor = vec4(0.0); return; }
  vec4 m = mask(c);
  if (m.r > 0.5) { gl_FragColor = vec4(0.0); return; }
  vec3 u = texelFetch(U, tc(c), 0).xyz;
  vec3 a = sampleU(vec3(c) - u);
  a.y += uBuoy * texelFetch(T, tc(c), 0).r;
  vec4 f = texelFetch(F, tc(c), 0);
  if (f.w > 0.5) a += (f.xyz - a) * uBlend;
  a *= uDamp / (1.0 + m.g);
  float l = length(a);
  if (l > uVmax) a *= uVmax / l;
  gl_FragColor = vec4(a, 0.0);
}`;

// Temperature: degrees above room temperature, carried with the final velocity.
const TEMP_COMMON = /* glsl */ `
uniform sampler2D T;
// Trilinear value at cell coordinates, averaged over the fluid cells only so a wall does not cool the air beside it.
float sampleT(vec3 p) {
  p = clamp(p, vec3(0.0), vec3(N - 1));
  ivec3 b = ivec3(floor(p));
  vec3 f = p - vec3(b);
  float acc = 0.0; float wsum = 0.0;
  for (int dz = 0; dz < 2; dz++) for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
    float w = (dx == 1 ? f.x : 1.0 - f.x) * (dy == 1 ? f.y : 1.0 - f.y) * (dz == 1 ? f.z : 1.0 - f.z);
    ivec3 n = min(b + ivec3(dx, dy, dz), N - 1);
    if (w == 0.0 || solidAt(n)) continue;
    acc += w * texelFetch(T, tc(n), 0).r; wsum += w;
  }
  return wsum > 0.0 ? acc / wsum : 0.0;
}
`;

export const TEMPERATURE = COMMON + TEMP_COMMON + /* glsl */ `
uniform vec3 uSrc; uniform float uCoupling;
#define TEMP_DIFFUSION ${glFloat(TEMP_DIFFUSION)}
void main() {
  ivec3 c = cellOf(ivec2(gl_FragCoord.xy));
  if (c.z >= N.z) { gl_FragColor = vec4(0.0); return; }
  vec4 m = mask(c);
  int id = int(m.a + 0.5);
  // Solid cells, the open boundary and room air (an intake's cells and the outside in front of it) hold zero.
  if (m.r > 0.5 || m.b > 0.5 || id == 3) { gl_FragColor = vec4(0.0); return; }
  vec3 u = texelFetch(U, tc(c), 0).xyz;
  float t = sampleT(vec3(c) - u);
  // Diffusion: close a small share of the gap to the mean of the fluid neighbors.
  float acc = 0.0; float cnt = 0.0;
  const ivec3 D[6] = ivec3[6](ivec3(1,0,0), ivec3(-1,0,0), ivec3(0,1,0), ivec3(0,-1,0), ivec3(0,0,1), ivec3(0,0,-1));
  for (int k = 0; k < 6; k++) { ivec3 n = c + D[k]; if (!solidAt(n)) { acc += texelFetch(T, tc(n), 0).r; cnt += 1.0; } }
  if (cnt > 0.0) t += TEMP_DIFFUSION * (acc / cnt - t);
  float src = id == 1 ? uSrc.y : (id == 2 ? uSrc.z : -1.0);
  if (src >= 0.0) t += uCoupling * (src - t);
  gl_FragColor = vec4(t, 0.0, 0.0, 0.0);
}`;

export const DIVERGE = COMMON + /* glsl */ `
void main() {
  ivec3 c = cellOf(ivec2(gl_FragCoord.xy));
  vec4 m = c.z < N.z ? mask(c) : vec4(1.0);
  if (c.z >= N.z || m.r > 0.5 || m.b > 0.5 || onBoundary(c)) { gl_FragColor = vec4(0.0); return; }
  float d = 0.5 * ((vel(c + ivec3(1,0,0)).x - vel(c - ivec3(1,0,0)).x) + (vel(c + ivec3(0,1,0)).y - vel(c - ivec3(0,1,0)).y) + (vel(c + ivec3(0,0,1)).z - vel(c - ivec3(0,0,1)).z));
  gl_FragColor = vec4(d, 0.0, 0.0, 0.0);
}`;

const PRESSURE = /* glsl */ `
uniform sampler2D P;
// Pressure of a neighbor: a solid wall reads as the cell's own pressure (no force across it), fixed-pressure cells as 0.
float pn(ivec3 n, float pc) { if (solidAt(n)) return pc; if (mask(n).b > 0.5) return 0.0; return texelFetch(P, tc(n), 0).r; }
`;

export const JACOBI = COMMON + PRESSURE + /* glsl */ `
uniform sampler2D D;
void main() {
  ivec3 c = cellOf(ivec2(gl_FragCoord.xy));
  vec4 m = c.z < N.z ? mask(c) : vec4(1.0);
  if (c.z >= N.z || m.r > 0.5 || m.b > 0.5 || onBoundary(c)) { gl_FragColor = vec4(0.0); return; }
  float sum = 0.0; float cnt = 0.0;
  ivec3 offs[6] = ivec3[6](ivec3(1,0,0), ivec3(-1,0,0), ivec3(0,1,0), ivec3(0,-1,0), ivec3(0,0,1), ivec3(0,0,-1));
  for (int i = 0; i < 6; i++) {
    ivec3 n = c + offs[i];
    if (solidAt(n)) continue;
    cnt += 1.0;
    if (mask(n).b < 0.5) sum += texelFetch(P, tc(n), 0).r;
  }
  float p = cnt > 0.0 ? (sum - texelFetch(D, tc(c), 0).r) / cnt : 0.0;
  gl_FragColor = vec4(p, 0.0, 0.0, 0.0);
}`;

export const GRADIENT = COMMON + PRESSURE + /* glsl */ `
uniform float uVmax;
void main() {
  ivec3 c = cellOf(ivec2(gl_FragCoord.xy));
  if (c.z >= N.z) { gl_FragColor = vec4(0.0); return; }
  vec4 m = mask(c);
  vec3 u = texelFetch(U, tc(c), 0).xyz;
  if (m.r > 0.5) { gl_FragColor = vec4(0.0); return; }
  if (onBoundary(c)) { gl_FragColor = vec4(u, 0.0); return; }
  float pc = m.b > 0.5 ? 0.0 : texelFetch(P, tc(c), 0).r;
  vec3 g = 0.5 * vec3(pn(c + ivec3(1,0,0), pc) - pn(c - ivec3(1,0,0), pc), pn(c + ivec3(0,1,0), pc) - pn(c - ivec3(0,1,0), pc), pn(c + ivec3(0,0,1), pc) - pn(c - ivec3(0,0,1), pc));
  u -= g;
  // No penetration: nothing moves into a solid neighbor.
  if ((solidAt(c + ivec3(1,0,0)) && u.x > 0.0) || (solidAt(c - ivec3(1,0,0)) && u.x < 0.0)) u.x = 0.0;
  if ((solidAt(c + ivec3(0,1,0)) && u.y > 0.0) || (solidAt(c - ivec3(0,1,0)) && u.y < 0.0)) u.y = 0.0;
  if ((solidAt(c + ivec3(0,0,1)) && u.z > 0.0) || (solidAt(c - ivec3(0,0,1)) && u.z < 0.0)) u.z = 0.0;
  float l = length(u);
  if (!(l <= uVmax)) u *= (l > 0.0 && !isnan(l) && !isinf(l)) ? uVmax / l : 0.0;
  gl_FragColor = vec4(u, 0.0);
}`;

// Reduction: max |du| and max |u| per 4x4 block, then 4x4 of those down to one texel.
export const REDUCE_FIRST = FRAGMENT_OUT + /* glsl */ `
uniform sampler2D A; uniform sampler2D B; uniform ivec2 S;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy) * 4; vec2 r = vec2(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    ivec2 p = b + ivec2(x, y);
    if (p.x < S.x && p.y < S.y) { vec3 a = texelFetch(A, p, 0).xyz; vec3 q = texelFetch(B, p, 0).xyz; r = max(r, vec2(length(a - q), length(a))); }
  }
  gl_FragColor = vec4(r, 0.0, 0.0);
}`;
export const REDUCE_NEXT = FRAGMENT_OUT + /* glsl */ `
uniform sampler2D A; uniform ivec2 S;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy) * 4; vec2 r = vec2(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) { ivec2 p = b + ivec2(x, y); if (p.x < S.x && p.y < S.y) r = max(r, texelFetch(A, p, 0).xy); }
  gl_FragColor = vec4(r, 0.0, 0.0);
}`;

const LIFE = /* glsl */ `
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// A particle's own lifetime in steps, fixed per pixel of the state texture, so deaths spread out instead of arriving in waves.
float lifeOf(vec2 pixel, float maxAge, float jitter) { return maxAge * (1.0 - jitter + 2.0 * jitter * hash(pixel * 3.7)); }
`;

const PARTICLE_COMMON = COMMON + LIFE + /* glsl */ `
uniform sampler2D PA; uniform sampler2D EM;
uniform float uEmitterCount; uniform vec3 uBoundsMin; uniform vec3 uBoundsMax; uniform float uSeed; uniform float uMaxAge; uniform float uBirthSpread; uniform float uLifeJitter; uniform float uSpeed; uniform float uSubsteps; uniform float uStuckMove; uniform float uStuckRate;
ivec3 cellAtPos(vec3 p) { return ivec3(floor(p + 0.5)); }
`;

const SPAWN_DEFINE = `#define SPAWN_TRIES ${SPAWN_TRIES}\n#define REF_SPEED ${glFloat(PARTICLE_REFERENCE_SPEED)}\n`;

// Particle state: xyz cell coordinates, w age. One pass moves, recycles and respawns.
export const PARTICLE_STATE = SPAWN_DEFINE + PARTICLE_COMMON + /* glsl */ `
uniform sampler2D F; // xyz target velocity, w fan cell
// The velocity a particle feels: a fan cell's own target, else the solved field.
vec3 pvel(vec3 q) {
  ivec3 c = cellAtPos(q);
  if (inside(c)) { vec4 f = texelFetch(F, tc(c), 0); if (f.w > 0.5) return f.xyz; }
  return sampleU(q);
}
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(PA, f, 0);
  vec3 p = s.xyz; float age = s.w;
  // Age runs in simulation time: a slower drawn speed or Slow mo ages a particle per step by the same share, so its path before recycling never shortens.
  float rate = uSpeed / REF_SPEED;
  bool respawn = age > uMaxAge * 4.0;
  bool fresh = respawn;
  // A warm update can close the cell a particle sits in: only those start over.
  if (!respawn && p.x > -1.0e5 && solidAt(cellAtPos(p))) respawn = true;
  // Not yet born: wait unseen at the spawn point.
  if (!respawn && age < 0.0) { gl_FragColor = vec4(p, age + rate); return; }
  if (!respawn) {
    vec3 q = p;
    float h = uSpeed / uSubsteps;
    // Sub-steps keep each move under a cell; one axis at a time, so a blocked axis slides along the surface instead of entering it.
    for (int k = 0; k < 8; k++) {
      if (float(k) >= uSubsteps) break;
      vec3 k1 = pvel(q);
      vec3 d = pvel(q + 0.5 * h * k1) * h;
      vec3 t = q + vec3(d.x, 0.0, 0.0); if (!solidAt(cellAtPos(t))) q = t;
      t = q + vec3(0.0, d.y, 0.0); if (!solidAt(cellAtPos(t))) q = t;
      t = q + vec3(0.0, 0.0, d.z); if (!solidAt(cellAtPos(t))) q = t;
      if (mask(cellAtPos(q)).b > 0.5) break;
    }
    // A particle that barely moves, in dead air or against a wall, ages fast and is soon recycled.
    age += (length(q - p) < uStuckMove * uSpeed ? uStuckRate : 1.0) * rate;
    p = q;
    ivec3 c = cellAtPos(p);
    // Nothing lives past the outside reach of the case box: a particle that leaves it is recycled.
    respawn = any(lessThan(p, uBoundsMin)) || any(greaterThan(p, uBoundsMax)) || mask(c).b > 0.5 || age > lifeOf(gl_FragCoord.xy, uMaxAge, uLifeJitter);
  }
  if (respawn) {
    bool found = false;
    vec3 np = p;
    // A start point drawn area-uniform over a fan's ring between hub and tip, set outward of the fan; a few tries in case it lands in a solid.
    for (int t = 0; t < SPAWN_TRIES; t++) {
      if (uEmitterCount < 1.0) break;
      float sd = uSeed + float(t) * 17.31;
      int e = min(int(hash(gl_FragCoord.xy + sd) * uEmitterCount), int(uEmitterCount) - 1);
      vec4 a = texelFetch(EM, ivec2(e * 4, 0), 0);
      vec4 b = texelFetch(EM, ivec2(e * 4 + 1, 0), 0);
      vec4 c2 = texelFetch(EM, ivec2(e * 4 + 2, 0), 0);
      vec4 d2 = texelFetch(EM, ivec2(e * 4 + 3, 0), 0);
      vec3 e2 = cross(b.xyz, c2.xyz);
      float r = sqrt(a.w * a.w + (b.w * b.w - a.w * a.w) * hash(gl_FragCoord.xy * 1.3 + sd));
      float th = 6.2831853 * hash(gl_FragCoord.xy * 2.1 + sd);
      float back = c2.w + d2.x * hash(gl_FragCoord.xy * 3.3 + sd);
      vec3 cand = a.xyz + c2.xyz * (r * cos(th)) + e2 * (r * sin(th)) - b.xyz * back;
      if (!solidAt(cellAtPos(cand))) { np = cand; found = true; break; }
    }
    if (!found) { gl_FragColor = vec4(-1.0e6, 0.0, 0.0, uMaxAge * 8.0); return; }
    p = np;
    age = fresh ? -hash(gl_FragCoord.xy * 1.7 + uSeed) * uMaxAge * uBirthSpread : 0.0;
  }
  gl_FragColor = vec4(p, age);
}`;

// Particle heat, degrees above room temperature: the temperature field sampled at the particle; zero until it is born.
export const PARTICLE_HEAT = PARTICLE_COMMON + TEMP_COMMON + /* glsl */ `
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(PA, f, 0);
  float h = 0.0;
  if (!(s.w < 1.0 || s.x < -1.0e5) && inside(cellAtPos(s.xyz))) h = sampleT(s.xyz);
  gl_FragColor = vec4(h, 0.0, 0.0, 0.0);
}`;

/** Streak geometry shared by the vertex shader and the parity pass; mirrors `stepDisplacement` and `streakOf` in streak.ts. */
export const STREAK_GLSL = /* glsl */ `
#define STREAK_STEPS ${glFloat(STREAK_STEPS)}
#define STREAK_MIN_MM ${glFloat(STREAK_MIN_MM)}
#define STREAK_MAX_MM ${glFloat(STREAK_MAX_MM)}
#define STREAK_STALL_MM ${glFloat(STREAK_STALL_MM)}
// One step's displacement in mm; a respawned (age did not grow) or absent particle has not moved.
vec3 stepDisplacement(vec4 prev, vec4 cur, float cellMm) {
  if (prev.x < -1.0e5 || cur.x < -1.0e5 || prev.w >= cur.w) return vec3(0.0);
  return (cur.xyz - prev.xyz) * cellMm;
}
// xyz unit direction, w length in mm.
vec4 streakOf(vec3 d) {
  float m = length(d);
  vec3 dir = m > STREAK_STALL_MM ? d / m : vec3(1.0, 0.0, 0.0);
  return vec4(dir, clamp(m * STREAK_STEPS, STREAK_MIN_MM, STREAK_MAX_MM));
}
`;

// A particle is a camera-facing ribbon of STREAK_SEGMENTS segments from its head back along the flow: each station steps backward through the solved velocity field, so the tail bends where the air bends. Per particle 2 vertices per station: corner.x is 1 at the head and 0 at the tail, corner.y the side.
export const STREAK_VERTEX = LIFE + GRID_COMMON + STREAK_GLSL + /* glsl */ `
#define STREAK_SEGMENTS ${STREAK_SEGMENTS}
uniform sampler2D PA; uniform sampler2D PP; uniform sampler2D PB;
uniform float uCell; uniform vec3 uOrigin; uniform vec3 uCaseExtent; uniform float uMargin;
uniform float uWidthMm; uniform float uMinWidthPx; uniform vec2 uViewport; uniform float uScale;
uniform float uMaxAge; uniform float uLifeJitter; uniform float uAlpha; uniform float uTailWidth; uniform float uRate;
uniform vec3 uCool; uniform vec3 uWarm; uniform vec3 uHot; uniform float uHeatSpan;
in vec2 ref; in vec2 corner;
out vec3 vColor; out float vAlpha; out float vAlong; out float vSide;
// Colors blend in OKLab (from linear sRGB), so blue to yellow to red passes through clean intermediates, not gray.
vec3 toLab(vec3 c) {
  vec3 l = vec3(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b, 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b, 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  l = pow(max(l, vec3(0.0)), vec3(1.0 / 3.0));
  return vec3(0.2104542553 * l.x + 0.7936177850 * l.y - 0.0040720468 * l.z, 1.9779984951 * l.x - 2.4285922050 * l.y + 0.4505937099 * l.z, 0.0259040371 * l.x + 0.7827717662 * l.y - 0.8086757660 * l.z);
}
vec3 fromLab(vec3 c) {
  vec3 l = vec3(c.x + 0.3963377774 * c.y + 0.2158037573 * c.z, c.x - 0.1055613458 * c.y - 0.0638541728 * c.z, c.x - 0.0894841775 * c.y - 1.2914855480 * c.z);
  l = l * l * l;
  return max(vec3(4.0767416621 * l.x - 3.3077115913 * l.y + 0.2309699292 * l.z, -1.2684380046 * l.x + 2.6097574011 * l.y - 0.3413193965 * l.z, -0.0041960863 * l.x - 0.7034186147 * l.y + 1.7076147010 * l.z), vec3(0.0));
}
vec3 mixLab(vec3 a, vec3 b, float t) { return fromLab(mix(toLab(a), toLab(b), t)); }
vec2 screenOf(vec3 cellPos, out float w) {
  vec3 mm = (cellPos + 0.5) * uCell - uOrigin;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(mm, 1.0);
  w = max(c.w, 1.0e-4);
  return c.xy / w * 0.5 * uViewport;
}
void main() {
  ivec2 r = ivec2(ref);
  vec4 s = texelFetch(PA, r, 0);
  vec4 p = texelFetch(PP, r, 0);
  float h = clamp(texelFetch(PB, r, 0).r / uHeatSpan, 0.0, 1.0);
  float life = lifeOf(vec2(r) + 0.5, uMaxAge, uLifeJitter);
  vec3 head = (s.xyz + 0.5) * uCell - uOrigin;
  vec3 over = max(max(-head, head - uCaseExtent), 0.0);
  float outside = length(over);
  float fade = smoothstep(0.0, 12.0, s.w) * (1.0 - smoothstep(life * 0.85, life, s.w)) * (1.0 - smoothstep(uMargin * 0.6, uMargin, outside));
  vColor = h < 0.5 ? mixLab(uCool, uWarm, h * 2.0) : mixLab(uWarm, uHot, (h - 0.5) * 2.0);
  // A stable per-particle strength, so neighbors differ a little without flickering.
  float strength = mix(0.75, 1.0, hash(vec2(r) * 1.31 + 0.5));
  vAlpha = s.x < -1.0e5 ? 0.0 : fade * uAlpha * strength;
  // Length from the displacement per unit of simulation time, so Slow mo shows the same trail moving slower.
  vec4 sl = streakOf(stepDisplacement(p, s, uCell) / uRate);
  float stepCells = sl.w / float(STREAK_SEGMENTS) / uCell;
  int station = int(floor((1.0 - corner.x) * float(STREAK_SEGMENTS) + 0.5));
  // Walk back from the head: a station at rest keeps the direction it had, a blocked step stays put. The tangent is the last step taken to reach the station (the first step for the head).
  vec3 back = -sl.xyz;
  vec3 cur = s.xyz;
  vec3 lastBack = back * stepCells;
  for (int k = 1; k <= STREAK_SEGMENTS; k++) {
    if (k > max(station, 1)) break;
    vec3 v = sampleU(cur);
    float vm = length(v);
    if (vm > 1.0e-5) back = -v / vm;
    vec3 nxt = cur + back * stepCells;
    if (!solidAt(ivec3(floor(nxt + 0.5)))) { lastBack = nxt - cur; cur = nxt; }
  }
  vec3 at = station == 0 ? s.xyz : cur;
  float wa; float wb; float wp;
  // A blocked last step keeps the direction of the last step that moved.
  vec2 pa = screenOf(cur - lastBack, wa);
  vec2 pb = screenOf(cur, wb);
  vec2 pp = screenOf(at, wp);
  float taper = mix(uTailWidth, 1.0, corner.x);
  float half_ = 0.5 * max(uMinWidthPx, uWidthMm * uScale / wp) * taper;
  vec2 axis = pa - pb;
  float len = length(axis);
  axis = len > 1.0e-4 ? axis / len : vec2(1.0, 0.0);
  vec2 side = vec2(-axis.y, axis.x);
  vec2 px = pp + side * half_ * corner.y;
  vec4 c = projectionMatrix * modelViewMatrix * vec4((at + 0.5) * uCell - uOrigin, 1.0);
  gl_Position = vec4(px / (0.5 * uViewport) * wp, c.z, c.w);
  vAlong = corner.x;
  vSide = corner.y;
}`;

export const STREAK_FRAGMENT = FRAGMENT_OUT + /* glsl */ `
in vec3 vColor; in float vAlpha; in float vAlong; in float vSide;
void main() {
  // Strong head fading to a transparent tail; a darker rim around a bright core keeps the streak apart from both light and dark backgrounds.
  float across = abs(vSide);
  float a = vAlpha * pow(vAlong, 0.8) * (1.0 - smoothstep(0.8, 1.0, across));
  if (a < 0.003) discard;
  vec3 col = mix(vColor * 1.15, vColor * 0.3, smoothstep(0.55, 0.9, across));
  gl_FragColor = vec4(col * a, a);
}`;

// Parity pass: per texel a previous and a current particle state (cell xyz, age), out the streak of their step: xyz direction and w length in mm.
export const STREAK_PARITY = FRAGMENT_OUT + STREAK_GLSL + /* glsl */ `
uniform sampler2D T0; uniform sampler2D T1; uniform float uCellMm;
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  gl_FragColor = streakOf(stepDisplacement(texelFetch(T0, f, 0), texelFetch(T1, f, 0), uCellMm));
}`;

// Packs the reduction result into RGBA8 so it can be read back through a PBO and fence: u in R,G and du/u in B,A, 16 bits each.
export const ENCODE = FRAGMENT_OUT + /* glsl */ `
uniform sampler2D A;
vec2 pack16(float v) { float c = clamp(v, 0.0, 0.99998); float hi = floor(c * 255.0) / 255.0; return vec2(hi, (c - hi) * 255.0); }
void main() {
  vec2 r = texelFetch(A, ivec2(0), 0).xy;
  float ratio = r.y > 1e-9 ? r.x / r.y : 1.0;
  gl_FragColor = vec4(pack16(r.y), pack16(ratio));
}`;
