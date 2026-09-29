// Shared shader state for the whole sea: the sonar shells, caustics, the layer
// line and the depth fog are all computed per fragment from these uniforms, so
// every lit material in the scene is patched to read them (see patch()).
import * as THREE from "three";
import { LAYER_Y } from "./constants";

export const SH = {
  uTime: { value: 0 },
  uWave: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 999, 0, 0)) },
  uWaveC: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
  uLayerY: { value: LAYER_Y },
  uLayerAtt: { value: 0.14 },
  uFogD: { value: 0.0046 },
  uCaustic: { value: 1.0 },
  uLayerLine: { value: 0.55 },
  uInterior: { value: 0 },
  uHit: { value: new THREE.Color(0, 0, 0) },
};

export const GLSL = /* glsl */ `
uniform float uTime;
uniform vec4 uWave[4];
uniform vec4 uWaveC[4];
uniform float uLayerY;
uniform float uLayerAtt;
uniform float uFogD;
uniform float uCaustic;
uniform float uLayerLine;
uniform float uInterior;
uniform vec3 uHit;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
float caustic(vec2 p, float t){
  vec2 q = p; float v = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    q += vec2(sin(q.y*1.7 + t + fi*1.3), cos(q.x*1.4 - t*0.8 + fi*2.1)) * 0.55;
    v += abs(sin(q.x*1.1 + q.y*0.7));
  }
  v /= 3.0;
  return pow(clamp(1.0 - v, 0.0, 1.0), 5.0) * 2.4;
}
vec3 abyss(vec3 dir, float y){
  float d = clamp(-y / 230.0, 0.0, 1.0);
  vec3 deep = vec3(0.0018, 0.0045, 0.0125);
  vec3 mid  = vec3(0.0055, 0.024, 0.052);
  vec3 top  = vec3(0.08, 0.25, 0.32);
  vec3 c = mix(mid, deep, smoothstep(0.0, 1.0, d));
  float up = pow(clamp(dir.y, 0.0, 1.0), 1.6);
  c = mix(c, top * mix(1.0, 0.22, d), up * 0.85);
  c *= 1.0 - 0.5 * pow(clamp(-dir.y, 0.0, 1.0), 1.2);
  return c;
}
float layerAtt(vec3 o, vec3 p){
  float oAbove = step(uLayerY, o.y);
  float pBelow = smoothstep(uLayerY + 3.0, uLayerY - 3.0, p.y);
  float crossing = oAbove * pBelow + (1.0 - oAbove) * (1.0 - pBelow);
  return mix(1.0, uLayerAtt, crossing);
}
vec3 waveGlow(vec3 p, float sharp){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++){
    vec4 c = uWaveC[i];
    if (c.a <= 0.0005) continue;
    vec4 w = uWave[i];
    float d = length(p - w.xyz) - w.w;
    float line = exp(-d*d*sharp);
    float trail = d < 0.0 ? exp(d*0.035) * 0.16 : 0.0;
    acc += c.rgb * c.a * (line + trail) * layerAtt(w.xyz, p);
  }
  return acc;
}
vec3 applyFog(vec3 col, vec3 wp, float k){
  vec3 toP = wp - cameraPosition;
  float L = length(toP);
  vec3 dir = toP / max(L, 1e-4);
  float fd = uFogD * k;
  float f = 1.0 - exp(-fd*fd*L*L);
  return mix(col, abyss(dir, cameraPosition.y + dir.y * min(L, 320.0)), f);
}
float fogKeep(vec3 wp, float k){
  float L = length(wp - cameraPosition); float fd = uFogD * k;
  return exp(-fd*fd*L*L);
}
`;

export interface PatchOpts {
  hull?: boolean;
  sand?: boolean;
  noCaustic?: boolean;
  interior?: boolean;
  hit?: boolean;
  sharp?: string;
}

// Patch a built-in lit material: sonar lines, caustics, layer line, depth fog.
export function patch<M extends THREE.Material>(mat: M, o: PatchOpts = {}): M {
  const key = "bl" + (o.hull ? "h" : "") + (o.sand ? "s" : "") + (o.noCaustic ? "n" : "") + (o.interior ? "i" : "") + (o.hit ? "k" : "") + (o.sharp || "");
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SH);
    sh.vertexShader = "varying vec3 vWorldPos;\nvarying vec3 vLocalPos;\n" + sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
      vec4 wp_ = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp_ = instanceMatrix * wp_;
      #endif
      vWorldPos = (modelMatrix * wp_).xyz;
      vLocalPos = transformed;`);
    let s = "vec3 wN_ = normalize((vec4(normal, 0.0) * viewMatrix).xyz);\n";
    if (o.hull) s += `{
      float fx = vLocalPos.x / 2.3; float sx = fract(fx); float fw = max(fwidth(fx), 1e-4) * 1.3;
      float seam = smoothstep(0.0, fw, sx) * smoothstep(1.0, 1.0 - fw, sx);
      float fy = (vLocalPos.y + 0.35) / 1.25; float sy = fract(fy); float fwy = max(fwidth(fy), 1e-4) * 1.3;
      float seamY = smoothstep(0.0, fwy, sy) * smoothstep(1.0, 1.0 - fwy, sy);
      float grime = vnoise(vec2(vLocalPos.x * 1.9 + vLocalPos.z * 0.7, vLocalPos.y * 0.2));
      float streak = smoothstep(0.55, 0.95, vnoise(vec2(vLocalPos.x * 3.1, vLocalPos.y * 0.3 + 7.0)));
      diffuseColor.rgb *= mix(0.72, 1.0, seam * seamY) * mix(0.78, 1.12, grime);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.6, 0.48), streak * 0.4 * smoothstep(2.0, -1.5, vLocalPos.y));
      diffuseColor.rgb *= mix(0.34, 1.0, smoothstep(-2.0, -0.2, vLocalPos.y));
    }\n`;
    if (o.sand) s += `diffuseColor.rgb *= 0.8 + 0.2 * sin(vWorldPos.x * 0.55 + vWorldPos.z * 0.2 + fbm(vWorldPos.xz * 0.03) * 7.0);
      diffuseColor.rgb *= 0.75 + 0.5 * fbm(vWorldPos.xz * 0.06);\n`;
    if (!o.noCaustic) s += "totalEmissiveRadiance += diffuseColor.rgb * vec3(0.5, 0.88, 1.0) * caustic(vWorldPos.xz * 0.085, uTime * 0.45) * clamp(wN_.y, 0.0, 1.0) * uCaustic * exp(vWorldPos.y / 42.0);\n";
    if (o.interior) s += "totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.34, 0.2) * uInterior;\n";
    if (o.hit) s += "{ vec3 V_ = normalize(cameraPosition - vWorldPos); float fr_ = pow(1.0 - abs(dot(wN_, V_)), 2.0); totalEmissiveRadiance += uHit * (0.1 + 1.1 * fr_); }\n";
    s += `totalEmissiveRadiance += waveGlow(vWorldPos, ${o.sharp || "0.25"});
      totalEmissiveRadiance += vec3(0.4, 0.95, 0.9) * exp(-pow(vWorldPos.y - uLayerY, 2.0) * 1.1) * uLayerLine;\n`;
    sh.fragmentShader = "varying vec3 vWorldPos;\nvarying vec3 vLocalPos;\n" + GLSL + sh.fragmentShader
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + s)
      .replace("#include <fog_fragment>", "gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vWorldPos, 1.0);");
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export const std = (color: THREE.ColorRepresentation, rough = 0.6, metal = 0.3, o: PatchOpts = {}, extra: THREE.MeshStandardMaterialParameters = {}) =>
  patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }), o);

// the plain world-position vertex shader the sea's own ShaderMaterials share
export const WORLD_VS = "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
export const WORLD_N_VS = "varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }";
