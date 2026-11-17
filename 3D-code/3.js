import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
const vrButton = VRButton.createButton(renderer);
vrButton.classList.add('vr-entry-control');
document.body.appendChild(vrButton);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x111827, 0.0017);
const celestialGroup = new THREE.Group();
celestialGroup.visible = false;
scene.add(celestialGroup);
let isStarted = false;

const cameraRig = new THREE.Group();
cameraRig.position.set(0, 0, 24);
scene.add(cameraRig);
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 700);
camera.position.set(0, 3.5, 0);
cameraRig.add(camera);
camera.rotation.order = 'YXZ';
const homePosition = camera.position.clone();
const homeRigPosition = cameraRig.position.clone();
const homeYaw = 0;
const homePitch = 0.1;
let yaw = homeYaw;
let pitch = homePitch;
camera.rotation.set(pitch, yaw, 0, 'YXZ');

const seedRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
const random = seedRandom(342781);

// A shader dome gives the horizon a soft violet tint and keeps the zenith deep blue.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(480, 48, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    vertexShader: [
      'varying vec3 vWorldPosition;',
      'void main() {',
      '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
      '  vWorldPosition = worldPosition.xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * worldPosition;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vWorldPosition;',
      'void main() {',
      '  vec3 direction = normalize(vWorldPosition - cameraPosition);',
      '  float height = smoothstep(-0.16, 0.78, direction.y);',
      '  vec3 horizon = vec3(0.025, 0.07, 0.19);',
      '  vec3 zenith = vec3(0.003, 0.008, 0.025);',
      '  vec3 skyColor = mix(horizon, zenith, height);',
      '  float duskGlow = exp(-pow((direction.y - 0.025) * 8.0, 2.0));',
      '  skyColor += vec3(0.018, 0.045, 0.12) * duskGlow;',
      '  gl_FragColor = vec4(skyColor, 1.0);',
      '}',
    ].join('\n'),
  }),
);
sky.frustumCulled = false;
sky.renderOrder = -10;
scene.add(sky);

scene.add(new THREE.HemisphereLight(0x9aafff, 0x233225, 1.05));
const moonLight = new THREE.DirectionalLight(0xa4b6ff, 1.35);
moonLight.position.set(70, 96, -115);
moonLight.target.position.set(0, 0, -85);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.left = -70;
moonLight.shadow.camera.right = 70;
moonLight.shadow.camera.top = 65;
moonLight.shadow.camera.bottom = -40;
moonLight.shadow.bias = -0.0005;
celestialGroup.add(moonLight, moonLight.target);

function terrainHeight(x, z) {
  const lowHill = 0.32 * Math.sin(x * 0.028 + z * 0.014);
  const rolling = 0.24 * Math.sin(z * 0.035) + 0.12 * Math.cos(x * 0.046 - z * 0.024);
  const knoll = 0.7 * Math.exp(-((x + 3) ** 2 + (z - 8) ** 2) / 640);
  return lowHill + rolling + knoll;
}

function makeGroundTexture() {
  const size = 512;
  const canvasTexture = document.createElement('canvas');
  canvasTexture.width = size;
  canvasTexture.height = size;
  const context = canvasTexture.getContext('2d');
  const base = context.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, '#31583a');
  base.addColorStop(0.55, '#254a32');
  base.addColorStop(1, '#1b3829');
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);

  for (let i = 0; i < 7500; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const alpha = 0.025 + random() * 0.09;
    const light = random() > 0.52;
    context.fillStyle = light ? 'rgba(153, 181, 113, ' + alpha + ')' : 'rgba(3, 14, 13, ' + alpha + ')';
    context.fillRect(x, y, 1 + random() * 2.4, 1 + random() * 2.4);
  }
  for (let i = 0; i < 1350; i += 1) {
    const x = random() * size;
    const y = random() * size;
    context.strokeStyle = 'rgba(130, 166, 108, ' + (0.05 + random() * 0.1) + ')';
    context.lineWidth = 0.5 + random() * 1.1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (random() - 0.5) * 4, y - 2 - random() * 6);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(13, 10);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

const groundGeometry = new THREE.PlaneGeometry(420, 340, 150, 126);
groundGeometry.rotateX(-Math.PI / 2);
const groundPositions = groundGeometry.attributes.position;
for (let i = 0; i < groundPositions.count; i += 1) {
  const worldX = groundPositions.getX(i);
  const worldZ = groundPositions.getZ(i) - 82;
  groundPositions.setY(i, terrainHeight(worldX, worldZ));
}
groundGeometry.computeVertexNormals();
const ground = new THREE.Mesh(
  groundGeometry,
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 }),
);
ground.position.z = -82;
ground.receiveShadow = true;
scene.add(ground);

// Low-poly blades add texture to the close foreground without a heavy grass model.
const bladeGeometry = new THREE.BufferGeometry();
bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0,
  -0.13, 0.68, 0,
  -0.03, 1.4, 0.08,
  0.13, 0.68, 0,
], 3));
bladeGeometry.setIndex([0, 1, 2, 0, 2, 3]);
bladeGeometry.computeVertexNormals();
const grass = new THREE.InstancedMesh(
  bladeGeometry,
  new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.92 }),
  120000,
);
grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);
const grassDummy = new THREE.Object3D();
const grassColor = new THREE.Color();
for (let i = 0; i < grass.count; i += 1) {
  const x = (random() - 0.5) * 290;
  const z = -110 + Math.pow(random(), 0.72) * 175;
  const widthScale = 0.72 + random() * 0.78;
  const heightScale = 0.78 + random() * 0.78;
  grassDummy.position.set(x, terrainHeight(x, z) - 0.02, z);
  grassDummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.12);
  grassDummy.scale.set(widthScale, heightScale, widthScale);
  grassDummy.updateMatrix();
  grass.setMatrixAt(i, grassDummy.matrix);
  grassColor.setHSL(0.27 + random() * 0.07, 0.34 + random() * 0.2, 0.25 + random() * 0.17);
  grass.setColorAt(i, grassColor);
}
grass.instanceMatrix.needsUpdate = true;
if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
grass.frustumCulled = false;
scene.add(grass);

function addRidge(points, z, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-250, -15);
  shape.lineTo(-250, points[0][1]);
  for (const [x, y] of points) shape.lineTo(x, y);
  shape.lineTo(250, points[points.length - 1][1]);
  shape.lineTo(250, -15);
  shape.closePath();
  const ridge = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }),
  );
  ridge.position.set(0, 0, z);
  scene.add(ridge);
  return ridge;
}
addRidge([
  [-210, 4], [-180, 7], [-145, 3], [-115, 12], [-82, 5], [-50, 9], [-12, 3],
  [21, 7], [56, 2], [92, 11], [128, 4], [163, 8], [200, 3], [230, 6],
], -208, 0x111725);
addRidge([
  [-230, 0], [-190, 4], [-157, 1], [-118, 7], [-77, 2], [-35, 5], [4, 1],
  [49, 5], [85, 1], [128, 6], [171, 1], [207, 4], [238, 1],
], -196, 0x0c1421);

// A low mountain ring keeps the horizon populated when the camera faces any direction.
function addPanoramicRidge() {
  const segments = 360;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const radius = 204 + Math.sin(angle * 4) * 4;
    const x = Math.sin(angle) * radius;
    const z = -82 + Math.cos(angle) * radius;
    const peak = 5 + Math.sin(angle * 3 + 0.4) * 2.8 + Math.sin(angle * 7 - 1.2) * 1.7 + Math.sin(angle * 13 + 2) * 1.2;
    positions.push(x, -18, z, x, peak, z);
    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ color: 0x101725, fog: false, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(geometry, material));
}
addPanoramicRidge();

function makeGlowTexture() {
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const context = glowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(255,255,255,.72)');
  gradient.addColorStop(0.38, 'rgba(255,255,255,.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const glowTexture = makeGlowTexture();

const nebulaMaterial = new THREE.SpriteMaterial({
  map: glowTexture,
  color: 0x526aae,
  transparent: true,
  opacity: 0.14,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
});
const nebula = new THREE.Sprite(nebulaMaterial);
nebula.position.set(-92, 77, -230);
nebula.scale.set(118, 72, 1);
celestialGroup.add(nebula);
const nebula2 = new THREE.Sprite(nebulaMaterial.clone());
nebula2.material.color.set(0x3f66b0);
nebula2.material.opacity = 0.11;
nebula2.position.set(8, 102, -254);
nebula2.scale.set(100, 58, 1);
celestialGroup.add(nebula2);

// Thousands of distant stars share one buffer geometry and gently shimmer in a shader.
const starCount = 4300;
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
const starSizes = new Float32Array(starCount);
const starPhases = new Float32Array(starCount);
const starTwinkles = new Float32Array(starCount);
const starColors = new Float32Array(starCount * 3);
const starPalette = [0xc7a3ff, 0xffd76a, 0xf5f6ff];
for (let i = 0; i < starCount; i += 1) {
  const azimuth = random() * Math.PI * 2 - Math.PI;
  const elevation = Math.asin(0.025 + random() * 0.975);
  const radius = 278 + random() * 38;
  const cosElevation = Math.cos(elevation);
  starPositions[i * 3] = Math.sin(azimuth) * cosElevation * radius;
  starPositions[i * 3 + 1] = Math.sin(elevation) * radius;
  starPositions[i * 3 + 2] = -Math.cos(azimuth) * cosElevation * radius;
  starSizes[i] = 2.1 + Math.pow(random(), 3) * 7.2;
  starPhases[i] = random() * Math.PI * 2;
  starTwinkles[i] = 0.4 + random() * 1.7;
  const color = new THREE.Color(starPalette[Math.floor(random() * starPalette.length)]);
  starColors[i * 3] = color.r;
  starColors[i * 3 + 1] = color.g;
  starColors[i * 3 + 2] = color.b;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));
starGeometry.setAttribute('aTwinkle', new THREE.BufferAttribute(starTwinkles, 1));
starGeometry.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));
const starMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  vertexShader: [
    'uniform float uTime;',
    'attribute float aSize;',
    'attribute float aPhase;',
    'attribute float aTwinkle;',
    'attribute vec3 aColor;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * viewPosition;',
    '  float shimmer = 0.76 + 0.24 * sin(uTime * aTwinkle + aPhase);',
    '  gl_PointSize = clamp(aSize * (330.0 / -viewPosition.z) * shimmer, 1.0, 8.0);',
    '  vColor = aColor;',
    '  vAlpha = 0.72 + 0.28 * shimmer;',
    '}',
  ].join('\n'),
  fragmentShader: [
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  float radius = distance(gl_PointCoord, vec2(0.5));',
    '  float disc = 1.0 - smoothstep(0.08, 0.5, radius);',
    '  float core = 1.0 - smoothstep(0.0, 0.22, radius);',
    '  gl_FragColor = vec4(vColor * (1.0 + core * 0.7), disc * vAlpha);',
    '}',
  ].join('\n'),
});
const starField = new THREE.Points(starGeometry, starMaterial);
starField.frustumCulled = false;
celestialGroup.add(starField);

const zodiacDetails = {
  aries: { englishName: 'Aries', dateRange: '21/3 – 19/4' },
  taurus: { englishName: 'Taurus', dateRange: '20/4 – 20/5' },
  gemini: { englishName: 'Gemini', dateRange: '21/5 – 20/6' },
  cancer: { englishName: 'Cancer', dateRange: '21/6 – 22/7' },
  leo: { englishName: 'Leo', dateRange: '23/7 – 22/8' },
  virgo: { englishName: 'Virgo', dateRange: '23/8 – 22/9' },
  libra: { englishName: 'Libra', dateRange: '23/9 – 22/10' },
  scorpio: { englishName: 'Scorpio / Thiên Yết', dateRange: '23/10 – 21/11' },
  sagittarius: { englishName: 'Sagittarius', dateRange: '22/11 – 21/12' },
  capricorn: { englishName: 'Capricorn', dateRange: '22/12 – 19/1' },
  aquarius: { englishName: 'Aquarius', dateRange: '20/1 – 18/2' },
  pisces: { englishName: 'Pisces', dateRange: '19/2 – 20/3' },
};
const zodiacColors = [0xc7a3ff, 0xffd76a, 0xf5f6ff];
const zodiacLayoutRandom = seedRandom(814207);
const zodiacLayouts = [];

function angularDistance(first, second) {
  const azimuthDifference = Math.atan2(
    Math.sin(first.centerAzimuth - second.centerAzimuth),
    Math.cos(first.centerAzimuth - second.centerAzimuth),
  );
  const cosine = Math.sin(first.centerElevation) * Math.sin(second.centerElevation)
    + Math.cos(first.centerElevation) * Math.cos(second.centerElevation) * Math.cos(azimuthDifference);
  return Math.acos(THREE.MathUtils.clamp(cosine, -1, 1));
}

const zodiacSigns = [
  // Keep the constellation shapes fixed; their sky positions and scales are varied below.
  { id: 'aquarius', name: 'Bảo Bình', color: 0xaee2e4, bright: [0, 2, 4, 5, 8, 10], points: [[-0.26, 0.98], [-0.57, 0.53], [-0.98, -0.02], [-0.88, -0.27], [-0.93, -0.49], [-0.075, -0.98], [0.03, -0.71], [0.36, -0.63], [0.99, -0.8], [-0.28, -0.1], [0.08, 0.09]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [2, 9], [9, 10]] },
  { id: 'pisces', name: 'Song Ngư', color: 0xd5caff, bright: [0, 2, 4, 5, 8, 11, 12, 14, 16], points: [[-0.1, 0.98], [0.14, 0.83], [0.18, 0.66], [0.06, 0.53], [-0.14, 0.58], [-0.34, 0.72], [-0.22, 0.86], [-0.05, 0.33], [0.2, -0.2], [0.32, -0.42], [0.63, -0.7], [0.93, -0.96], [-0.98, -0.94], [-0.73, -1.1], [-0.56, -0.93], [0.06, -0.93], [0.52, -0.93]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [4, 7], [7, 8], [8, 9], [9, 10], [10, 11], [12, 13], [13, 14], [14, 15], [15, 16], [16, 11]] },
  { id: 'aries', name: 'Bạch Dương', color: 0xffd89c, points: [[-0.68, 0.05], [-0.25, 0.28], [0.18, 0.08], [0.64, -0.28]], edges: [[0, 1], [1, 2], [2, 3]] },
  { id: 'taurus', name: 'Kim Ngưu', color: 0xffe7ad, bright: [0, 3, 5, 7, 9, 10], points: [[-0.82, 0.97], [-0.26, 0.6], [0.02, 0.25], [0.19, -0.01], [-0.04, 0.03], [-0.97, 0.37], [0.48, -0.16], [0.84, 0.09], [0.96, -0.27], [0.37, -0.75], [0.57, -0.96]], edges: [[0, 1], [1, 2], [2, 3], [5, 4], [4, 3], [3, 6], [6, 7], [7, 8], [6, 9], [9, 10]] },
  { id: 'gemini', name: 'Song Tử', color: 0xc9e6ff, bright: [0, 2, 3, 5, 6, 9, 11, 14], points: [[-0.82, 0.65], [-0.69, 0.62], [-0.35, 0.55], [-0.08, 0.94], [-0.61, 0.3], [-0.82, 0.3], [-0.94, 0.02], [-0.46, -0.17], [-0.12, -0.25], [0.45, -0.53], [-0.38, -0.63], [0.32, -0.89], [0.21, 0.18], [0.55, -0.17], [0.65, 0.03], [0.8, 0.07], [1, 0.18]], edges: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [4, 7], [7, 8], [8, 9], [7, 10], [10, 11], [2, 12], [12, 13], [12, 14], [14, 15], [15, 16]] },
  { id: 'cancer', name: 'Cự Giải', color: 0xd2e9ce, bright: [0, 1, 2, 3, 4], points: [[-1, 0.8], [-0.42, 0.34], [-0.24, 0.08], [1, -0.22], [-0.18, -0.82]], edges: [[0, 1], [1, 2], [2, 3], [2, 4]] },
  { id: 'leo', name: 'Sư Tử', color: 0xffd092, bright: [0, 2, 4, 5, 6, 7, 8], points: [[-0.85, -0.68], [-0.34, -0.48], [0.9, -0.45], [0.82, -0.04], [0.52, 0.15], [0.5, 0.59], [0.85, 1], [1, 0.82], [-0.44, 0.14]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [4, 8], [8, 0]] },
  { id: 'virgo', name: 'Xử Nữ', color: 0xd8d3ff, bright: [0, 2, 3, 4, 5, 6, 7, 8], points: [[-0.42, 0.98], [-0.28, 0.42], [0, 0], [0.46, 0.08], [1.02, 0.31], [1.12, 0.82], [-0.58, -0.3], [-1.12, 0.1], [-0.9, -0.93]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [6, 8]] },
  { id: 'libra', name: 'Thiên Bình', color: 0xc8e9ef, bright: [0, 3, 4, 5, 6], points: [[-0.82, -0.08], [-0.55, 0.12], [-0.31, 0.28], [0.02, 0.78], [0.78, 0.32], [0.64, -0.34], [0.06, -0.68], [0.04, -0.94]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [3, 5], [5, 6], [6, 7]] },
  { id: 'scorpio', name: 'Bọ Cạp', color: 0xffb3a2, bright: [0, 5, 6, 8, 9, 10, 11, 14], points: [[-1.01, -0.54], [-0.75, -0.48], [-0.66, -0.52], [-0.83, -0.65], [-0.9, -0.78], [-0.75, -0.98], [-0.36, -0.98], [-0.085, -0.91], [-0.055, -0.55], [-0.004, -0.28], [0.23, 0.24], [0.345, 0.38], [0.53, 0.46], [0.91, 0.65], [0.88, 0.9], [0.93, 0.35], [0.92, 0.1]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [13, 15], [15, 16]] },
  { id: 'sagittarius', name: 'Nhân Mã', color: 0xffdfaa, bright: [0, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19], points: [[-0.19, 0.96], [-0.05, 0.7], [0.01, 0.59], [0.13, 0.62], [0.06, 0.3], [-0.14, 0.27], [-0.11, 0.07], [0.2, 0.17], [0.47, 0.21], [0.8, 0.41], [0.47, -0.11], [0.65, -0.25], [0.31, -0.39], [0.32, -0.6], [0.97, -0.22], [-1, 0.41], [-0.55, 0.53], [-1, -0.6], [-0.58, -0.58], [-0.63, -0.84]], edges: [[0, 1], [1, 2], [2, 4], [2, 3], [4, 5], [5, 6], [6, 7], [4, 7], [7, 8], [8, 9], [8, 10], [10, 11], [10, 12], [12, 13], [10, 14], [15, 16], [16, 5], [15, 17], [17, 18], [17, 19]] },
  { id: 'capricorn', name: 'Ma Kết', color: 0xcad9ff, bright: [0, 4, 5, 7], points: [[-0.99, 0.76], [-0.74, 0.6], [-0.41, 0.51], [-0.05, 0.4], [0.93, 0.59], [0.99, 0.97], [-0.55, -0.24], [0.22, -0.97], [0.42, -0.71]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 6], [6, 7], [7, 8], [8, 4]] },
].map((sign, index) => ({
  ...sign,
  ...zodiacDetails[sign.id],
  color: zodiacColors[index % zodiacColors.length],
  azimuthScale: 0.15,
  elevationScale: 0.115,
}));

for (const sign of zodiacSigns) {
  let layout;
  let attempts = 0;
  do {
    const scale = 0.78 + zodiacLayoutRandom() * 0.5;
    const rotation = zodiacLayoutRandom() * Math.PI * 2;
    const radius = Math.max(...sign.points.map((point) => (
      Math.hypot(
        (point[0] * Math.cos(rotation) - point[1] * Math.sin(rotation)) * sign.azimuthScale,
        (point[0] * Math.sin(rotation) + point[1] * Math.cos(rotation)) * sign.elevationScale,
      ) * scale
    )));
    layout = {
      centerAzimuth: zodiacLayoutRandom() * Math.PI * 2 - Math.PI,
      centerElevation: radius + 0.17 + zodiacLayoutRandom() * 0.66,
      scale,
      rotation,
      radius,
    };
    attempts += 1;
  } while (
    attempts < 500
    && zodiacLayouts.some((placed) => (
      angularDistance(layout, placed) < 0.18 + (layout.radius + placed.radius) * 0.84
    ))
  );

  Object.assign(sign, {
    centerAzimuth: layout.centerAzimuth,
    centerElevation: layout.centerElevation,
    layoutScale: layout.scale,
    rotation: layout.rotation,
  });
  zodiacLayouts.push(layout);
}

const namedStars = zodiacSigns.flatMap((sign, signIndex) => sign.points.map((point, pointIndex) => {
  const rotatedX = point[0] * Math.cos(sign.rotation) - point[1] * Math.sin(sign.rotation);
  const rotatedY = point[0] * Math.sin(sign.rotation) + point[1] * Math.cos(sign.rotation);
  return {
    id: sign.id + '-' + pointIndex,
    name: sign.name,
    englishName: zodiacDetails[sign.id].englishName,
    dateRange: zodiacDetails[sign.id].dateRange,
    constellation: 'Cung hoàng đạo',
    az: sign.centerAzimuth + rotatedX * sign.azimuthScale * sign.layoutScale,
    el: sign.centerElevation + rotatedY * sign.elevationScale * sign.layoutScale,
    size: (pointIndex === 0 || sign.bright?.includes(pointIndex) ? 0.72 : 0.3 + (pointIndex % 3) * 0.035) * sign.layoutScale,
    color: sign.color,
    signIndex,
  };
}));

function skyPosition(azimuth, elevation, radius = 278) {
  const cosElevation = Math.cos(elevation);
  return new THREE.Vector3(
    Math.sin(azimuth) * cosElevation * radius,
    Math.sin(elevation) * radius,
    -Math.cos(azimuth) * cosElevation * radius,
  );
}

const starTargets = [];
const starByName = new Map();
for (const star of namedStars) {
  const position = skyPosition(star.az, star.el, 272);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(star.size, 12, 10),
    new THREE.MeshBasicMaterial({ color: star.color, toneMapped: false }),
  );
  core.position.copy(position);
  celestialGroup.add(core);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: star.color,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }));
  halo.position.copy(position);
  halo.scale.set(star.size * 8, star.size * 8, 1);
  celestialGroup.add(halo);

  const target = new THREE.Mesh(
    new THREE.SphereGeometry(2.7, 8, 8),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }),
  );
  target.position.copy(position);
  target.userData.star = star;
  celestialGroup.add(target);
  starTargets.push(target);
  starByName.set(star.id, position);
}

const constellationGroup = new THREE.Group();
const constellationHitTargets = [];
for (const sign of zodiacSigns) {
  const segmentPoints = [];
  for (const [from, to] of sign.edges) {
    segmentPoints.push(
      starByName.get(sign.id + '-' + from),
      starByName.get(sign.id + '-' + to),
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(segmentPoints);
  const material = new THREE.LineBasicMaterial({
    color: sign.color,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    toneMapped: false,
  });
  const constellationLine = new THREE.LineSegments(geometry, material);
  constellationLine.userData.sign = sign;
  constellationGroup.add(constellationLine);
  constellationHitTargets.push(constellationLine);
}
constellationGroup.visible = true;
celestialGroup.add(constellationGroup);

function addCylinderBetween(start, end, radiusTop, radiusBottom, material, segments = 12) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

// A small telescope and lantern make the foreground feel like a place to stay awhile.
const telescope = new THREE.Group();
telescope.position.set(8, terrainHeight(8, 5) + 0.02, 5);
scene.add(telescope);
const tripodMetal = new THREE.MeshStandardMaterial({ color: 0x202733, metalness: 0.62, roughness: 0.42 });
const brass = new THREE.MeshStandardMaterial({ color: 0x967a50, metalness: 0.72, roughness: 0.35 });
const scopeBody = new THREE.MeshStandardMaterial({ color: 0x18212b, metalness: 0.48, roughness: 0.33 });
const tripodTop = new THREE.Vector3(0, 2.5, 0);
const feet = [
  new THREE.Vector3(-0.9, 0.05, 0.62),
  new THREE.Vector3(0.92, 0.05, 0.6),
  new THREE.Vector3(0, 0.05, -0.94),
];
for (const foot of feet) {
  const direction = new THREE.Vector3().subVectors(tripodTop, foot);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, direction.length(), 8), tripodMetal);
  leg.position.copy(foot).add(tripodTop).multiplyScalar(0.5);
  leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  telescope.add(leg);
}
const mount = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), brass);
mount.position.copy(tripodTop);
telescope.add(mount);
const scopeStart = new THREE.Vector3(-0.16, 2.75, 0.2);
const scopeEnd = new THREE.Vector3(0.5, 4.3, -2.48);
const scopeVector = new THREE.Vector3().subVectors(scopeEnd, scopeStart);
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, scopeVector.length(), 20), scopeBody);
barrel.position.copy(scopeStart).add(scopeEnd).multiplyScalar(0.5);
barrel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), scopeVector.clone().normalize());
barrel.castShadow = true;
telescope.add(barrel);
const lensOrientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), scopeVector.clone().normalize());
const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.065, 9, 28), brass);
lensRing.position.copy(scopeEnd);
lensRing.quaternion.copy(lensOrientation);
telescope.add(lensRing);
const lens = new THREE.MeshBasicMaterial({ color: 0x91b3c5, transparent: true, opacity: 0.62 });
const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.255, 24), lens);
lensGlass.position.copy(scopeEnd);
lensGlass.quaternion.copy(lensOrientation);
telescope.add(lensGlass);

const lantern = new THREE.Group();
lantern.position.set(-8, terrainHeight(-8, 6) + 0.05, 6);
scene.add(lantern);
const lanternMetal = new THREE.MeshStandardMaterial({ color: 0x20251f, metalness: 0.48, roughness: 0.5 });
const lanternGlass = new THREE.MeshStandardMaterial({ color: 0xffd994, emissive: 0xffa943, emissiveIntensity: 1.3, transparent: true, opacity: 0.8, roughness: 0.35 });
const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.18, 12), lanternMetal);
lanternBase.position.y = 0.1;
lantern.add(lanternBase);
const lanternBody = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.76, 12), lanternGlass);
lanternBody.position.y = 0.58;
lantern.add(lanternBody);
const lanternCap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.31, 0.17, 12), lanternMetal);
lanternCap.position.y = 1.05;
lantern.add(lanternCap);
const lanternLoop = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 24, Math.PI), lanternMetal);
lanternLoop.position.set(0, 1.25, 0);
lantern.add(lanternLoop);
const lanternLight = new THREE.PointLight(0xffc47e, 24, 24, 2);
lanternLight.position.set(0, 0.65, 0);
lantern.add(lanternLight);

const fireflyCount = 125;
const fireflyGeometry = new THREE.BufferGeometry();
const fireflyPositions = new Float32Array(fireflyCount * 3);
const fireflyBase = new Float32Array(fireflyCount * 3);
const fireflyPhases = new Float32Array(fireflyCount);
for (let i = 0; i < fireflyCount; i += 1) {
  const x = (random() - 0.5) * 72;
  const z = -23 + random() * 40;
  const y = terrainHeight(x, z) + 0.45 + random() * 3.4;
  fireflyBase[i * 3] = x;
  fireflyBase[i * 3 + 1] = y;
  fireflyBase[i * 3 + 2] = z;
  fireflyPositions[i * 3] = x;
  fireflyPositions[i * 3 + 1] = y;
  fireflyPositions[i * 3 + 2] = z;
  fireflyPhases[i] = random() * Math.PI * 2;
}
fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
const fireflies = new THREE.Points(
  fireflyGeometry,
  new THREE.PointsMaterial({
    color: 0xc9eaa9,
    map: glowTexture,
    size: 0.16,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  }),
);
fireflies.frustumCulled = false;
scene.add(fireflies);

const shootingStars = [];
function spawnMeteor() {
  const start = skyPosition((random() - 0.5) * 1.7, 0.28 + random() * 0.7, 252 + random() * 15);
  const skyNormal = start.clone().normalize();
  const downward = new THREE.Vector3(0, -1, 0)
    .addScaledVector(skyNormal, skyNormal.y)
    .normalize();
  const sideways = new THREE.Vector3().crossVectors(downward, skyNormal).normalize();
  const direction = downward.addScaledVector(sideways, (random() - 0.5) * 0.7).normalize();
  const speed = 42 + random() * 24;
  const velocity = direction.clone().multiplyScalar(speed);
  const life = 0.8 + random() * 0.7;
  const trailLength = 9 + random() * 15;
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

  const trailGeometry = new THREE.CylinderGeometry(0.23, 0.008, trailLength, 9, 1, true);
  const trailMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xbddcff) },
      uOpacity: { value: 0.82 },
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColor;',
      'uniform float uOpacity;',
      'varying vec2 vUv;',
      'void main() {',
      '  float tailFade = smoothstep(0.0, 0.22, vUv.y);',
      '  float headFade = 1.0 - smoothstep(0.78, 1.0, vUv.y);',
      '  float glow = 0.9 + 0.1 * abs(cos(vUv.x * 6.28318));',
      '  float alpha = tailFade * headFade * glow * uOpacity;',
      '  gl_FragColor = vec4(uColor * (0.8 + glow * 0.5), alpha);',
      '}',
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const trail = new THREE.Mesh(trailGeometry, trailMaterial);
  trail.quaternion.copy(orientation);
  trail.position.copy(direction).multiplyScalar(-trailLength * 0.5);

  const coreLength = trailLength * 0.7;
  const coreGeometry = new THREE.CylinderGeometry(0.055, 0.002, coreLength, 6, 1, true);
  const coreMaterial = trailMaterial.clone();
  coreMaterial.uniforms.uColor.value.set(0xfff2d8);
  coreMaterial.uniforms.uOpacity.value = 0.62;
  const coreTrail = new THREE.Mesh(coreGeometry, coreMaterial);
  coreTrail.quaternion.copy(orientation);
  coreTrail.position.copy(direction).multiplyScalar(-coreLength * 0.5);

  const meteorGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffc879,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  meteorGlow.scale.set(13, 13, 1);
  const meteorHead = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xfff2d8,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  meteorHead.scale.set(4.5, 4.5, 1);
  const meteorCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  );

  const group = new THREE.Group();
  group.position.copy(start);
  group.add(trail, coreTrail, meteorGlow, meteorHead, meteorCore);
  scene.add(group);
  shootingStars.push({
    group,
    trailMaterial,
    coreMaterial,
    glowMaterial: meteorGlow.material,
    headMaterial: meteorHead.material,
    materials: [trailMaterial, coreMaterial, meteorGlow.material, meteorHead.material, meteorCore.material],
    geometries: [trailGeometry, coreGeometry, meteorCore.geometry],
    velocity,
    age: 0,
    life,
  });
}

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 4.5;
const pointer = new THREE.Vector2();
const starCard = document.querySelector('#starCard');
let starCardHideTimer = 0;
let pointerStart = null;
let lastPointer = null;
let pointerMoved = false;

function showSignInfo(sign) {
  window.clearTimeout(starCardHideTimer);
  document.querySelector('#starName').textContent = sign.name;
  document.querySelector('#starEnglish').textContent = sign.englishName;
  document.querySelector('#starDates').textContent = sign.dateRange;
  starCard.hidden = false;
  starCard.classList.remove('is-visible');
  void starCard.offsetWidth;
  starCard.classList.add('is-visible');
}

const vrInfoCanvas = document.createElement('canvas');
vrInfoCanvas.width = 768;
vrInfoCanvas.height = 360;
const vrInfoContext = vrInfoCanvas.getContext('2d');
const vrInfoTexture = new THREE.CanvasTexture(vrInfoCanvas);
vrInfoTexture.colorSpace = THREE.SRGBColorSpace;
vrInfoTexture.minFilter = THREE.LinearFilter;
vrInfoTexture.generateMipmaps = false;
const vrInfoCard = new THREE.Mesh(
  new THREE.PlaneGeometry(1.5, 0.7),
  new THREE.MeshBasicMaterial({
    map: vrInfoTexture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  }),
);
vrInfoCard.position.set(0, 0, -2.2);
vrInfoCard.visible = false;
camera.add(vrInfoCard);

function showVRSignInfo(sign) {
  vrInfoContext.clearRect(0, 0, vrInfoCanvas.width, vrInfoCanvas.height);
  vrInfoContext.fillStyle = 'rgba(8, 13, 26, 0.94)';
  vrInfoContext.strokeStyle = 'rgba(232, 240, 247, 0.3)';
  vrInfoContext.lineWidth = 3;
  vrInfoContext.beginPath();
  vrInfoContext.roundRect(4, 4, 760, 352, 24);
  vrInfoContext.fill();
  vrInfoContext.stroke();

  vrInfoContext.textAlign = 'left';
  vrInfoContext.fillStyle = 'rgba(225, 235, 235, 0.62)';
  vrInfoContext.font = '600 25px sans-serif';
  vrInfoContext.fillText('THÔNG TIN CUNG HOÀNG ĐẠO', 44, 70);
  vrInfoContext.fillStyle = '#f3f2e9';
  vrInfoContext.font = '500 58px sans-serif';
  vrInfoContext.fillText(sign.name, 44, 152);
  vrInfoContext.fillStyle = 'rgba(224, 233, 230, 0.82)';
  vrInfoContext.font = '32px sans-serif';
  vrInfoContext.fillText(sign.englishName, 44, 210);
  vrInfoContext.strokeStyle = 'rgba(226, 236, 243, 0.22)';
  vrInfoContext.beginPath();
  vrInfoContext.moveTo(44, 245);
  vrInfoContext.lineTo(724, 245);
  vrInfoContext.stroke();
  vrInfoContext.fillStyle = '#d5e4d7';
  vrInfoContext.font = '32px sans-serif';
  vrInfoContext.fillText(sign.dateRange, 44, 304);
  vrInfoTexture.needsUpdate = true;
  vrInfoCard.visible = true;
}

const selectableObjects = [...starTargets, ...constellationHitTargets];
const controllerRotation = new THREE.Matrix4();
const controllerRayGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, -1),
]);
const controllerRayMaterial = new THREE.LineBasicMaterial({
  color: 0xf5f6ff,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  toneMapped: false,
});

for (let i = 0; i < 2; i += 1) {
  const controller = renderer.xr.getController(i);
  controller.addEventListener('select', () => {
    cameraRig.updateMatrixWorld(true);
    controller.updateMatrixWorld(true);
    controllerRotation.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(controllerRotation);
    const [hit] = raycaster.intersectObjects(selectableObjects, false);
    if (!hit) {
      vrInfoCard.visible = false;
      return;
    }

    showVRSignInfo(hit.object.userData.star || hit.object.userData.sign);
  });
  cameraRig.add(controller);

  const rayLine = new THREE.Line(controllerRayGeometry, controllerRayMaterial);
  rayLine.scale.z = 320;
  rayLine.frustumCulled = false;
  rayLine.visible = false;
  controller.add(rayLine);
  controller.addEventListener('connected', () => { rayLine.visible = true; });
  controller.addEventListener('disconnected', () => { rayLine.visible = false; });
}
renderer.xr.addEventListener('sessionend', () => {
  vrInfoCard.visible = false;
  camera.position.copy(homePosition);
  yaw = homeYaw;
  pitch = homePitch;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
});

function hideSignInfo() {
  starCard.classList.remove('is-visible');
  window.clearTimeout(starCardHideTimer);
  starCardHideTimer = window.setTimeout(() => {
    if (!starCard.classList.contains('is-visible')) starCard.hidden = true;
  }, 230);
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerStart = { x: event.clientX, y: event.clientY };
  lastPointer = { x: event.clientX, y: event.clientY };
  pointerMoved = false;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointerStart || !lastPointer) return;
  const deltaX = event.clientX - lastPointer.x;
  const deltaY = event.clientY - lastPointer.y;
  lastPointer = { x: event.clientX, y: event.clientY };
  if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) pointerMoved = true;
  const bounds = canvas.getBoundingClientRect();
  yaw -= deltaX * (Math.PI * 2 / bounds.width);
  pitch -= deltaY * (Math.PI * 2 / bounds.height);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
});
canvas.addEventListener('pointerup', (event) => {
  if (!pointerStart) return;
  const moved = pointerMoved || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5;
  pointerStart = null;
  lastPointer = null;
  if (moved) return;
  const bounds = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const [hit] = raycaster.intersectObjects([...starTargets, ...constellationHitTargets], false);
  if (!hit) return;
  const sign = hit.object.userData.star || hit.object.userData.sign;
  showSignInfo(sign);
});
canvas.addEventListener('pointercancel', () => {
  pointerStart = null;
  lastPointer = null;
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.018, 34, 72);
  camera.updateProjectionMatrix();
}, { passive: false });

document.querySelector('#meteorButton').addEventListener('click', () => {
  spawnMeteor();
  window.setTimeout(spawnMeteor, 250);
  window.setTimeout(spawnMeteor, 510);
});
document.querySelector('#resetButton').addEventListener('click', () => {
  cameraRig.position.copy(homeRigPosition);
  camera.position.copy(homePosition);
  yaw = homeYaw;
  pitch = homePitch;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.fov = 52;
  camera.updateProjectionMatrix();
  hideSignInfo();
});
document.querySelector('#closeStarCard').addEventListener('click', () => {
  hideSignInfo();
});
document.querySelector('.brand').addEventListener('click', (event) => event.preventDefault());

const clock = new THREE.Clock();
let nextAmbientMeteor = 14;
function startExperience() {
  if (isStarted) return;
  isStarted = true;
  celestialGroup.visible = true;
  document.querySelector('.experience').classList.add('is-started');
  nextAmbientMeteor = clock.elapsedTime + 8;
}
document.querySelector('#startButton').addEventListener('click', startExperience);
renderer.xr.addEventListener('sessionstart', startExperience);

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  starMaterial.uniforms.uTime.value = elapsed;

  for (let i = 0; i < fireflyCount; i += 1) {
    fireflyPositions[i * 3 + 1] = fireflyBase[i * 3 + 1] + Math.sin(elapsed * 0.8 + fireflyPhases[i]) * 0.28;
  }
  fireflyGeometry.attributes.position.needsUpdate = true;
  lanternLight.intensity = 22 + Math.sin(elapsed * 2.1) * 2;
  if (isStarted && elapsed > nextAmbientMeteor) {
    spawnMeteor();
    nextAmbientMeteor = elapsed + 13 + random() * 15;
  }
  for (let i = shootingStars.length - 1; i >= 0; i -= 1) {
    const meteor = shootingStars[i];
    meteor.age += delta;
    meteor.group.position.addScaledVector(meteor.velocity, delta);
    const fade = Math.max(0, 1 - meteor.age / meteor.life);
    const opacity = fade * fade;
    meteor.trailMaterial.uniforms.uOpacity.value = 0.82 * opacity;
    meteor.coreMaterial.uniforms.uOpacity.value = 0.62 * opacity;
    meteor.glowMaterial.opacity = 0.42 * opacity;
    meteor.headMaterial.opacity = opacity;
    if (meteor.age >= meteor.life) {
      scene.remove(meteor.group);
      for (const geometry of meteor.geometries) geometry.dispose();
      for (const material of meteor.materials) material.dispose();
      shootingStars.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (!renderer.xr.isPresenting) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});
