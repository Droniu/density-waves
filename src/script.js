import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as dat from "lil-gui";

THREE.ColorManagement.enabled = false;

/**
 * Utils
 */

function generateSingleLogNormalDistance(mu, sigma) {
  let u = Math.random();
  let logNormal = Math.exp(mu + sigma * Math.sqrt(-2 * Math.log(u)));
  let x = 1 / logNormal;
  return Math.random() < 0.5 ? x : -x; // Randomly multiply by -1
}

function randomHalfGaussian(std) {
  let standardNormal =
    Math.sqrt(-2 * Math.log(Math.random())) *
    Math.cos(2 * Math.PI * Math.random());
  return Math.abs(standardNormal * std);
}

/**
 * Base
 */
// Debug
const gui = new dat.GUI();
gui.close();

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

/**
 * Galaxy
 */
const params = {
  instantControls: false,
  count: 300000,
  size: 40,
  blending: THREE.AdditiveBlending,
  lerp: 2,
  branches: 20,
  randomness: 2,
  sigma: 1.75,
  mu: 1.0,
  insideColor: "#ff6030",
  outsideColor: "#1b3984",
};
let geometry = null;
let material = null;
let points = null;

const generateGalaxy = () => {
  if (points) {
    // Destroy old galaxy
    geometry?.dispose();
    material?.dispose();
    scene.remove(points);
  }

  // Geometry
  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(params.count * 3);
  const radii = new Float32Array(params.count);
  const axisTilt = new Float32Array(params.count);
  const colors = new Float32Array(params.count * 3);
  const scales = new Float32Array(params.count);
  const randomness = new Float32Array(params.count * 3);

  const colorInside = new THREE.Color(params.insideColor);
  const colorOutside = new THREE.Color(params.outsideColor);

  const possibleTilts = [...Array(params.branches).keys()].map(
    (i) => (i * Math.PI * 2) / params.branches
  );
  for (let i = 0; i < params.count; i++) {
    const i3 = i * 3;
    const radius = (i % params.branches) / 10;
    radii[i] = radius;
    // Position
    positions[i3] = 1.5 * Math.sin(i) * radius;
    positions[i3 + 1] = 0;
    positions[i3 + 2] = Math.cos(i) * radius;

    // Axis tilt
    axisTilt[i] = possibleTilts[i % params.branches];

    // Randomness
    const randomX =
      generateSingleLogNormalDistance(params.mu, params.sigma) *
      params.randomness;
    const randomY =
      generateSingleLogNormalDistance(params.mu, params.sigma) *
      params.randomness;
    const randomZ =
      generateSingleLogNormalDistance(params.mu, params.sigma) *
      params.randomness;
    randomness[i3] = randomX;
    randomness[i3 + 1] = randomY;
    randomness[i3 + 2] = randomZ;

    // Color
    const mixedColor = colorInside.clone();
    const lerpFactor = radius / params.lerp;
    mixedColor.lerp(colorOutside, lerpFactor);

    colors[i3] = mixedColor.r;
    colors[i3 + 1] = mixedColor.g;
    colors[i3 + 2] = mixedColor.b;

    // Scale
    scales[i] = Math.random();
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute(
    "aRandomness",
    new THREE.BufferAttribute(randomness, 3)
  );
  geometry.setAttribute("aRadii", new THREE.BufferAttribute(radii, 1));
  geometry.setAttribute("axisTilt", new THREE.BufferAttribute(axisTilt, 1));

  // Material
  material = new THREE.ShaderMaterial({
    depthWrite: false,
    blending: params.blending,
    vertexColors: true,
    vertexShader: /*glsl */ `
    uniform float uSize;
    uniform float uTime;
    attribute float aScale;
    attribute vec3 aRandomness;
    attribute float aRadii;
    attribute float axisTilt;
    varying vec3 vColor;

      vec2 rotate2D(vec2 v, float theta) {
        float x = v.x * cos(theta) - v.y * sin(theta);
        float y = v.x * sin(theta) + v.y * cos(theta);
        return vec2(x, y);
      }

      void main() {
        vec4 modelPosition = modelMatrix * vec4(position, 1.0);

        float angle = atan(modelPosition.x, modelPosition.z);
        float x = 1.5 * sin(angle + 0.2 * uTime / aRadii) * aRadii;
        float z = cos(angle + 0.2 * uTime / aRadii) * aRadii;
        modelPosition.x = rotate2D(vec2(x, z), axisTilt).x;
        modelPosition.z = rotate2D(vec2(x, z), axisTilt).y;
        // modelPosition.x = x;
        // modelPosition.z = z;

        // Randomness
        modelPosition.xyz += aRandomness;

        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectionPosition = projectionMatrix * viewPosition;

        gl_Position = projectionPosition;
      
        gl_PointSize = uSize * aScale;
        gl_PointSize *= ( 1.0 / - viewPosition.z );
        vColor = color;
      }
    `,
    fragmentShader: /*glsl */ `
    varying vec3 vColor;  
    void main() {

        /// Light point pattern
        float strength = distance(gl_PointCoord, vec2(0.5));
        strength = 1.0 - strength;
        strength = pow(strength, 10.0);

        // Final color
        vec3 color = mix(vec3(0.0), vColor, strength);

        gl_FragColor = vec4(color, 1.0);

      }
        `,
    uniforms: {
      uSize: { value: params.size * renderer.getPixelRatio() },
      uTime: { value: 0 },
    },
  });

  // Points
  points = new THREE.Points(geometry, material);
  scene.add(points);
};

const instantControls = () => {
  if (params.instantControls) {
    gui.onChange(generateGalaxy);
    gui.onFinishChange(undefined);
  } else {
    gui.onFinishChange(generateGalaxy);
    gui.onChange(undefined);
  }
};
instantControls();
gui
  .add(params, "instantControls")
  .onChange(instantControls)
  .name("Update instantly");
gui.add(params, "count").min(100).max(1000000).step(100).name("Stars count");
gui.add(params, "size").min(10).max(100).step(1).name("Stars size");
gui.add(params, "lerp").min(0.01).max(10).step(0.01).name("Color offset");
gui.add(params, "branches").min(1).max(50).step(1).name("Elliptical spread");
gui.add(params, "randomness").min(0).max(10).step(0.01).name("Randomness");
gui.add(params, "sigma").min(0).max(2).step(0.001).name("Distribution σ");
gui.add(params, "mu").min(0).max(5).step(0.001).name("Distribution μ");
gui.addColor(params, "insideColor").name("Center color");
gui.addColor(params, "outsideColor").name("Outside color");

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  100
);
camera.position.x = 0;
camera.position.y = 4;
camera.position.z = 4;
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
});
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

generateGalaxy();

/**
 * Animate
 */
const clock = new THREE.Clock();

const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  // Update material
  material.uniforms.uTime.value = elapsedTime;

  // Update controls
  controls.update();

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
