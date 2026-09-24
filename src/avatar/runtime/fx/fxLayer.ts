/**
 * Soft particle layer for clip-scheduled effects (hearts, sparkles, notes,
 * sleepy z's, petals). Sprites live under a root that mirrors the character
 * root, so event coordinates in model scene space land on the character.
 * Rendered over the finished frame without depth testing: every authored
 * effect sits in front of the character.
 */

import * as THREE from 'three';
import type { BurstEvent, FxEvent, FxKind, PathEvent, PopEvent, StreamEvent, Vec3 } from './clipEvents';

const TEXTURE_PX = 128;
/** Seconds a particle takes to fade in; fade-out spans the last FADE_OUT_FRACTION of its life. */
const FADE_IN_S = 0.12;
const FADE_OUT_FRACTION = 0.35;
/** Pop-in time (seconds) and overshoot of the pop scale curve. */
const POP_IN_S = 0.28;
const POP_OVERSHOOT = 1.7;
/** Seconds a path particle fades over before its last sample. */
const PATH_FADE_S = 0.6;

type Draw = (ctx: CanvasRenderingContext2D, s: number) => void;

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number): void {
  const h = w * 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, cy + h * 0.42);
  ctx.bezierCurveTo(cx - w * 0.62, cy - h * 0.02, cx - w * 0.42, cy - h * 0.6, cx, cy - h * 0.26);
  ctx.bezierCurveTo(cx + w * 0.42, cy - h * 0.6, cx + w * 0.62, cy - h * 0.02, cx, cy + h * 0.42);
  ctx.closePath();
}

const DRAW: Record<FxKind, Draw> = {
  heart(ctx, s) {
    heartPath(ctx, s / 2, s / 2, s * 0.86);
    const g = ctx.createLinearGradient(0, s * 0.1, 0, s * 0.9);
    g.addColorStop(0, '#ffa9c9');
    g.addColorStop(1, '#ff5f98');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = s * 0.05;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(s * 0.34, s * 0.34, s * 0.09, s * 0.05, -0.7, 0, Math.PI * 2);
    ctx.fill();
  },
  sparkle(ctx, s) {
    const c = s / 2;
    const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.25, 'rgba(255,214,236,0.7)');
    glow.addColorStop(1, 'rgba(255,190,225,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 === 0 ? c * 0.9 : c * 0.16;
      ctx.lineTo(c + Math.sin(a) * r, c - Math.cos(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  },
  note(ctx, s) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const draw = () => {
      ctx.beginPath();
      ctx.ellipse(s * 0.36, s * 0.72, s * 0.15, s * 0.11, -0.45, 0, Math.PI * 2);
      ctx.moveTo(s * 0.49, s * 0.7);
      ctx.lineTo(s * 0.49, s * 0.16);
      ctx.bezierCurveTo(s * 0.62, s * 0.26, s * 0.78, s * 0.3, s * 0.72, s * 0.5);
    };
    draw();
    ctx.lineWidth = s * 0.14;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    draw();
    ctx.fillStyle = '#b48cf2';
    ctx.fill();
    ctx.lineWidth = s * 0.06;
    ctx.strokeStyle = '#b48cf2';
    ctx.stroke();
  },
  z(ctx, s) {
    ctx.font = `bold ${Math.round(s * 0.78)}px "Arial Rounded MT Bold", "Nunito", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = s * 0.12;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText('z', s / 2, s * 0.54);
    ctx.fillStyle = '#9d86e9';
    ctx.fillText('z', s / 2, s * 0.54);
  },
  petal(ctx, s) {
    const c = s / 2;
    ctx.beginPath();
    ctx.moveTo(c, s * 0.9);
    ctx.bezierCurveTo(c - s * 0.42, s * 0.62, c - s * 0.3, s * 0.12, c - s * 0.08, s * 0.14);
    ctx.lineTo(c, s * 0.24);
    ctx.lineTo(c + s * 0.08, s * 0.14);
    ctx.bezierCurveTo(c + s * 0.3, s * 0.12, c + s * 0.42, s * 0.62, c, s * 0.9);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, s * 0.9, 0, s * 0.1);
    g.addColorStop(0, '#ffc6da');
    g.addColorStop(1, '#ffe8f1');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = s * 0.03;
    ctx.strokeStyle = 'rgba(240,150,185,0.8)';
    ctx.stroke();
  },
};

function makeTexture(kind: FxKind): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_PX;
  canvas.height = TEXTURE_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) DRAW[kind](ctx, TEXTURE_PX);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Deterministic PRNG (mulberry32) so recorded frames repeat exactly. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const v3 = (a: Vec3 | undefined, fallback: Vec3 = [0, 0, 0]): THREE.Vector3 => new THREE.Vector3(...(a ?? fallback));

interface Particle {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  size: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  drag: number;
  grow: number;
  spin: number;
  sway: number;
  swayAxis: THREE.Vector3;
  swayPhase: number;
  pop: boolean;
  rise: number;
  up: THREE.Vector3;
  path: PathEvent | null;
}

interface Emitter {
  event: StreamEvent;
  age: number;
  carry: number;
  random: () => number;
  bone: THREE.Object3D | null;
}

export class FxLayer {
  readonly scene = new THREE.Scene();
  private readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly textures = new Map<FxKind, THREE.Texture>();
  private readonly particles: Particle[] = [];
  private readonly emitters: Emitter[] = [];
  private readonly toModel = new THREE.Matrix4();
  private readonly scratch = new THREE.Vector3();

  constructor(model: THREE.Object3D) {
    this.model = model;
    this.root.matrixAutoUpdate = false;
    this.scene.add(this.root);
  }

  get active(): boolean {
    return this.particles.length > 0 || this.emitters.length > 0;
  }

  spawn(event: FxEvent): void {
    const random = rng(event.seed ?? Math.round(event.t * 1000) + 1);
    switch (event.type) {
      case 'pop':
        this.addPop(event);
        break;
      case 'burst':
        this.addBurst(event, random);
        break;
      case 'stream':
        this.emitters.push({ event, age: 0, carry: 1, random, bone: event.bone ? this.findBone(event.bone) : null });
        break;
      case 'path':
        this.addParticle(event.kind, event.size, v3([event.pos[0], event.pos[1], event.pos[2]]), 1e9, { path: event });
        break;
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    this.model.updateMatrixWorld();
    this.root.matrix.copy(this.model.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
    this.toModel.copy(this.model.matrixWorld).invert();

    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const em = this.emitters[i];
      em.age += dt;
      em.carry += dt * em.event.rate;
      while (em.carry >= 1 && em.age <= em.event.duration) {
        em.carry -= 1;
        this.emitFrom(em);
      }
      if (em.age > em.event.duration) this.emitters.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.path) this.followPath(p);
      if (p.age >= p.life) {
        this.root.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      this.stepParticle(p, dt);
    }
  }

  dispose(): void {
    for (const p of this.particles) p.sprite.material.dispose();
    this.particles.length = 0;
    this.emitters.length = 0;
    for (const tex of this.textures.values()) tex.dispose();
    this.textures.clear();
  }

  private texture(kind: FxKind): THREE.Texture {
    let tex = this.textures.get(kind);
    if (!tex) {
      tex = makeTexture(kind);
      this.textures.set(kind, tex);
    }
    return tex;
  }

  private findBone(name: string): THREE.Object3D | null {
    return this.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ?? this.model.getObjectByName(name) ?? null;
  }

  private addParticle(kind: FxKind, size: number, pos: THREE.Vector3, life: number, extra: Partial<Particle> = {}): Particle {
    const material = new THREE.SpriteMaterial({
      map: this.texture(kind),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: kind === 'sparkle' ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(size);
    sprite.position.copy(pos);
    this.root.add(sprite);
    const p: Particle = {
      sprite, age: 0, life, size, pos: pos.clone(), vel: new THREE.Vector3(), drag: 0, grow: 1, spin: 0,
      sway: 0, swayAxis: new THREE.Vector3(1, 0, 0), swayPhase: 0, pop: false, rise: 0, up: new THREE.Vector3(0, 1, 0), path: null,
      ...extra,
    };
    this.particles.push(p);
    return p;
  }

  private addPop(e: PopEvent): void {
    this.addParticle(e.kind, e.size, v3(e.at), e.life, { pop: true, rise: e.rise, up: v3(e.up, [0, 1, 0]).normalize() });
  }

  private addBurst(e: BurstEvent, random: () => number): void {
    const [a, b] = e.axes.map((x) => v3(x).normalize());
    for (let i = 0; i < e.count; i++) {
      const ang = ((i + random() * 0.6) / e.count) * Math.PI * 2;
      const speed = e.speed * (0.75 + random() * 0.5);
      const vel = a.clone().multiplyScalar(Math.cos(ang) * speed).addScaledVector(b, Math.sin(ang) * speed);
      this.addParticle(e.kind, e.size * (0.8 + random() * 0.4), v3(e.at), e.life * (0.85 + random() * 0.3), {
        vel, drag: e.drag ?? 2.5, pop: true, spin: (random() - 0.5) * 2,
      });
    }
  }

  private emitFrom(em: Emitter): void {
    const e = em.event;
    const r = em.random;
    const pos = new THREE.Vector3();
    if (em.bone) {
      em.bone.getWorldPosition(pos);
      if (e.boneTip) {
        const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(em.bone.getWorldQuaternion(new THREE.Quaternion()));
        pos.addScaledVector(dir, e.boneTip);
      }
      pos.applyMatrix4(this.toModel);
    } else {
      pos.copy(v3(e.at));
    }
    pos.add(v3(e.offset));
    if (e.box && e.boxAxes) {
      for (let i = 0; i < 3; i++) pos.addScaledVector(v3(e.boxAxes[i]).normalize(), (r() * 2 - 1) * e.box[i]);
    }
    this.addParticle(e.kind, e.size * (0.85 + r() * 0.3), pos, e.life * (0.85 + r() * 0.3), {
      vel: v3(e.velocity).multiplyScalar(0.8 + r() * 0.4),
      drag: 0,
      grow: e.grow ?? 1,
      spin: (e.spin ?? 0) * (r() < 0.5 ? -1 : 1),
      sway: e.sway ?? 0,
      swayAxis: v3(e.swayAxis, [1, 0, 0]).normalize(),
      swayPhase: r() * Math.PI * 2,
    });
  }

  private followPath(p: Particle): void {
    const e = p.path as PathEvent;
    const { times } = e;
    const last = times.length - 1;
    if (p.age >= times[last]) {
      p.life = p.age;
      return;
    }
    let i = 0;
    while (i < last - 1 && times[i + 1] <= p.age) i++;
    const f = Math.min(1, Math.max(0, (p.age - times[i]) / (times[i + 1] - times[i] || 1)));
    p.pos.set(
      e.pos[i * 3] + (e.pos[i * 3 + 3] - e.pos[i * 3]) * f,
      e.pos[i * 3 + 1] + (e.pos[i * 3 + 4] - e.pos[i * 3 + 1]) * f,
      e.pos[i * 3 + 2] + (e.pos[i * 3 + 5] - e.pos[i * 3 + 2]) * f,
    );
    p.sprite.material.rotation = e.roll[i] + (e.roll[i + 1] - e.roll[i]) * f;
  }

  private stepParticle(p: Particle, dt: number): void {
    const mat = p.sprite.material;
    const x = p.age / p.life;
    if (!p.path) {
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      mat.rotation += p.spin * dt;
    }
    this.scratch.copy(p.pos);
    if (p.sway) this.scratch.addScaledVector(p.swayAxis, p.sway * Math.sin(p.age * 2.4 + p.swayPhase));
    if (p.rise) this.scratch.addScaledVector(p.up, p.rise * (1 - (1 - x) * (1 - x)));
    p.sprite.position.copy(this.scratch);

    let scale = p.size * (1 + (p.grow - 1) * x);
    if (p.pop) {
      const k = Math.min(1, p.age / POP_IN_S) - 1;
      scale *= 1 + (POP_OVERSHOOT + 1) * k * k * k + POP_OVERSHOOT * k * k;
    }
    p.sprite.scale.setScalar(Math.max(0, scale));
    const fadeOut = p.path
      ? Math.min(1, (p.path.times[p.path.times.length - 1] - p.age) / PATH_FADE_S)
      : Math.min(1, (1 - x) / FADE_OUT_FRACTION);
    mat.opacity = Math.min(1, p.age / FADE_IN_S) * fadeOut;
  }
}
