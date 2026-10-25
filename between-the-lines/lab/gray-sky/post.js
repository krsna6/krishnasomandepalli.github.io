// The finishing pass the studies share: the scene is rendered in linear light to a float buffer, then
// bloom (a bright pass, blurred at quarter size), filmic tone mapping (ACES), a grade, a vignette and a
// fine moving film grain are laid on in one pass. Small and hand-rolled, so nothing else is loaded.
import * as THREE from "./three.module.min.js";

const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

export function createPost(renderer, { bloom = 0.9, threshold = 0.8, grain = 0.06, vignette = 0.55, exposure = 1.0, tint = [1.0, 0.98, 0.95] } = {}) {
  const half = THREE.HalfFloatType;
  const rt = (w, h, samples = 0) => new THREE.WebGLRenderTarget(w, h, { type: half, samples, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  let scene = rt(2, 2, 4), a = rt(2, 2), b = rt(2, 2);
  a.depthBuffer = b.depthBuffer = false;

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quadScene.add(quad);
  const run = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, cam); };

  const bright = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, threshold: { value: threshold } }, vertexShader: VS,
    fragmentShader: `uniform sampler2D t; uniform float threshold; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(threshold, threshold * 2.0, l), 1.0); }`,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: VS,
    fragmentShader: `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(t, vUv).rgb * 0.227;
        c += (texture2D(t, vUv + dir * 1.385).rgb + texture2D(t, vUv - dir * 1.385).rgb) * 0.316;
        c += (texture2D(t, vUv + dir * 3.231).rgb + texture2D(t, vUv - dir * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const final = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, bl: { value: null }, bloom: { value: bloom }, grain: { value: grain }, vignette: { value: vignette },
      exposure: { value: exposure }, tint: { value: new THREE.Vector3(...tint) }, time: { value: 0 }, aspect: { value: 1 } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D t, bl; uniform float bloom, grain, vignette, exposure, time, aspect; uniform vec3 tint; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(t, vUv).rgb + texture2D(bl, vUv).rgb * bloom;
        c = aces(c * exposure) * tint;
        vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
        c *= 1.0 - vignette * smoothstep(0.35, 1.1, length(q) / max(1.0, aspect) * 1.6);
        c = pow(c, vec3(1.0 / 2.2));
        c += (hash(vUv * 1024.0 + fract(time * 7.13)) - 0.5) * grain;
        gl_FragColor = vec4(c, 1.0); }`,
  });

  let W = 2, H = 2;
  return {
    setSize(w, h) {
      const dpr = renderer.getPixelRatio();
      W = Math.max(2, Math.round(w * dpr)); H = Math.max(2, Math.round(h * dpr));
      scene.setSize(W, H);
      const qw = Math.max(2, W >> 2), qh = Math.max(2, H >> 2);
      a.setSize(qw, qh); b.setSize(qw, qh);
      final.uniforms.aspect.value = w / h;
    },
    render(sceneObj, camera, time) {
      renderer.setRenderTarget(scene);
      renderer.render(sceneObj, camera);
      bright.uniforms.t.value = scene.texture; run(bright, a);
      for (let i = 0; i < 2; i++) {
        blur.uniforms.t.value = a.texture; blur.uniforms.dir.value.set((1 + i) / a.width, 0); run(blur, b);
        blur.uniforms.t.value = b.texture; blur.uniforms.dir.value.set(0, (1 + i) / a.height); run(blur, a);
      }
      final.uniforms.t.value = scene.texture; final.uniforms.bl.value = a.texture; final.uniforms.time.value = time;
      run(final, null);
    },
    uniforms: final.uniforms,
  };
}
