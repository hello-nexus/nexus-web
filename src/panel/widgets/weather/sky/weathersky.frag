#version 330 core
out vec4 fragColor;
uniform vec2  u_resolution;
uniform float u_time;

uniform float u_sunAlt;    // hint_range(-1.0, 1.0, 0.01) = 0.6 sine of sun elevation, negative below the horizon
uniform float u_sunX;      // hint_range(-0.5, 1.5, 0.01) = 0.5 sun progress, 0 sunrise to 1 sunset; beyond that at night
uniform float u_moonX;     // hint_range(0.0, 1.0, 0.01) = 0.5 moon progress across the night
uniform float u_moonPhase; // hint_range(0.0, 1.0, 0.01) = 0.5 0 new, 0.5 full
uniform float u_cloud;     // hint_range(0.0, 1.0, 0.01) = 0.2
uniform float u_rain;      // hint_range(0.0, 1.0, 0.01) = 0.0
uniform float u_snow;      // hint_range(0.0, 1.0, 0.01) = 0.0
uniform float u_fog;       // hint_range(0.0, 1.0, 0.01) = 0.0
uniform float u_storm;     // hint_range(0.0, 1.0, 0.01) = 0.0
uniform float u_wind;      // hint_range(-1.0, 1.0, 0.01) = 0.2 screen-x wind, positive blows right

const float PI = 3.14159265;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float hash11(float x) {
  x = fract(x * 0.1031);
  x *= x + 33.33;
  x *= x + x;
  return fract(x);
}

float fbm1(float x) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    float i0 = floor(x);
    float f = fract(x);
    v += a * mix(hash11(i0), hash11(i0 + 1.0), f * f * (3.0 - 2.0 * f));
    x = x * 2.03 + 7.1;
    a *= 0.5;
  }
  return v;
}

const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
const vec2 SHIFT = vec2(3.1, 1.7);

float fbm2(vec2 p) {
  return 0.48 * vnoise(p) + 0.27 * vnoise(ROT * p + SHIFT);
}

// Four octaves; `coarse` is fbm2 of the same point, for cheap cloud lighting.
float fbm4(vec2 p, out float coarse) {
  coarse = fbm2(p);
  p = ROT * (ROT * p + SHIFT) + SHIFT;
  return coarse + 0.16 * vnoise(p) + 0.1 * vnoise(ROT * p + SHIFT);
}

float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    v += a * vnoise(p);
    p = r * p + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

// Zenith and horizon colours keyed on sun altitude: night, blue hour, sunset, golden hour, day.
void skyPalette(float s, out vec3 zen, out vec3 hor) {
  vec3 zNight = vec3(0.010, 0.018, 0.050), hNight = vec3(0.035, 0.060, 0.120);
  vec3 zBlue  = vec3(0.050, 0.070, 0.200), hBlue  = vec3(0.300, 0.220, 0.380);
  vec3 zSet   = vec3(0.160, 0.220, 0.440), hSet   = vec3(0.980, 0.520, 0.300);
  vec3 zGold  = vec3(0.230, 0.420, 0.720), hGold  = vec3(1.000, 0.760, 0.520);
  vec3 zDay   = vec3(0.130, 0.380, 0.820), hDay   = vec3(0.600, 0.790, 0.960);
  float a = smoothstep(-0.28, -0.10, s);
  float b = smoothstep(-0.10, 0.00, s);
  float c = smoothstep(0.00, 0.14, s);
  float d = smoothstep(0.14, 0.45, s);
  zen = mix(mix(mix(mix(zNight, zBlue, a), zSet, b), zGold, c), zDay, d);
  hor = mix(mix(mix(mix(hNight, hBlue, a), hSet, b), hGold, c), hDay, d);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float starField(vec2 px, float cell, float threshold, float seed) {
  vec2 g = px / cell;
  vec2 id = floor(g);
  float h = hash12(id + seed);
  if (h < threshold) return 0.0;
  vec2 o = hash22(id + seed) - 0.5;
  float d = length((fract(g) - 0.5 - o * 0.7) * cell);
  float tw = 0.65 + 0.35 * sin(u_time * (1.3 + 3.0 * h) + h * 50.0);
  return exp(-d * d * 0.9) * tw * (h - threshold) / (1.0 - threshold);
}

// Streaks falling along -y; `slant` leans them with the wind.
float rainLayer(vec2 q, float px, float scale, float speed, float len, float density, float seed, float slant) {
  vec2 p = q * scale;
  p.x += p.y * slant;
  float col = floor(p.x);
  float r = hash12(vec2(col, seed));
  float fx = fract(p.x) - 0.5 - (r - 0.5) * 0.6;
  float y = p.y / 7.0 + u_time * speed * (0.85 + 0.3 * r) + r * 13.0;
  float cellId = floor(y);
  float fy = fract(y);
  float on = step(hash12(vec2(col, cellId + seed)), density);
  float cellPx = px / scale;
  float w = clamp(1.0 / cellPx, 0.07, 0.45);
  float body = smoothstep(w, 0.0, abs(fx));
  float trail = smoothstep(0.0, 0.03, fy) * smoothstep(len, 0.0, fy);
  return body * trail * on;
}

float snowLayer(vec2 q, float px, float scale, float speed, float size, float density, float seed, float drift) {
  vec2 p = q * scale;
  p.y += u_time * speed;
  p.x += u_time * drift + sin(p.y * 0.6 + seed) * 0.35;
  vec2 id = floor(p);
  float h = hash12(id + seed);
  if (h > density) return 0.0;
  vec2 o = hash22(id + seed * 1.7) - 0.5;
  o.x += 0.18 * sin(u_time * (0.8 + h) + h * 6.2831);
  float cellPx = px / scale;
  float r = max(size, 0.9 / cellPx);
  float d = length(fract(p) - 0.5 - o * 0.55);
  return smoothstep(r, r * 0.25, d) * (0.55 + 0.45 * h);
}

void main() {
  vec2 res = u_resolution;
  float px = min(res.x, res.y);
  vec2 uv = gl_FragCoord.xy / res;
  vec2 q = gl_FragCoord.xy / px;
  float aspect = res.x / res.y;
  float qw = res.x / px;
  float qh = res.y / px;
  float t = u_time;

  float day = smoothstep(-0.12, 0.2, u_sunAlt);
  float night = 1.0 - smoothstep(-0.22, 0.02, u_sunAlt);
  float overcast = smoothstep(0.55, 1.0, u_cloud);
  float gloom = clamp(max(overcast * 0.55, max(u_rain * 0.75, u_storm * 0.85)) + u_snow * 0.2, 0.0, 0.9);

  // Sky
  vec3 zen, hor;
  skyPalette(u_sunAlt, zen, hor);
  float hgt = clamp(uv.y, 0.0, 1.0);
  vec3 col = mix(hor, zen, pow(hgt, 0.55));

  vec2 sunPos = vec2(mix(0.14, 0.86, u_sunX) * qw, qh * (0.1 + 0.78 * u_sunAlt));
  vec2 moonPos = vec2(mix(0.14, 0.86, u_moonX) * qw, qh * (0.12 + 0.7 * clamp(-u_sunAlt, 0.0, 1.0)));
  float dSun = length(q - sunPos);
  vec3 sunCol = mix(vec3(1.0, 0.5, 0.22), vec3(1.0, 0.95, 0.84), smoothstep(0.0, 0.35, u_sunAlt));

  // Horizon glow toward the sun at dawn and dusk.
  float lowSun = 1.0 - smoothstep(0.05, 0.4, abs(u_sunAlt + 0.02));
  float horizonGlow = exp(-abs(q.x - sunPos.x) * 1.6) * exp(-hgt * 3.2) * lowSun;
  col += vec3(1.0, 0.45, 0.2) * horizonGlow * 0.55 * (1.0 - gloom);

  // Grey out under cloud and precipitation.
  vec3 grey = vec3(luma(col)) * mix(vec3(0.95, 0.97, 1.0), vec3(1.0), day);
  col = mix(col, grey * mix(1.0, 0.72, gloom), clamp(overcast * 0.75 + gloom * 0.4, 0.0, 0.92));

  // Stars
  float starVis = night * (1.0 - overcast) * (1.0 - u_fog) * (1.0 - u_rain * 0.8);
  if (starVis > 0.01) {
    vec2 fp = gl_FragCoord.xy;
    float cell = max(6.0, px / 36.0);
    float s = starField(fp, cell, 0.9, 1.0) + 0.6 * starField(fp + 17.0, cell * 0.55, 0.93, 7.0);
    col += vec3(0.85, 0.9, 1.0) * s * starVis * smoothstep(0.05, 0.4, hgt);
  }

  // Sun
  float sunVis = smoothstep(-0.08, 0.02, u_sunAlt) * (1.0 - overcast * 0.85);
  float sunR = 0.045;
  col += sunCol * smoothstep(sunR, sunR * 0.75, dSun) * sunVis * 1.2;
  col += sunCol * (exp(-dSun * 16.0) * 0.45 + exp(-dSun * 3.5) * 0.18) * sunVis * (1.0 - gloom);

  // Moon with phase; the dark limb keeps a faint earthshine.
  float moonVis = night * (1.0 - overcast * 0.9) * (1.0 - u_fog * 0.7);
  float moonR = 0.05;
  vec2 mq = (q - moonPos) / moonR;
  float md = length(mq);
  float lit = 0.5 - 0.5 * cos(u_moonPhase * 2.0 * PI);
  if (moonVis > 0.01) {
    if (md < 1.0) {
      vec3 n = vec3(mq, sqrt(max(0.0, 1.0 - dot(mq, mq))));
      float ph = u_moonPhase * 2.0 * PI;
      vec3 ldir = vec3(sin(ph), 0.0, -cos(ph));
      float shade = smoothstep(-0.06, 0.12, dot(n, ldir));
      float maria = 0.82 + 0.18 * fbm(mq * 2.2 + 4.0, 3);
      vec3 moonCol = vec3(0.75, 0.74, 0.7) * maria * shade + vec3(0.05, 0.06, 0.08);
      float edge = smoothstep(1.0, 0.94, md);
      col = mix(col, moonCol, edge * moonVis);
    }
    col += vec3(0.6, 0.68, 0.85) * exp(-md * moonR * 7.0) * 0.18 * lit * moonVis;
  }

  // Clouds on a perspective deck: small and dense toward the horizon.
  float persp = 1.0 / (hgt * 1.05 + 0.22);
  vec2 cp = vec2((q.x - 0.5 * qw) * persp * 0.75, persp * 1.6);
  float drift = t * (0.012 + 0.05 * abs(u_wind)) * (u_wind < 0.0 ? -1.0 : 1.0);
  cp.x += drift;
  float cover = max(u_cloud, max(u_rain * 0.85, max(u_snow * 0.8, u_storm)));
  float coarse;
  float n = fbm4(cp * 1.7 + vec2(0.0, t * 0.004), coarse);
  float thr = mix(0.78, 0.2, cover);
  float dens = smoothstep(thr, thr + mix(0.22, 0.35, cover), n);
  dens *= smoothstep(-0.02, 0.12, hgt);

  if (dens > 0.001) {
    vec2 toSun = normalize(vec2(sunPos.x - q.x, sunPos.y - q.y) + 1e-4);
    float n2 = fbm2((cp + toSun * 0.09) * 1.7 + vec2(0.0, t * 0.004));
    float edgeLight = clamp(0.5 + (coarse - n2) * 4.0, 0.0, 1.0);
    vec3 litDay = mix(vec3(1.0), sunCol, 0.35 + 0.65 * lowSun);
    vec3 shadowDay = mix(vec3(0.58, 0.63, 0.72), vec3(0.42, 0.36, 0.46), lowSun);
    vec3 litNight = vec3(0.16, 0.19, 0.26) * (0.5 + lit);
    vec3 shadowNight = vec3(0.045, 0.055, 0.08);
    vec3 cLit = mix(litNight, litDay, day);
    vec3 cShadow = mix(shadowNight, shadowDay, day);
    vec3 cloudCol = mix(cShadow, cLit, edgeLight);
    cloudCol *= mix(1.0, 0.42, gloom) * (0.85 + 0.3 * n);
    // Silver lining where a cloud edge crosses the sun.
    float rim = (1.0 - dens) * exp(-dSun * 6.0) * sunVis;
    cloudCol += sunCol * rim * 0.9;
    col = mix(col, cloudCol, dens * mix(0.82, 1.0, cover));
  }

  // High cirrus streaks in fair weather.
  if (cover < 0.7) {
    float ci = fbm(vec2(q.x * 0.8 + t * 0.006, q.y * 5.0), 3);
    float ciDens = smoothstep(0.55, 0.85, ci) * (1.0 - cover) * smoothstep(0.35, 0.85, hgt) * 0.3;
    col = mix(col, mix(vec3(0.2, 0.22, 0.3), mix(vec3(1.0), sunCol, lowSun), day), ciDens);
  }

  // Lightning: flashes on a jittered schedule, some with a visible bolt.
  float flash = 0.0;
  float bolt = 0.0;
  if (u_storm > 0.01) {
    float period = mix(10.0, 3.2, u_storm);
    float k = floor(t / period);
    float r = hash12(vec2(k, 7.13));
    float local = t - k * period - r * period * 0.55;
    float strike = step(r, 0.45 + 0.5 * u_storm);
    float env = exp(-max(local, 0.0) * 12.0) * step(0.0, local)
              + 0.7 * exp(-max(local - 0.16, 0.0) * 15.0) * step(0.16, local);
    flash = env * strike;
    float cx = (0.2 + 0.6 * hash12(vec2(k, 3.7))) * qw;
    float spread = exp(-abs(q.x - cx) * 1.2);
    col += vec3(0.7, 0.76, 1.0) * flash * (0.35 * spread + 0.12) * (0.4 + dens);
    if (hash12(vec2(k, 1.9)) < 0.6 && abs(q.x - cx) < 0.45) {
      float yTop = qh * 0.78;
      float jag = (fbm(vec2(q.y * 7.0, k * 3.1), 3) - 0.5) * 0.35 + (vnoise(vec2(q.y * 30.0, k)) - 0.5) * 0.05;
      float bx = cx + jag + (yTop - q.y) * 0.12 * (hash12(vec2(k, 5.5)) - 0.5);
      float dxp = abs(q.x - bx) * px;
      float inSpan = smoothstep(yTop, yTop - 0.05, q.y) * smoothstep(0.0, 0.06, q.y);
      bolt = (exp(-dxp * 0.9) + 0.35 * exp(-dxp * 0.08)) * inSpan * flash;
      col += vec3(0.85, 0.88, 1.0) * bolt * 1.4;
    }
  }

  // Distant ridges ground the scene; haze lifts the far one toward the horizon colour.
  float aa = 1.5 / px;
  float ridge1 = 0.03 + 0.3 * max(fbm1(q.x * 2.4 + 3.0) - 0.3, 0.0);
  float ridge2 = 0.01 + 0.22 * max(fbm1(q.x * 3.6 + 17.0) - 0.36, 0.0);
  vec3 haze = mix(hor, vec3(luma(hor)), clamp(overcast * 0.75 + gloom * 0.4, 0.0, 0.92)) * mix(1.0, 0.72, gloom);
  vec3 farHill = mix(haze, vec3(0.03, 0.05, 0.08), mix(0.75, 0.4, day)) + vec3(0.6, 0.65, 0.85) * flash * 0.12;
  vec3 nearHill = mix(haze, vec3(0.015, 0.02, 0.035), mix(0.9, 0.7, day)) + vec3(0.6, 0.65, 0.85) * flash * 0.06;
  col = mix(col, farHill, smoothstep(ridge1 + aa, ridge1 - aa, q.y));
  col = mix(col, nearHill, smoothstep(ridge2 + aa, ridge2 - aa, q.y));

  // Rain
  if (u_rain > 0.01) {
    float slant = 0.05 + u_wind * 0.35;
    vec3 rainCol = mix(vec3(0.35, 0.4, 0.5), vec3(0.8, 0.85, 0.92), day) + flash * 0.6;
    float dens1 = mix(0.12, 0.7, u_rain);
    float rsum = rainLayer(q, px, 14.0, 2.6, 0.55, dens1, 1.0, slant) * 0.85;
    rsum += rainLayer(q, px, 28.0, 2.0, 0.45, dens1, 2.0, slant * 0.9) * 0.5;
    rsum += rainLayer(q, px, 52.0, 1.5, 0.35, dens1, 3.0, slant * 0.8) * 0.24;
    col = mix(col, rainCol, clamp(rsum, 0.0, 1.0) * (0.5 + 0.5 * u_rain));
    col = mix(col, vec3(luma(col)) * 1.05, u_rain * 0.22);
  }

  // Snow
  if (u_snow > 0.01) {
    float sDrift = u_wind * 0.35;
    float sd = mix(0.12, 0.75, u_snow);
    vec3 snowCol = mix(vec3(0.62, 0.66, 0.74), vec3(1.0), day);
    float ssum = snowLayer(q, px, 5.0, 0.28, 0.13, sd * 0.6, 1.0, sDrift) * 0.95;
    ssum += snowLayer(q, px, 9.0, 0.2, 0.1, sd, 2.0, sDrift * 0.8) * 0.7;
    ssum += snowLayer(q, px, 17.0, 0.14, 0.08, sd, 3.0, sDrift * 0.6) * 0.45;
    col = mix(col, snowCol, clamp(ssum, 0.0, 1.0));
  }

  // Fog: height-weighted with drifting wisps.
  if (u_fog > 0.01) {
    float w = fbm(vec2(q.x * 1.2 + t * 0.018 * (u_wind < 0.0 ? -1.0 : 1.0), q.y * 2.6 - t * 0.004), 3);
    vec3 fogCol = mix(vec3(0.1, 0.11, 0.14), vec3(0.74, 0.76, 0.79), day);
    fogCol = mix(fogCol, fogCol * vec3(1.08, 0.95, 0.85), lowSun * day);
    fogCol += sunCol * exp(-dSun * 2.5) * 0.35 * day * (1.0 - overcast * 0.6);
    float amt = u_fog * (0.78 + 0.3 * smoothstep(0.9, 0.0, hgt)) * (0.78 + 0.3 * smoothstep(0.3, 0.75, w));
    col = mix(col, fogCol, clamp(amt, 0.0, 0.96));
  }

  // Vignette and a dither against gradient banding on 8-bit panels.
  vec2 vc = uv - 0.5;
  vc.x *= min(aspect, 2.0);
  col *= mix(0.78, 1.0, smoothstep(0.95, 0.25, length(vc)));
  col += (hash12(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) / 255.0;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
