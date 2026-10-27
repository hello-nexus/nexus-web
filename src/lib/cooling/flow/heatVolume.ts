import { Group, GLSL3, LinearFilter, Matrix4, Mesh, NormalBlending, PerspectiveCamera, PlaneGeometry, ShaderMaterial, UnsignedByteType, Vector2, Vector3, WebGLRenderTarget, type Texture, type WebGLRenderer } from 'three';
import { DEV_TOOLS } from '../../devTools';
import { FRAGMENT_OUT, FULLSCREEN_VERTEX, GRID_COMMON, RAMP, TEMP_COMMON } from './shaders';
import { PassRunner } from './glFlow';
import { VOLUME_EARLY_EXIT, VOLUME_SCALE, VOLUME_STEPS, VOLUME_WALL_FADE_MM, VOLUME_ABSORB_PER_MM } from './heatVolumeMath';
import type { FlowScene } from './gridScene';
import type { FlowColors } from './flowLayer';

// Dev tools only: the shader text is empty in a release bundle, where the branch that builds this view is dead code.
const VOLUME_FRAGMENT = DEV_TOOLS ? FRAGMENT_OUT + GRID_COMMON + TEMP_COMMON + RAMP + /* glsl */ `
uniform mat4 uInvProj; uniform mat4 uInvMV; uniform vec2 uRes;
uniform float uCell; uniform vec3 uOrigin; uniform float uHeatSpan; uniform float uAbsorb; uniform float uWallFade;
uniform vec3 uCaseLo; uniform vec3 uCaseHi;
#define VOLUME_STEPS ${VOLUME_STEPS}
#define EARLY_EXIT ${VOLUME_EARLY_EXIT.toFixed(2)}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec4 vp = uInvProj * vec4(ndc, 1.0, 1.0);
  vec3 ro = (uInvMV * vec4(0.0, 0.0, 0.0, 1.0)).xyz + uOrigin;
  vec3 rd = normalize((uInvMV * vec4(vp.xyz / vp.w, 0.0)).xyz);
  rd += step(abs(rd), vec3(1.0e-6)) * 1.0e-6;
  vec3 inv = 1.0 / rd;
  vec3 ta = (uCaseLo - ro) * inv; vec3 tb = (uCaseHi - ro) * inv;
  float t0 = max(max(min(ta.x, tb.x), min(ta.y, tb.y)), max(min(ta.z, tb.z), 0.0));
  float t1 = min(min(max(ta.x, tb.x), max(ta.y, tb.y)), max(ta.z, tb.z));
  if (t1 <= t0) { gl_FragColor = vec4(0.0); return; }
  float dt = (t1 - t0) / float(VOLUME_STEPS);
  float t = t0 + dt * hash21(gl_FragCoord.xy);
  vec3 acc = vec3(0.0); float alpha = 0.0;
  for (int i = 0; i < VOLUME_STEPS; i++) {
    vec3 p = ro + rd * t; t += dt;
    vec3 cp = p / uCell - 0.5;
    if (solidAt(ivec3(floor(cp + 0.5)))) continue;
    float h = clamp(sampleT(cp) / uHeatSpan, 0.0, 1.0);
    float dens = h * h * (3.0 - 2.0 * h);
    vec3 d3 = min(p - uCaseLo, uCaseHi - p);
    float a = (1.0 - exp(-dens * uAbsorb * dt)) * smoothstep(0.0, uWallFade, min(d3.x, min(d3.y, d3.z)));
    if (a < 0.002) continue;
    acc += (1.0 - alpha) * a * rampColor(h);
    alpha += (1.0 - alpha) * a;
    if (alpha > EARLY_EXIT) break;
  }
  gl_FragColor = vec4(acc, alpha);
}` : '';

const COMPOSITE_FRAGMENT = DEV_TOOLS ? FRAGMENT_OUT + /* glsl */ `
uniform sampler2D V; uniform vec2 uRes;
void main() { gl_FragColor = texture(V, gl_FragCoord.xy / uRes); }` : '';

/** Dev tools: the temperature field as a volume. A half-size raymarch of the field over the case box, blue to purple to red like the streaks, drawn as one screen quad under the particles. */
export class HeatVolume {
  private readonly target: WebGLRenderTarget;
  private readonly march: ShaderMaterial;
  private readonly composite: ShaderMaterial;
  private readonly quad: Mesh;
  private readonly host: Group;
  private readonly invProj = new Matrix4();
  private readonly invMV = new Matrix4();
  private readonly size = new Vector2();
  private key = '';

  constructor(host: Group, colors: FlowColors) {
    this.host = host;
    this.target = new WebGLRenderTarget(2, 2, { type: UnsignedByteType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.march = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: FULLSCREEN_VERTEX, fragmentShader: VOLUME_FRAGMENT, depthTest: false, depthWrite: false,
      uniforms: {
        uN: { value: new Vector3() }, uTX: { value: 1 }, M: { value: null as unknown }, U: { value: null as unknown }, T: { value: null as unknown },
        uInvProj: { value: this.invProj }, uInvMV: { value: this.invMV }, uRes: { value: new Vector2(2, 2) },
        uCell: { value: 1 }, uOrigin: { value: new Vector3() }, uHeatSpan: { value: 1 }, uAbsorb: { value: VOLUME_ABSORB_PER_MM }, uWallFade: { value: VOLUME_WALL_FADE_MM },
        uCaseLo: { value: new Vector3() }, uCaseHi: { value: new Vector3() },
        uCool: { value: colors.cool }, uPurple: { value: colors.purple }, uHot: { value: colors.hot },
      },
    });
    this.composite = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: FULLSCREEN_VERTEX, fragmentShader: COMPOSITE_FRAGMENT,
      uniforms: { V: { value: this.target.texture as Texture }, uRes: { value: new Vector2(1, 1) } },
      transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true, blending: NormalBlending,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quad.renderOrder = 5;
    host.add(this.quad);
  }

  /** Redraws the march when the view, the field or the span changed since the last call; the quad keeps showing the last result otherwise. */
  update(renderer: WebGLRenderer, runner: PassRunner, camera: PerspectiveCamera, scene: FlowScene, fields: { velocity: Texture; temperature: Texture; mask: Texture; tx: number }, spanK: number, fieldVersion: number) {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(2, Math.round(this.size.x * VOLUME_SCALE));
    const h = Math.max(2, Math.round(this.size.y * VOLUME_SCALE));
    (this.composite.uniforms.uRes.value as Vector2).copy(this.size);
    camera.updateMatrixWorld();
    this.host.updateWorldMatrix(true, false);
    this.invMV.copy(camera.matrixWorldInverse).multiply(this.host.matrixWorld).invert();
    this.invProj.copy(camera.projectionMatrix).invert();
    const key = [...this.invMV.elements, ...this.invProj.elements, w, h, Math.round(spanK * 10), fieldVersion].join(',');
    if (key === this.key) return;
    this.key = key;
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    const u = this.march.uniforms;
    (u.uRes.value as Vector2).set(w, h);
    (u.uN.value as Vector3).set(...scene.dims);
    u.uTX.value = fields.tx;
    u.M.value = fields.mask;
    u.U.value = fields.velocity;
    u.T.value = fields.temperature;
    u.uCell.value = scene.cellMm;
    (u.uOrigin.value as Vector3).set(...scene.origin);
    u.uHeatSpan.value = spanK;
    (u.uCaseLo.value as Vector3).set(...scene.caseMin).multiplyScalar(scene.cellMm);
    (u.uCaseHi.value as Vector3).set(...scene.caseMax).addScalar(1).multiplyScalar(scene.cellMm);
    runner.run(this.march, this.target);
  }

  dispose() {
    this.host.remove(this.quad);
    this.quad.geometry.dispose();
    this.composite.dispose();
    this.march.dispose();
    this.target.dispose();
  }
}
