/* AURA: Genesis 2 — post3d.js
 * The look of the 3D close-up: the scene is drawn into an off-screen image with its depth, then
 * finished in one full-screen pass:
 *  - ink outlines where the depth bends or jumps (inverse depth is linear across any flat face,
 *    so its second difference finds silhouettes and creases: the voxel steps, roof ridges, the
 *    edges of trees and creatures), drawn as a darker shade of the colour beneath, fading with
 *    distance so far forests stay clean;
 *  - a tilt-shift depth of field that keeps sharp whatever is at the centre of the screen and
 *    softens what is nearer and farther, for the look of a living miniature;
 *  - bloom on what is brighter than the rest (lava, fire, lit windows at night, sunlit snow);
 *  - colour grading: saturation, contrast, warm light and cool shadows, a soft vignette;
 *  - FXAA to smooth the edges (the off-screen image has no multisampling).
 * The Pixel look draws the scene at a third of the resolution and shows it with hard pixels, a
 * one-pixel outline and fewer colour levels, to match the pixel-art map and interface.
 * Bloom and depth of field are worked at a quarter of the resolution (6 small blur passes), so the
 * whole finish costs about one extra full-screen pass. */
'use strict';
(function () {
  const AG = window.AG, THREE = window.THREE;
  // The looks. ink: outline strength; inkDark: how dark the line is against the colour beneath;
  // bloom, dof: strengths; sat, contrast, split (warm light / cool shadow), vig: grading; pixel:
  // size of a pixel (0 = full resolution); poster: colour levels per channel (0 = all);
  // tex: how strongly surfaces show their textures; rim: rim light on models.
  const LOOKS = {
    stylized: { post: true, ink: 1, inkDark: 0.34, bloom: 0.6, dof: 0.75, sat: 1.17, contrast: 1.1, split: 1, vig: 0.34, pixel: 0, poster: 0, tex: 0.6, rim: 0.42 },
    pixel: { post: true, ink: 1, inkDark: 0.3, bloom: 0.3, dof: 0, sat: 1.26, contrast: 1.08, split: 0.9, vig: 0.22, pixel: 3, poster: 22, tex: 0.4, rim: 0.32 },
    realistic: { post: true, ink: 0, inkDark: 1, bloom: 0.4, dof: 0.5, sat: 1.06, contrast: 1.05, split: 0.45, vig: 0.24, pixel: 0, poster: 0, tex: 1, rim: 0.1 },
    classic: { post: false, ink: 0, inkDark: 1, bloom: 0, dof: 0, sat: 1, contrast: 1, split: 0, vig: 0, pixel: 0, poster: 0, tex: 1, rim: 0 },
  };
  const P = (AG.Post3D = { ok: false, look: 'stylized', LOOKS, stats: { ms: 0 } });
  let renderer = null, rtScene = null, rtA = null, rtB = null, rtC = null, rtD = null, quad = null, qScene = null, qCam = null;
  let mBright = null, mDown = null, mBlur = null, mFinal = null;
  const size = { w: 0, h: 0, px: 0 };

  const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  // quarter-size downsample (4 taps), optionally keeping only what is bright
  const FS_DOWN = (bright) => `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
  ${bright ? 'float l = max(c.r, max(c.g, c.b)); c *= smoothstep(uThresh, uThresh + 0.22, l);' : ''}
  gl_FragColor = vec4(c, 1.0);
}`;
  // separable 9-tap Gaussian (5 linear fetches)
  const FS_BLUR = `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;
  const FS_FINAL = `
uniform sampler2D tColor; uniform highp sampler2D tDepth; uniform sampler2D tBloom; uniform sampler2D tBlur;
uniform vec2 uTexel; uniform float uNear, uFar, uInk, uInkDark, uInkW, uBloom, uDof, uSat, uContrast, uSplit, uVig, uPoster, uFxaa, uNight;
varying vec2 vUv;
float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 fxaa(vec2 uv) {
  vec3 m = texture2D(tColor, uv).rgb;
  if (uFxaa < 0.5) return m;
  vec3 nw = texture2D(tColor, uv + vec2(-1.0, -1.0) * uTexel).rgb, ne = texture2D(tColor, uv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 sw = texture2D(tColor, uv + vec2(-1.0, 1.0) * uTexel).rgb, se = texture2D(tColor, uv + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 W = vec3(0.299, 0.587, 0.114);
  float lnw = dot(nw, W), lne = dot(ne, W), lsw = dot(sw, W), lse = dot(se, W), lm = dot(m, W);
  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float red = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125), rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture2D(tColor, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, uv - dir * 0.5).rgb + texture2D(tColor, uv + dir * 0.5).rgb);
  float lb = dot(b, W);
  return (lb < lmin || lb > lmax) ? a : b;
}
void main() {
  vec2 uv = vUv;
  vec3 col = fxaa(uv);
  float z = linZ(texture2D(tDepth, uv).x), zf = linZ(texture2D(tDepth, vec2(0.5)).x); // (zf: what is at the centre)
  if (uInk > 0.0) {
    vec2 o = uTexel * uInkW;
    float wc = 1.0 / z;
    float wl = 1.0 / linZ(texture2D(tDepth, uv - vec2(o.x, 0.0)).x), wr = 1.0 / linZ(texture2D(tDepth, uv + vec2(o.x, 0.0)).x);
    float wd = 1.0 / linZ(texture2D(tDepth, uv - vec2(0.0, o.y)).x), wu = 1.0 / linZ(texture2D(tDepth, uv + vec2(0.0, o.y)).x);
    float bend = (abs(wl + wr - 2.0 * wc) + abs(wd + wu - 2.0 * wc)) / wc;
    float edge = smoothstep(0.012, 0.045, bend) * (1.0 - smoothstep(zf * 1.7, zf * 4.0, z)) * uInk;
    col = mix(col, col * uInkDark, edge);
  }
  if (uDof > 0.0) { // tilt-shift: sharp at the focus, soft before and behind it
    float blur = smoothstep(0.18, 1.0, abs(z - zf) / (zf * 0.6)) * uDof;
    col = mix(col, texture2D(tBlur, uv).rgb, blur);
  }
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col *= mix(vec3(1.0), mix(vec3(0.92, 0.98, 1.08), vec3(1.07, 1.0, 0.9), smoothstep(0.15, 0.85, l)), uSplit); // cool shadows, warm light
  col = mix(col, col * vec3(0.8, 0.92, 1.4) + vec3(0.012, 0.024, 0.06), uNight * 0.85 * uSplit); // moonlight
  col += texture2D(tBloom, uv).rgb * uBloom; // (after the grading: firelight stays warm in a blue night)
  col = mix(col, 0.8 + 0.2 * (1.0 - exp(-(col - 0.8) * 5.0)), step(vec3(0.8), col)); // highlights roll off instead of clipping
  vec2 q = vUv - 0.5;
  col *= 1.0 - uVig * dot(q, q) * 1.7;
  if (uPoster > 0.0) col = floor(col * uPoster + 0.5) / uPoster;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  function target(w, h, depth, nearest) {
    const t = new THREE.WebGLRenderTarget(w, h, {
      minFilter: nearest ? THREE.NearestFilter : THREE.LinearFilter, magFilter: nearest ? THREE.NearestFilter : THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: !!depth, stencilBuffer: false,
    });
    t.texture.generateMipmaps = false;
    if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.UnsignedIntType; }
    return t;
  }
  const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });

  P.setup = function (r) {
    if (!THREE || !r) return false;
    try {
      renderer = r;
      const gl = r.getContext();
      if (!r.capabilities.isWebGL2 && !r.extensions.get('WEBGL_depth_texture')) return false;
      qScene = new THREE.Scene(); qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); quad.frustumCulled = false; qScene.add(quad);
      mBright = mat(FS_DOWN(true), { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0.75 } });
      mDown = mat(FS_DOWN(false), { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0 } });
      mBlur = mat(FS_BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
      mFinal = mat(FS_FINAL, {
        tColor: { value: null }, tDepth: { value: null }, tBloom: { value: null }, tBlur: { value: null }, uTexel: { value: new THREE.Vector2() },
        uNear: { value: 1 }, uFar: { value: 100 }, uInk: { value: 1 }, uInkDark: { value: 0.34 }, uInkW: { value: 1 }, uBloom: { value: 0.5 }, uDof: { value: 0.8 },
        uSat: { value: 1.2 }, uContrast: { value: 1.1 }, uSplit: { value: 1 }, uVig: { value: 0.3 }, uPoster: { value: 0 }, uFxaa: { value: 1 }, uNight: { value: 0 },
      });
      P.ok = !!gl;
      return P.ok;
    } catch (e) { P.ok = false; return false; }
  };
  P.setLook = function (name) { P.look = LOOKS[name] ? name : 'stylized'; return LOOKS[P.look]; };
  P.params = () => LOOKS[P.look];
  // (re)size the off-screen images to the drawing buffer (a third of it in the Pixel look)
  const dbs = THREE ? new THREE.Vector2() : null;
  function fit(px) {
    renderer.getDrawingBufferSize(dbs);
    const dpr = renderer.getPixelRatio(), cell = px ? Math.max(1, Math.round(px * dpr)) : 1;
    const w = Math.max(1, Math.floor(dbs.x / cell)), h = Math.max(1, Math.floor(dbs.y / cell));
    if (w === size.w && h === size.h && px === size.px && rtScene) return;
    for (const t of [rtScene, rtA, rtB, rtC, rtD]) if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); }
    size.w = w; size.h = h; size.px = px;
    rtScene = target(w, h, true, !!px);
    const qw = Math.max(1, Math.ceil(w / 4)), qh = Math.max(1, Math.ceil(h / 4));
    rtA = target(qw, qh); rtB = target(qw, qh); rtC = target(qw, qh); rtD = target(qw, qh);
  }
  function pass(m, out) { quad.material = m; renderer.setRenderTarget(out); renderer.render(qScene, qCam); }
  // Draw the scene with the finish. o: { level (3D detail 0-3), night (0-1) }. Returns false when the
  // look draws the scene plainly (the caller renders it itself).
  P.render = function (scene, camera, o) {
    const L = LOOKS[P.look];
    if (!P.ok || !L.post || (o.level >= 3 && !L.pixel)) return false;
    const t0 = performance.now(), lean = o.level >= 2;
    fit(L.pixel);
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    P.stats.triangles = renderer.info.render.triangles; P.stats.calls = renderer.info.render.calls;
    const bloom = lean ? 0 : L.bloom * (0.35 + 0.85 * o.night), dof = lean ? 0 : L.dof;
    const qx = 1 / rtA.width, qy = 1 / rtA.height;
    if (bloom > 0) {
      mBright.uniforms.tSrc.value = rtScene.texture; mBright.uniforms.uTexel.value.set(1 / size.w, 1 / size.h); mBright.uniforms.uThresh.value = 0.93 - 0.33 * o.night; // by day only the brightest glints; at night every lamp
      pass(mBright, rtA);
      mBlur.uniforms.tSrc.value = rtA.texture; mBlur.uniforms.uDir.value.set(qx * 1.5, 0); pass(mBlur, rtB);
      mBlur.uniforms.tSrc.value = rtB.texture; mBlur.uniforms.uDir.value.set(0, qy * 1.5); pass(mBlur, rtA);
    }
    if (dof > 0) {
      mDown.uniforms.tSrc.value = rtScene.texture; mDown.uniforms.uTexel.value.set(1 / size.w, 1 / size.h);
      pass(mDown, rtC);
      mBlur.uniforms.tSrc.value = rtC.texture; mBlur.uniforms.uDir.value.set(qx, 0); pass(mBlur, rtD);
      mBlur.uniforms.tSrc.value = rtD.texture; mBlur.uniforms.uDir.value.set(0, qy); pass(mBlur, rtC);
    }
    const u = mFinal.uniforms;
    u.tColor.value = rtScene.texture; u.tDepth.value = rtScene.depthTexture; u.tBloom.value = rtA.texture; u.tBlur.value = rtC.texture;
    u.uTexel.value.set(1 / size.w, 1 / size.h); u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uInk.value = L.ink; u.uInkDark.value = L.inkDark; u.uInkW.value = L.pixel ? 1 : Math.max(1, renderer.getPixelRatio() * 0.75);
    u.uBloom.value = bloom; u.uDof.value = dof; u.uSat.value = L.sat; u.uContrast.value = L.contrast; u.uSplit.value = L.split; u.uVig.value = L.vig;
    u.uPoster.value = L.poster; u.uFxaa.value = L.pixel ? 0 : 1; u.uNight.value = o.night;
    pass(mFinal, null);
    P.stats.ms = P.stats.ms * 0.9 + (performance.now() - t0) * 0.1;
    return true;
  };
  // compile every pass now (behind the loading screen)
  P.prewarm = function (scene, camera) {
    if (!P.ok) return;
    const keep = P.look;
    for (const look of ['stylized', 'pixel']) { P.look = look; P.render(scene, camera, { level: 0, night: 0.5 }); }
    P.look = keep;
    renderer.setRenderTarget(null);
  };
})();
