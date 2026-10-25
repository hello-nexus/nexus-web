/** GLSL for the grid solver and particles: a straight port of `cpuSolver.ts` and `cpuParticles.ts`. The 3D grid is packed into one 2D float texture, `TX` slices per row. */

export const FULLSCREEN_VERTEX = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Fragment output for GLSL3 materials: three declares none, so gl_FragColor is mapped onto one. */
export const FRAGMENT_OUT = /* glsl */ `
layout(location = 0) out highp vec4 fragOut;
#define gl_FragColor fragOut
`;

const COMMON = FRAGMENT_OUT + /* glsl */ `
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
// Trilinear velocity at cell coordinates (cell centres at integers); solid cells contribute nothing.
vec3 sampleU(vec3 p) {
  p = clamp(p, vec3(0.0), vec3(N - 1));
  ivec3 b = ivec3(floor(p));
  vec3 f = p - vec3(b);
  vec3 c000 = vel(b), c100 = vel(b + ivec3(1,0,0)), c010 = vel(b + ivec3(0,1,0)), c110 = vel(b + ivec3(1,1,0));
  vec3 c001 = vel(b + ivec3(0,0,1)), c101 = vel(b + ivec3(1,0,1)), c011 = vel(b + ivec3(0,1,1)), c111 = vel(b + ivec3(1,1,1));
  return mix(mix(mix(c000, c100, f.x), mix(c010, c110, f.x), f.y), mix(mix(c001, c101, f.x), mix(c011, c111, f.x), f.y), f.z);
}
`;

export const ADVECT = COMMON + /* glsl */ `
uniform sampler2D F; // xyz target velocity, w fan cell
uniform float uBlend; uniform float uDamp; uniform float uVmax;
void main() {
  ivec3 c = cellOf(ivec2(gl_FragCoord.xy));
  if (c.z >= N.z) { gl_FragColor = vec4(0.0); return; }
  vec4 m = mask(c);
  if (m.r > 0.5) { gl_FragColor = vec4(0.0); return; }
  vec3 u = texelFetch(U, tc(c), 0).xyz;
  vec3 a = sampleU(vec3(c) - u);
  vec4 f = texelFetch(F, tc(c), 0);
  if (f.w > 0.5) a += (f.xyz - a) * uBlend;
  a *= uDamp / (1.0 + m.g);
  float l = length(a);
  if (l > uVmax) a *= uVmax / l;
  gl_FragColor = vec4(a, 0.0);
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
// Pressure of a neighbour: a solid wall reads as the cell's own pressure (no force across it), fixed-pressure cells as 0.
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
  // No penetration: nothing moves into a solid neighbour.
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

// Mean age of air: advected with the flow, one step older each step; air outside the case is fresh.
export const AGE = COMMON + /* glsl */ `
uniform sampler2D AG; uniform vec3 uCaseMin; uniform vec3 uCaseMax;
float ageAt(ivec3 c) { return texelFetch(AG, tc(clamp(c, ivec3(0), N - 1)), 0).r; }
void main() {
  ivec3 c = cellOf(ivec2(gl_FragCoord.xy));
  if (c.z >= N.z || mask(c).r > 0.5) { gl_FragColor = vec4(0.0); return; }
  vec3 fc = vec3(c);
  if (any(lessThan(fc, uCaseMin)) || any(greaterThan(fc, uCaseMax))) { gl_FragColor = vec4(0.0); return; }
  vec3 p = clamp(vec3(c) - texelFetch(U, tc(c), 0).xyz, vec3(0.0), vec3(N - 1));
  ivec3 b = ivec3(floor(p)); vec3 f = p - vec3(b);
  float sum = 0.0; float wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    ivec3 o = ivec3(i & 1, (i >> 1) & 1, (i >> 2) & 1);
    float wt = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y) * (o.z == 1 ? f.z : 1.0 - f.z);
    ivec3 n = clamp(b + o, ivec3(0), N - 1);
    if (mask(n).r > 0.5) continue;
    sum += wt * ageAt(n); wsum += wt;
  }
  float age = wsum > 0.0 ? sum / wsum : texelFetch(AG, tc(c), 0).r;
  gl_FragColor = vec4(min(age + 1.0, 100000.0), 0.0, 0.0, 0.0);
}`;

const PARTICLE_COMMON = COMMON + /* glsl */ `
uniform sampler2D PA; uniform sampler2D SP;
uniform float uSpawnCount; uniform float uSeed; uniform float uMaxAge;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
ivec3 cellAtPos(vec3 p) { return ivec3(floor(p + 0.5)); }
`;

// Particle state: xyz cell coordinates, w age. One pass moves, recycles and respawns.
export const PARTICLE_STATE = PARTICLE_COMMON + /* glsl */ `
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(PA, f, 0);
  vec3 p = s.xyz; float age = s.w;
  bool respawn = age > uMaxAge * 4.0;
  bool fresh = respawn;
  if (!respawn) {
    vec3 k1 = sampleU(p);
    vec3 d = sampleU(p + 0.5 * k1);
    vec3 q = p;
    // One axis at a time, so a blocked axis slides along the surface instead of entering it.
    vec3 t = q + vec3(d.x, 0.0, 0.0); if (!solidAt(cellAtPos(t))) q = t;
    t = q + vec3(0.0, d.y, 0.0); if (!solidAt(cellAtPos(t))) q = t;
    t = q + vec3(0.0, 0.0, d.z); if (!solidAt(cellAtPos(t))) q = t;
    p = q; age += 1.0;
    ivec3 c = cellAtPos(p);
    respawn = mask(c).b > 0.5 || age > uMaxAge;
  }
  if (respawn) {
    if (uSpawnCount < 1.0) { gl_FragColor = vec4(-1.0e6, 0.0, 0.0, uMaxAge * 8.0); return; }
    int i = int(hash(gl_FragCoord.xy + uSeed) * uSpawnCount);
    p = texelFetch(SP, ivec2(min(i, int(uSpawnCount) - 1), 0), 0).xyz;
    age = fresh ? hash(gl_FragCoord.xy * 1.7 + uSeed) * uMaxAge * 0.8 : 0.0;
  }
  gl_FragColor = vec4(p, age);
}`;

// Particle heat: grows inside heat cells, resets when the particle respawns.
export const PARTICLE_HEAT = PARTICLE_COMMON + /* glsl */ `
uniform sampler2D PB;
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(PA, f, 0);
  float h = texelFetch(PB, f, 0).r;
  if (s.w < 1.0 || s.x < -1.0e5) h = 0.0;
  else { ivec3 c = cellAtPos(s.xyz); if (inside(c)) h = min(1.0, h + mask(c).a); }
  gl_FragColor = vec4(h, 0.0, 0.0, 0.0);
}`;

export const POINT_VERTEX = /* glsl */ `
uniform sampler2D PA; uniform sampler2D PB;
uniform float uCell; uniform vec3 uOrigin; uniform vec3 uCaseExtent; uniform float uMargin;
uniform float uSize; uniform float uScale; uniform float uMinPx; uniform float uMaxAge; uniform float uAlpha;
uniform vec3 uCool; uniform vec3 uWarm; uniform vec3 uHot;
in vec2 ref;
out vec3 vColor; out float vAlpha;
void main() {
  ivec2 r = ivec2(ref);
  vec4 s = texelFetch(PA, r, 0);
  float h = texelFetch(PB, r, 0).r;
  vec3 world = (s.xyz + 0.5) * uCell - uOrigin;
  vec3 over = max(max(-world, world - uCaseExtent), 0.0);
  float outside = length(over);
  float fade = smoothstep(0.0, 12.0, s.w) * (1.0 - smoothstep(uMaxAge * 0.85, uMaxAge, s.w)) * (1.0 - smoothstep(uMargin * 0.35, uMargin, outside));
  vColor = h < 0.5 ? mix(uCool, uWarm, h * 2.0) : mix(uWarm, uHot, (h - 0.5) * 2.0);
  vAlpha = s.x < -1.0e5 ? 0.0 : fade * uAlpha;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(uMinPx, uSize * uScale / max(-mv.z, 1.0));
}`;

export const POINT_FRAGMENT = FRAGMENT_OUT + /* glsl */ `
in vec3 vColor; in float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vAlpha * smoothstep(1.0, 0.15, r);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

export const VOLUME_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const VOLUME_FRAGMENT = COMMON + /* glsl */ `
uniform sampler2D AG; uniform float uCell; uniform vec3 uOrigin; uniform vec3 uCaseExtent; uniform float uAgeRef; uniform vec3 uColor;
in vec3 vWorld;
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec3 inv = 1.0 / rd;
  vec3 t0 = (vec3(0.0) - ro) * inv; vec3 t1 = (uCaseExtent - ro) * inv;
  vec3 tmin = min(t0, t1); vec3 tmax = max(t0, t1);
  float ta = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  float tb = min(min(tmax.x, tmax.y), tmax.z);
  if (tb <= ta) discard;
  const int STEPS = 64;
  float dt = (tb - ta) / float(STEPS);
  float T = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (ta + (float(i) + 0.5) * dt);
    ivec3 c = ivec3(floor((p + uOrigin) / uCell));
    if (!inside(c) || mask(c).r > 0.5) continue;
    float age = texelFetch(AG, tc(c), 0).r / uAgeRef;
    float dens = smoothstep(1.0, 2.5, age);
    float a = 1.0 - exp(-dens * dt / (uCell * 6.0));
    acc += T * a * uColor;
    T *= 1.0 - a;
    if (T < 0.02) break;
  }
  float alpha = 1.0 - T;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(acc / max(alpha, 1e-4), alpha * 0.85);
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
