// Materiais estilizados: sombreamento "cel" suave em poucas faixas e contorno discreto.
import * as THREE from 'three';

let _grad = null;
export function gradiente() {
  if (_grad) return _grad;
  const tons = new Uint8Array([95, 150, 205, 255]);
  _grad = new THREE.DataTexture(tons, tons.length, 1, THREE.RedFormat);
  _grad.minFilter = THREE.NearestFilter;
  _grad.magFilter = THREE.NearestFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}

export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradiente(), ...extra });

// contorno por "casco invertido": a mesma geometria, inflada pela normal e desenhada por trás
const contornoMat = new THREE.ShaderMaterial({
  uniforms: { uCor: { value: new THREE.Color('#231d2e') }, uW: { value: 0.011 } },
  vertexShader: /* glsl */ `
    uniform float uW;
    void main() {
      vec3 p = position + normalize(normal) * uW;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uCor;
    void main() {
      gl_FragColor = vec4(uCor, 1.0);
      #include <colorspace_fragment>
    }`,
  side: THREE.BackSide,
});

export function contorno(mesh) {
  const o = new THREE.Mesh(mesh.geometry, contornoMat);
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.contorno = true;
  mesh.add(o);
  return mesh;
}
