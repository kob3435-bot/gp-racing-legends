import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// Radial speed blur + optional heat haze, in linear HDR before tone mapping.
const SpeedShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.48) }, haze: { value: 0 }, time: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; uniform vec2 center; uniform float haze; uniform float time; varying vec2 vUv;
  #ifndef SAMPLES
  #define SAMPLES 6
  #endif
  void main(){
    vec2 uv = vUv;
    if (haze > 0.0) { float m = smoothstep(0.62, 0.30, uv.y) * smoothstep(0.05, 0.25, uv.y); uv.x += sin(uv.y * 160.0 + time * 7.0) * 0.0009 * haze * m; uv.y += cos(uv.x * 120.0 + time * 5.0) * 0.0006 * haze * m; }
    vec2 dir = uv - center; float r = length(dir);
    float k = amount * smoothstep(0.12, 0.75, r);
    vec4 acc = texture2D(tDiffuse, uv);
    if (k > 0.0005) { for (int i = 1; i < SAMPLES; i++) { float t = float(i) / float(SAMPLES); acc += texture2D(tDiffuse, uv - dir * k * t); } acc /= float(SAMPLES); }
    gl_FragColor = acc;
  }`,
};
// Colour grading + vignette, after tone mapping (display-referred).
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, saturation: { value: 1.08 }, contrast: { value: 1.06 }, tint: { value: new THREE.Vector3(1.0, 1.0, 1.0) }, lift: { value: 0.0 }, flash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; uniform float saturation; uniform float contrast; uniform vec3 tint; uniform float lift; uniform float flash; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    vec3 col = c.rgb * tint;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, saturation);
    col = (col - 0.5) * contrast + 0.5 + lift;
    vec2 d = vUv - 0.5; d.x *= 1.25; float v = smoothstep(0.85, 0.25, length(d));
    col *= mix(1.0 - vignette, 1.0, v);
    col += flash;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
  }`,
};

export class Post {
  constructor(renderer) {
    this.renderer = renderer; this.composer = null; this.enabled = false; this.scale = 1; this.basePR = 1;
  }
  // (re)build passes for a preset; scene/camera can be swapped per frame via setScene
  configure(preset, scene, camera) {
    this.dispose();
    this.preset = preset; this.scene = scene; this.camera = camera;
    this.enabled = preset.q >= 1;
    if (!this.enabled) return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: preset.q >= 2 ? 4 : 0 });
    const c = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(scene, camera); c.addPass(this.renderPass);
    const bloomRes = preset.q >= 3 ? 0.75 : preset.q >= 2 ? 0.5 : 0.25;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * bloomRes, size.y * bloomRes), 0.22, 0.5, 0.88);
    this.bloomRes = bloomRes; c.addPass(this.bloom);
    if (preset.q >= 2) {
      this.speed = new ShaderPass({ ...SpeedShader, defines: { SAMPLES: preset.q >= 3 ? 10 : 6 } });
      c.addPass(this.speed);
    } else this.speed = null;
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    if (preset.q === 1) { this.fxaa = new ShaderPass(FXAAShader); c.addPass(this.fxaa); } else this.fxaa = null;
    this.composer = c;
    this.resize();
  }
  setScene(scene, camera) { this.scene = scene; this.camera = camera; if (this.renderPass) { this.renderPass.scene = scene; this.renderPass.camera = camera; } }
  resize() {
    if (!this.composer) return;
    const r = this.renderer; const pr = r.getPixelRatio(); const w = r.domElement.clientWidth || window.innerWidth, h = r.domElement.clientHeight || window.innerHeight;
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    if (this.bloom) this.bloom.resolution.set(w * pr * this.bloomRes, h * pr * this.bloomRes);
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
  // per-frame look parameters
  setLook({ speed = 0, haze = 0, time = 0, vignette = 0.32, saturation = 1.08, contrast = 1.06, tint = null, bloom = 0.32, flash = 0 } = {}) {
    if (!this.composer) return;
    if (this.speed) { const u = this.speed.material.uniforms; u.amount.value = speed; u.haze.value = this.preset.q >= 3 ? haze : 0; u.time.value = time; this.speed.enabled = speed > 0.002 || u.haze.value > 0; }
    const g = this.grade.material.uniforms; g.vignette.value = vignette; g.saturation.value = saturation; g.contrast.value = contrast; g.flash.value = flash;
    if (tint) g.tint.value.copy(tint); else g.tint.value.set(1, 1, 1);
    this.bloom.strength = bloom;
  }
  render(dt) {
    if (this.enabled && this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); for (const p of this.composer.passes) p.dispose && p.dispose(); }
    this.composer = null; this.bloom = null; this.speed = null; this.grade = null; this.fxaa = null;
  }
}

// Dynamic resolution: nudges the render scale to hold the target frame rate.
export class DynRes {
  constructor(target = 58) { this.target = target; this.scale = 1; this.acc = 0; this.frames = 0; this.cool = 0; this.min = 0.6; }
  update(dt) {
    this.acc += dt; this.frames++; this.cool -= dt;
    if (this.acc < 0.75) return null;
    const fps = this.frames / this.acc; this.acc = 0; this.frames = 0;
    if (this.cool > 0) return null;
    let s = this.scale;
    if (fps < this.target * 0.88 && s > this.min) s = Math.max(this.min, s - (fps < this.target * 0.6 ? 0.15 : 0.08));
    else if (fps > this.target * 1.08 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== this.scale) { this.scale = s; this.cool = 1.2; return s; }
    return null;
  }
}
