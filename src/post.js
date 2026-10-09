// Post-processing: ambient occlusion (high), colour grading and anti-aliasing.
// Low quality skips all of it and renders straight to the screen.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// gentle contrast + saturation, warm highlights, cool shadows, light vignette
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.08 },
    saturation: { value: 1.14 },
    vignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = (c - 0.5) * contrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c += vec3(0.018, 0.008, -0.012) * smoothstep(0.45, 1.0, l);   // warm highlights
      c += vec3(-0.01, 0.0, 0.016) * (1.0 - smoothstep(0.0, 0.35, l)); // cool shadows
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = 'high';
    this.composer = null;
  }

  setQuality(q) {
    this.quality = q;
    this.build();
  }

  build() {
    this.composer?.dispose();
    this.composer = null;
    if (this.quality === 'low') return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(r, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.5, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
      composer.addPass(ao);
      this.ao = ao;
    }
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
    this.composer = composer;
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** Draw the world (the first-person gun is drawn on top afterwards by the caller). */
  render() {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
  }
}
