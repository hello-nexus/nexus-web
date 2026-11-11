import { PARTICLE_TEXTURE, SPAWN_TRIES, TEMP_DIFFUSION, STREAK_MAX_MM, STREAK_MIN_MM, STREAK_STALL_MM, STREAK_STEPS } from './flowParams';

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

export const GRID_COMMON = /* glsl */ `
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
export const TEMP_COMMON = /* glsl */ `
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
uniform vec3 uSrc; uniform float uCoupling; uniform vec3 uPow; uniform float uMaxRise;
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
  // A part with a power reading adds its watts as energy (degrees per step already worked out for this scene); without one the air closes on the part's temperature.
  float pw = id == 1 ? uPow.y : (id == 2 ? uPow.z : -1.0);
  if (pw >= 0.0) t = min(t + pw, src >= 0.0 ? min(uMaxRise, src) : uMaxRise);
  else if (src >= 0.0) t += uCoupling * (src - t);
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
// The projected, clamped velocity of an interior fluid cell.
vec3 projectedAt(ivec3 c) {
  vec4 m = mask(c);
  vec3 u = texelFetch(U, tc(c), 0).xyz;
  float pc = m.b > 0.5 ? 0.0 : texelFetch(P, tc(c), 0).r;
  vec3 g = 0.5 * vec3(pn(c + ivec3(1,0,0), pc) - pn(c - ivec3(1,0,0), pc), pn(c + ivec3(0,1,0), pc) - pn(c - ivec3(0,1,0), pc), pn(c + ivec3(0,0,1), pc) - pn(c - ivec3(0,0,1), pc));
  u -= g;
  // No penetration: nothing moves into a solid neighbor.
  if ((solidAt(c + ivec3(1,0,0)) && u.x > 0.0) || (solidAt(c - ivec3(1,0,0)) && u.x < 0.0)) u.x = 0.0;
  if ((solidAt(c + ivec3(0,1,0)) && u.y > 0.0) || (solidAt(c - ivec3(0,1,0)) && u.y < 0.0)) u.y = 0.0;
  if ((solidAt(c + ivec3(0,0,1)) && u.z > 0.0) || (solidAt(c - ivec3(0,0,1)) && u.z < 0.0)) u.z = 0.0;
  float l = length(u);
  if (!(l <= uVmax)) u *= (l > 0.0 && !isnan(l) && !isinf(l)) ? uVmax / l : 0.0;
  return u;
}
void main() {
  ivec3 c = cellOf(ivec2(gl_FragCoord.xy));
  if (c.z >= N.z) { gl_FragColor = vec4(0.0); return; }
  vec4 m = mask(c);
  vec3 u = texelFetch(U, tc(c), 0).xyz;
  if (m.r > 0.5) { gl_FragColor = vec4(0.0); return; }
  if (onBoundary(c)) {
    // Zero-gradient open boundary: a fixed-pressure boundary cell takes the projected velocity of its inner neighbor along its first boundary axis, so the next projection reads a boundary consistent with the interior.
    if (m.b > 0.5) {
      ivec3 n = c;
      if (c.x == 0) n.x = 1; else if (c.x == N.x - 1) n.x = N.x - 2;
      else if (c.y == 0) n.y = 1; else if (c.y == N.y - 1) n.y = N.y - 2;
      else if (c.z == 0) n.z = 1; else n.z = N.z - 2;
      if (!solidAt(n) && !onBoundary(n)) { gl_FragColor = vec4(projectedAt(n), 0.0); return; }
    }
    gl_FragColor = vec4(u, 0.0);
    return;
  }
  gl_FragColor = vec4(projectedAt(c), 0.0);
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
uniform float uRefSpeed; uniform float uEmitterCount; uniform vec3 uBoundsMin; uniform vec3 uBoundsMax; uniform vec3 uCaseMin; uniform vec3 uCaseMax; uniform float uExitCells; uniform float uOutDecay; uniform float uReachCells; uniform float uSpeedGamma; uniform float uSpeedGammaHi; uniform float uSpeedRef; uniform float uSeed; uniform float uMaxAge; uniform float uBirthSpread; uniform float uLifeJitter; uniform float uSpeed; uniform float uSubsteps; uniform float uStuckMove; uniform float uStuckRate; uniform float uFadeOut;
ivec3 cellAtPos(vec3 p) { return ivec3(floor(p + 0.5)); }
`;

const SPAWN_DEFINE = `#define SPAWN_TRIES ${SPAWN_TRIES}\n`;

// Particle state: xyz cell coordinates, w age. One pass moves, recycles and respawns.
export const PARTICLE_STATE = SPAWN_DEFINE + PARTICLE_COMMON + /* glsl */ `
uniform sampler2D F; // xyz target velocity, w fan cell
// The velocity a particle feels: a fan cell's own target, else the solved field.
vec3 pvelRaw(vec3 q) {
  ivec3 c = cellAtPos(q);
  if (inside(c)) { vec4 f = texelFetch(F, tc(c), 0); if (f.w > 0.5) return f.xyz; }
  return sampleU(q);
}
// The speed a particle is drawn at: with a gamma under one, slow air is brought up toward the reference speed and fast air eased down, keeping every direction and the order of the speeds, so a gentle drift across the case reads as motion next to a fan's jet.
vec3 pvel(vec3 q) {
  vec3 v = pvelRaw(q);
  if (uSpeedGamma < 1.0) {
    float m = length(v);
    // Below the reference the lift is strong; above it the easing is gentle, so the speed-up into a fan still grows and reads.
    if (m > 1.0e-6) v *= pow(m / uSpeedRef, (m < uSpeedRef ? uSpeedGamma : uSpeedGammaHi) - 1.0);
  }
  return v;
}
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(PA, f, 0);
  vec3 p = s.xyz; float age = s.w;
  // Age runs in simulation time: a slower drawn speed ages a particle per step by the same share, so its path before recycling never shortens.
  float rate = uSpeed / uRefSpeed;
  bool respawn = age > uMaxAge * 4.0;
  bool fresh = respawn;
  // A warm update can close the cell a particle sits in: only those start over.
  float life = lifeOf(gl_FragCoord.xy, uMaxAge, uLifeJitter);
  float dieAt = life - uFadeOut;
  // With a fade-out window a particle that ends early (a closed cell, a wall or the edge) enters its fade instead of teleporting: it jumps to the window start, keeps moving and respawns once it has faded.
  if (!respawn && p.x > -1.0e5 && age >= 0.0 && solidAt(cellAtPos(p))) { if (uFadeOut > 0.0) age = max(age, dieAt); else respawn = true; }
  // Not yet born: wait unseen at the spawn point.
  if (!respawn && age < 0.0) { gl_FragColor = vec4(p, age + rate); return; }
  if (!respawn) {
    vec3 q = p;
    float rawStart = length(pvelRaw(p));
    float h = uSpeed / uSubsteps;
    // Sub-steps keep each move under a cell; one axis at a time, so a blocked axis slides along the surface instead of entering it.
    for (int k = 0; k < 8; k++) {
      if (float(k) >= uSubsteps) break;
      vec3 k1 = pvel(q);
      // Outside the case the solved air is weak: a particle on its way out slows gently with its distance from the case instead of stalling, so it leaves the way it came in.
      float hk = h;
      if (uOutDecay > 0.0) {
        float o0 = length(max(max(uCaseMin - q, q - uCaseMax), vec3(0.0)));
        float o1 = length(max(max(uCaseMin - (q + k1 * h), q + k1 * h - uCaseMax), vec3(0.0)));
        if (o1 > o0) hk = h * (1.0 - uOutDecay * smoothstep(0.0, uReachCells, o0));
      }
      vec3 d = pvel(q + 0.5 * hk * k1) * hk;
      vec3 t = q + vec3(d.x, 0.0, 0.0); if (!solidAt(cellAtPos(t))) q = t;
      t = q + vec3(0.0, d.y, 0.0); if (!solidAt(cellAtPos(t))) q = t;
      t = q + vec3(0.0, 0.0, d.z); if (!solidAt(cellAtPos(t))) q = t;
      if (mask(cellAtPos(q)).b > 0.5) break;
    }
    // A particle that barely moves, in dead air or against a wall, ages fast and is soon recycled.
    // Stuck is a wall or truly stagnant air: with the speed mapping a slow but moving particle is lifted, so the physical speed where it started also counts.
    bool stuck = length(q - p) < uStuckMove * uSpeed || (uSpeedGamma < 1.0 && rawStart < uStuckMove * 0.4);
    float inc = (stuck ? uStuckRate : 1.0) * rate;
    // A stuck particle's fast aging stops at the fade window, where it fades twice as fast as a moving one, so a streak resting against a wall does not loiter.
    if (uFadeOut > 0.0) inc = age < dieAt ? min(inc, dieAt - age) : (stuck ? 2.0 : 1.0) * rate;
    age += inc;
    vec3 pPrev = p;
    p = q;
    ivec3 c = cellAtPos(p);
    // Nothing lives past the outside reach of the case box: a particle that leaves it is recycled.
    bool leaves = any(lessThan(p, uBoundsMin)) || any(greaterThan(p, uBoundsMax)) || mask(c).b > 0.5;
    // A stream on its way out starts its time-based fade a little past the case face, so it does not have to fade by distance at full speed.
    if (uExitCells > 0.0) {
      float outNow = length(max(max(uCaseMin - p, p - uCaseMax), vec3(0.0)));
      float outBefore = length(max(max(uCaseMin - pPrev, pPrev - uCaseMax), vec3(0.0)));
      leaves = leaves || (outNow > uExitCells && outNow > outBefore);
    }
    if (uFadeOut > 0.0) { if (leaves) age = max(age, dieAt); respawn = age > life; }
    else respawn = leaves || age > life;
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
export const streakGlsl = (steps: number, minMm: number, maxMm: number) => /* glsl */ `
#define STREAK_STEPS ${glFloat(steps)}
#define STREAK_MIN_MM ${glFloat(minMm)}
#define STREAK_MAX_MM ${glFloat(maxMm)}
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
export const STREAK_GLSL = streakGlsl(STREAK_STEPS, STREAK_MIN_MM, STREAK_MAX_MM);

/** The heat ramp, shared by the streaks and the heat volume: three stops blended in OKLab, `h` 0 at the cool end and 1 at the hot end. */
export const RAMP = /* glsl */ `
uniform vec3 uCool; uniform vec3 uPurple; uniform vec3 uHot;
// Colors convert to OKLab from linear sRGB for the blend below.
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
// The ramp runs through three stops, each segment blended in OKLab: cool, purple, hot. Blue to red passes purple, never white, yellow or green.
vec3 mixLab(vec3 a, vec3 b, float t) { return fromLab(mix(toLab(a), toLab(b), t)); }
vec3 rampColor(float h) {
  float x = clamp(h, 0.0, 1.0) * 2.0;
  if (x < 1.0) return mixLab(uCool, uPurple, x);
  return mixLab(uPurple, uHot, x - 1.0);
}
`;

// The share of full alpha a particle in state s (xyz cell, w age) draws at: zero until born and once dead, eased in and out of life, and out toward the margin around the case.
export const FADE_GLSL = LIFE + /* glsl */ `
uniform float uCell; uniform vec3 uOrigin; uniform vec3 uCaseExtent; uniform float uMargin;
uniform float uMaxAge; uniform float uLifeJitter; uniform float uFadeOut; uniform float uMarginStart;
float ease5(float t) { t = clamp(t, 0.0, 1.0); return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float easeEdge(float a, float b, float x) { return ease5((x - a) / (b - a)); }
// The margin fade is spatial, so with a time-based exit it only dims the spawn area and starts further out.
float marginFade(float outside) {
  float start = uMarginStart > 0.0 ? uMarginStart : 0.1;
  float x = clamp((outside - uMargin * start) / (uMargin * (1.0 - start)), 0.0, 1.0);
  if (uMarginStart > 0.0) return 1.0 - x * x * (3.0 - 2.0 * x);
  return 1.0 - 0.5 * (x + x * x * (3.0 - 2.0 * x));
}
float fadeOf(vec4 s, vec2 pixel) {
  if (s.x < -1.0e5) return 0.0;
  float life = lifeOf(pixel, uMaxAge, uLifeJitter);
  vec3 head = (s.xyz + 0.5) * uCell - uOrigin;
  vec3 over = max(max(-head, head - uCaseExtent), 0.0);
  float outside = length(over);
  return easeEdge(0.0, max(60.0, uFadeOut), s.w) * (1.0 - easeEdge(uFadeOut > 0.0 ? life - uFadeOut : life * 0.85, life, s.w)) * marginFade(outside);
}
`;



/** History ring write: each particle's position per step, filled with the spawn point on a respawn and held while it fades out. */
export const HIST_PASS = FRAGMENT_OUT + LIFE + /* glsl */ `
uniform sampler2D PA; uniform sampler2D HP;
uniform int uWrite; uniform int uLast;
uniform float uMaxAge; uniform float uLifeJitter; uniform float uFadeOut;
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  int p = f.y;
  ivec2 sc = ivec2(p % ${PARTICLE_TEXTURE.w}, p / ${PARTICLE_TEXTURE.w});
  vec4 st = texelFetch(PA, sc, 0);
  vec4 last = texelFetch(HP, ivec2(uLast, p), 0);
  vec4 old = texelFetch(HP, f, 0);
  float life = lifeOf(vec2(sc) + 0.5, uMaxAge, uLifeJitter);
  bool dying = st.w >= 0.0 && st.w > life - uFadeOut;
  bool bad = st.x < -1.0e5;
  bool reset = bad || st.w < last.w - 0.5 || (!dying && length(st.xyz - last.xyz) > 4.0);
  vec4 val = st;
  if (dying && !reset) val = vec4(last.xyz, st.w);
  gl_FragColor = (reset || f.x == uWrite) ? val : old;
}`;

// A particle drawn through its recorded positions, read from the history ring, so a trail never reaches into air the particle did not cross.
export const histVertex = (segments: number, hn: number) => GRID_COMMON + TEMP_COMMON + FADE_GLSL + /* glsl */ `
#define STREAK_SEGMENTS ${segments}
#define HN ${hn}
uniform sampler2D PA; uniform sampler2D HIST;
uniform int uHead; uniform float uTrailSteps;
uniform float uWidthMm; uniform float uMinWidthPx; uniform vec2 uViewport; uniform float uScale;
uniform float uAlpha; uniform float uHeatSpan;
uniform float uSpeedLo; uniform float uSpeedHi; uniform float uSpeedMin; uniform float uFade; uniform float uOwed; uniform float uHeadFade; uniform float uAlphaVar; uniform float uHeatGain; uniform float uHeatCurve;
in vec2 ref; in vec2 corner;
out vec3 vColor; out float vAlpha; out float vAlong; out float vSide; out float vHalfPx; out float vThin;
${RAMP}
// Cool straight to hot, with no purple stop.
vec3 streakRamp(float h) { return mixLab(uCool, uHot, clamp(h, 0.0, 1.0)); }
vec2 screenOf(vec3 cellPos, out float w) {
  vec3 mm = (cellPos + 0.5) * uCell - uOrigin;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(mm, 1.0);
  w = max(c.w, 1.0e-4);
  return c.xy / w * 0.5 * uViewport;
}
// The recorded position b particle steps behind the newest sample, interpolated between samples.
vec3 histPos(int n, float b) {
  float bb = clamp(b, 0.0, float(HN - 2));
  float j = floor(bb);
  float f = bb - j;
  int i0 = ((uHead - int(j)) % HN + HN) % HN;
  int i1 = ((uHead - int(j) - 1) % HN + HN) % HN;
  return mix(texelFetch(HIST, ivec2(i0, n), 0).xyz, texelFetch(HIST, ivec2(i1, n), 0).xyz, f);
}
void main() {
  ivec2 r = ivec2(ref);
  int n = r.y * ${PARTICLE_TEXTURE.w} + r.x;
  vec4 s = texelFetch(PA, r, 0);
  float owed = max(uOwed, 0.0);
  vec4 sh = s.x < -1.0e5 ? s : vec4(histPos(n, 1.0 - owed), s.w);
  float strength = mix(1.0 - uAlphaVar, 1.0, hash(vec2(r) * 1.31 + 0.5));
  float share = fadeOf(sh, vec2(r) + 0.5);
  vAlpha = share * uFade * uAlpha * strength;
  int station = int(floor((1.0 - corner.x) * float(STREAK_SEGMENTS) + 0.5));
  float b = (1.0 - owed) + float(station) / float(STREAK_SEGMENTS) * uTrailSteps;
  vec3 at = histPos(n, b);
  float hs = clamp(sampleT(at) / uHeatSpan, 0.0, 1.0);
  vColor = streakRamp(pow(clamp(hs * uHeatGain, 0.0, 1.0), uHeatCurve));
  float wp; float wb;
  vec2 pp = screenOf(at, wp);
  vec3 back3 = histPos(n, b + 3.0);
  vec2 pb = screenOf(back3, wb);
  // Width follows the speed recorded at the station, so slow air draws thinner and fast air full width.
  float speedW = uSpeedHi > 0.0 ? mix(uSpeedMin, 1.0, smoothstep(uSpeedLo, uSpeedHi, length(at - back3) * uCell / 3.0)) : 1.0;
  // A streak that is fading in or out also thins, so a stalled or dying one narrows to a wisp as it goes.
  speedW *= mix(0.35, 1.0, smoothstep(0.0, 0.7, share));
  // The ribbon keeps its full width: the ends are shaped per pixel in the fragment shader.
  float half_ = 0.5 * max(uMinWidthPx, uWidthMm * uScale / wp) * speedW;
  vHalfPx = 0.5 * max(uMinWidthPx, uWidthMm * uScale / wp) * speedW;
  // How narrow the streak is on screen, 0 for a wide one to 1 for a thin one; thin streaks get shorter end fades so a solid body remains.
  vThin = 1.0 - smoothstep(14.0, 26.0, max(uMinWidthPx, uWidthMm * uScale / wp));
  // The head dissolves: alpha ramps from nothing at the tip to full over the first share of the ribbon.
  if (uHeadFade > 0.0) vAlpha *= ease5((1.0 - corner.x) / mix(uHeadFade, 0.18, vThin));
  vec2 axis = pp - pb;
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
in vec3 vColor; in float vAlpha; in float vAlong; in float vSide; in float vHalfPx; in float vThin;
uniform float uFadePow; uniform float uShapeHead; uniform float uShapeTail;
void main() {
  // The outline is carved per pixel, so no segment count shows as corners.
  float ph = sqrt(clamp((1.0 - vAlong) / uShapeHead, 0.0, 1.0));
  // A narrow streak keeps a solid body: its tail shaping and fade shorten as the on-screen width shrinks.
  float pt = sqrt(clamp(vAlong / mix(uShapeTail, 0.25, vThin), 0.0, 1.0));
  float prof = min(ph, pt);
  float feather = 1.5 / max(vHalfPx, 1.0);
  float body = 1.0 - smoothstep(prof - feather, prof, abs(vSide));
  float a = vAlpha * pow(vAlong, mix(uFadePow, 0.45, vThin)) * body;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * 1.1 * a, a);
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
