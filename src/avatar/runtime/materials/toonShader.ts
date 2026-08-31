/**
 * GLSL + tuning constants for the clean-room TCP2 "Hybrid Shader 2" port
 * (active feature subset only; implemented from the pack spec, not TCP2 code).
 *
 * The strings below are injected into MeshToonMaterial's fragment shader via
 * onBeforeCompile in toonMaterial.ts. The vertex shader is never touched, so
 * the built-in skinning / morph-target / instancing chunks stay intact.
 *
 * Feature defines (set per material in toonMaterial.ts, so three's program
 * cache key separates combos automatically):
 * - NEXUS_TOON_FRESNEL             params.useFresnelReflections
 * - NEXUS_TOON_SHADOW_LIGHT_COLOR  params.shadowColorFromLight
 * - NEXUS_TOON_DISSOLVE            a dissolve texture is bound
 * Tuning defines (numeric, from TOON_TUNING at material-creation time):
 * - NEXUS_TOON_RAMP_SCALE / NEXUS_TOON_RAMP_OFFSET / NEXUS_TOON_AMBIENT_SCALE
 * - NEXUS_TOON_FRESNEL_SCALE (only with NEXUS_TOON_FRESNEL)
 */

/** Bump when the injected GLSL changes; feeds customProgramCacheKey. */
export const TOON_SHADER_VERSION = 'nexus-toon-3';

/**
 * A/B-tunable constants, read when a material is created (they land in the
 * material's defines; to retune a live material re-stamp its defines and set
 * material.needsUpdate = true).
 *
 * rampNdlScale/rampNdlOffset define the ramp domain remap:
 *   t = NdotL * rampNdlScale + rampNdlOffset
 * 0.5 / 0.5 is TCP2's default half-Lambert-style domain; the later A/B pass
 * against Unity screenshots tunes these.
 */
export const TOON_TUNING = {
  rampNdlScale: 0.5,
  rampNdlOffset: 0.5,
  /**
   * Unity-style ambient is irradiance * albedo (no 1/PI); 1.0 = that. Toned
   * down for the two-tone look: full ambient stacked on the full direct term
   * clips lit skin toward white and makes the shade band read harsh.
   */
  ambientIntensity: 0.45,
  /** Scales the additive fresnel rim (TCP2 fresnel indirect reflections). */
  fresnelIntensity: 0.1,
  /**
   * Two-tone softening: the shade tone is the material's shadowColor lifted
   * toward white by this amount, so shadow regions stay warm instead of dark.
   */
  shadeLift: 0.33,
  /** Floor on the band smoothing so authored razor edges stay soft. */
  minRampSmoothing: 0.12,
  /**
   * Bypasses lighting entirely: fragments output flat albedo (+ emissive).
   * Set before materials are created (it lands in defines at creation).
   */
  unlit: false,
};

/** GLSL float literal (guarantees a decimal point so int contexts can't bind). */
export function glslFloat(value: number): string {
  const s = String(value);
  return /[.e]/i.test(s) ? s : `${s}.0`;
}

/**
 * Replaces #include <lights_toon_pars_fragment>. Must keep the ToonMaterial
 * struct shape and the vViewPosition varying: the untouched
 * lights_toon_fragment chunk and lights_fragment_begin/end drive it.
 */
export const TOON_LIGHTING_PARS = /* glsl */ `
varying vec3 vViewPosition;

uniform vec3 toonShadowColor;
uniform float toonRampThreshold;
uniform float toonRampSmoothing;

#ifdef NEXUS_TOON_FRESNEL
	uniform float toonFresnelMin;
	uniform float toonFresnelMax;
#endif

#ifdef NEXUS_TOON_DISSOLVE
	uniform sampler2D toonDissolveMap;
	uniform float toonDissolveValue;
#endif

struct ToonMaterial {

	vec3 diffuseColor;

};

void RE_Direct_NexusToon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {

	#ifdef NEXUS_TOON_UNLIT
		return; // RE_IndirectDiffuse carries the flat albedo once
	#endif

	// TCP2 banded ramp over the remapped N.L (remap constants in TOON_TUNING).
	float t = dot( geometryNormal, directLight.direction ) * NEXUS_TOON_RAMP_SCALE + NEXUS_TOON_RAMP_OFFSET;
	float smoothing = max( toonRampSmoothing, NEXUS_TOON_MIN_SMOOTH );
	float band = smoothstep( toonRampThreshold - smoothing * 0.5, toonRampThreshold + smoothing * 0.5, t );

	// Unity URP semantics: no 1/PI on the direct term. Two-tone: the shade
	// tone is shadowColor lifted toward white (soft, never crushed).
	vec3 lit = material.diffuseColor * directLight.color;
	vec3 shadowed = material.diffuseColor * mix( toonShadowColor, vec3( 1.0 ), NEXUS_TOON_SHADE_LIFT );

	#ifdef NEXUS_TOON_SHADOW_LIGHT_COLOR
		shadowed *= directLight.color;
	#endif

	reflectedLight.directDiffuse += mix( shadowed, lit, band );

}

void RE_IndirectDiffuse_NexusToon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {

	#ifdef NEXUS_TOON_UNLIT
		reflectedLight.indirectDiffuse += material.diffuseColor;
		return;
	#endif

	// irradiance = ambient + hemisphere lights (three accumulates them in
	// lights_fragment_begin); Unity-style flat/trilight ambient, no 1/PI.
	reflectedLight.indirectDiffuse += irradiance * material.diffuseColor * NEXUS_TOON_AMBIENT_SCALE;

	#ifdef NEXUS_TOON_FRESNEL
		// Additive rim standing in for TCP2 fresnel indirect reflections,
		// tinted by the ambient irradiance (the closest thing to an env probe).
		float fres = smoothstep( toonFresnelMin, toonFresnelMax, 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ) );
		reflectedLight.indirectDiffuse += irradiance * fres * NEXUS_TOON_FRESNEL_SCALE;
	#endif

}

#define RE_Direct				RE_Direct_NexusToon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_NexusToon
`;

/**
 * Appended after #include <alphatest_fragment>. Strict < keeps
 * dissolveValue 0 fully visible (no discard, no visual effect).
 */
export const TOON_DISSOLVE_FRAGMENT = /* glsl */ `
#ifdef NEXUS_TOON_DISSOLVE

	if ( texture2D( toonDissolveMap, vUv ).r < toonDissolveValue ) discard;

#endif
`;
