import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

const inToM = (inches) => inches * 0.0254;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ui = {
  fps: document.getElementById('fps'),
  diameter: document.getElementById('diameter'),
  sphereSize: document.getElementById('sphereSize'),
  spacing: document.getElementById('spacing'),
  rows: document.getElementById('rows'),
  layers: document.getElementById('layers'),
  initialSpeed: document.getElementById('initialSpeed'),
  density: document.getElementById('density'),
  buildBtn: document.getElementById('buildBtn'),
  launchBtn: document.getElementById('launchBtn'),
  resetBtn: document.getElementById('resetBtn'),
  recordBtn: document.getElementById('recordBtn'),
  snapshotBtn: document.getElementById('snapshotBtn'),
  exportBtn: document.getElementById('exportBtn'),
  sphereCountOut: document.getElementById('sphereCountOut'),
  totalOut: document.getElementById('totalOut'),
  speedTable: document.getElementById('speedTable')
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('#070b10');

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth - 360, window.innerHeight);

const camera = new THREE.PerspectiveCamera(50, (window.innerWidth - 360) / window.innerHeight, 0.01, 200);
camera.position.set(1.6, 1.4, 2.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xaad8ff, 0x161616, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(4, 5, 2);
scene.add(dir);

const grid = new THREE.GridHelper(20, 40, 0x28435c, 0x1b2838);
scene.add(grid);

const barrelGroup = new THREE.Group();
scene.add(barrelGroup);

const sphereGroup = new THREE.Group();
scene.add(sphereGroup);

const trailGroup = new THREE.Group();
scene.add(trailGroup);

let bodies = [];
let launched = false;
let accum = 0;
let lastTime = performance.now();
let metrics = [];

function getInputs() {
  return {
    fps: clamp(Number(ui.fps.value) || 60, 1, 30000),
    diameterIn: clamp(Number(ui.diameter.value) || 3, 1, 6),
    sphereSizeIn: clamp(Number(ui.sphereSize.value) || 0.25, 0.1, 1),
    spacingIn: clamp(Number(ui.spacing.value) || 0, 0, 0.25),
    rows: clamp(Math.floor(Number(ui.rows.value) || 1), 1, 250),
    layers: clamp(Math.floor(Number(ui.layers.value) || 1), 1, 250),
    speed: Number(ui.initialSpeed.value) || 200,
    density: Number(ui.density.value) || 7800
  };
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    child.material?.dispose();
    group.remove(child);
  }
}

function computeCountPerRing(radiusM, sphereDiameterM, spacingM) {
  const effective = sphereDiameterM + spacingM;
  return Math.max(3, Math.floor((2 * Math.PI * radiusM) / effective));
}

function buildPack() {
  clearGroup(barrelGroup);
  clearGroup(sphereGroup);
  clearGroup(trailGroup);
  bodies = [];
  launched = false;
  metrics = [];

  const config = getInputs();
  const cylRadius = inToM(config.diameterIn) / 2;
  const sphereD = inToM(config.sphereSizeIn);
  const sphereR = sphereD / 2;
  const spacing = inToM(config.spacingIn);

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(cylRadius, cylRadius, Math.max(0.3, config.rows * sphereD * 0.8), 64, 1, true),
    new THREE.MeshStandardMaterial({ color: '#4e5e6e', transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.z = -0.2;
  barrelGroup.add(tube);

  let total = 0;
  for (let l = 0; l < config.layers; l++) {
    const layerRadius = cylRadius - l * (sphereD + spacing);
    if (layerRadius < sphereR) break;
    const count = computeCountPerRing(layerRadius, sphereD, spacing);

    for (let r = 0; r < config.rows; r++) {
      const y = (r - (config.rows - 1) / 2) * (sphereD + spacing);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const x = Math.cos(a) * layerRadius;
        const z = Math.sin(a) * layerRadius - 0.2;

        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(sphereR, 20, 20),
          new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 - l * 0.08, 0.65, 0.55) })
        );
        mesh.position.set(x, y, z);

        sphereGroup.add(mesh);
        bodies.push({
          mesh,
          velocity: new THREE.Vector3(config.speed, 0, 0),
          launched: false,
          launchDelay: total * 0.0002
        });
        total += 1;
      }
    }

    if (l === 0) {
      ui.sphereCountOut.textContent = `Sphere count / row: ${count}`;
    }
  }

  ui.totalOut.textContent = `Total spheres: ${total}`;
  populateSpeedTable(config.speed, config.density, inToM(config.sphereSizeIn));
}

function simulateSpeedAtDistance(v0, distance, density, sphereDiameterM) {
  const c = 0.5;
  const area = Math.PI * Math.pow(sphereDiameterM / 2, 2);
  const k = (c * area) / (density * Math.max(sphereDiameterM, 0.0001));
  let v = v0;
  let x = 0;
  const dt = 0.0005;
  while (x < distance && v > 0.01) {
    const drag = k * v * v;
    v -= drag * dt;
    x += v * dt;
  }
  return Math.max(v, 0);
}

function populateSpeedTable(v0, density, sphereDiameterM) {
  const distances = [1, 5, 10, 15];
  metrics = distances.map((d) => {
    const v = simulateSpeedAtDistance(v0, d, density, sphereDiameterM);
    return { distance: d, speed: v, retained: (v / v0) * 100 };
  });

  ui.speedTable.innerHTML = metrics
    .map((m) => `<tr><td>${m.distance} m</td><td>${m.speed.toFixed(2)}</td><td>${m.retained.toFixed(1)}%</td></tr>`)
    .join('');
}

function launch() {
  launched = true;
}

function resetBodies() {
  buildPack();
}

function stepPhysics(dt) {
  if (!launched) return;
  const config = getInputs();
  const density = config.density;
  const gravity = -9.81;
  const dragCoeff = 0.08 / density;

  for (const body of bodies) {
    if (!body.launched) {
      body.launchDelay -= dt;
      if (body.launchDelay <= 0) body.launched = true;
      continue;
    }

    const v = body.velocity;
    const speed = v.length();
    const drag = v.clone().multiplyScalar(dragCoeff * speed);

    v.sub(drag.multiplyScalar(dt));
    v.y += gravity * dt * 0.2;

    body.mesh.position.addScaledVector(v, dt);

    if (Math.random() < 0.02) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.003, 6, 6),
        new THREE.MeshBasicMaterial({ color: '#8ec9ff' })
      );
      dot.position.copy(body.mesh.position);
      trailGroup.add(dot);
      if (trailGroup.children.length > 5000) {
        const old = trailGroup.children[0];
        old.geometry.dispose();
        old.material.dispose();
        trailGroup.remove(old);
      }
    }
  }
}

let mediaRecorder;
let chunks = [];

function recordVideo() {
  const stream = renderer.domElement.captureStream(60);
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectory-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };
  mediaRecorder.start();
  setTimeout(() => mediaRecorder.stop(), 8000);
}

function savePng() {
  const dataUrl = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `trajectory-${Date.now()}.png`;
  a.click();
}

function exportData() {
  const config = getInputs();
  const jsonBlob = new Blob([JSON.stringify({ config, metrics, createdAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const j = document.createElement('a');
  j.href = jsonUrl;
  j.download = 'trajectory-config-and-results.json';
  j.click();
  URL.revokeObjectURL(jsonUrl);

  const csvRows = ['distance_m,speed_mps,retained_percent', ...metrics.map((m) => `${m.distance},${m.speed.toFixed(4)},${m.retained.toFixed(2)}`)];
  const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const csvUrl = URL.createObjectURL(csvBlob);
  const c = document.createElement('a');
  c.href = csvUrl;
  c.download = 'trajectory-retained-speed.csv';
  c.click();
  URL.revokeObjectURL(csvUrl);
}

ui.buildBtn.addEventListener('click', buildPack);
ui.launchBtn.addEventListener('click', launch);
ui.resetBtn.addEventListener('click', resetBodies);
ui.recordBtn.addEventListener('click', recordVideo);
ui.snapshotBtn.addEventListener('click', savePng);
ui.exportBtn.addEventListener('click', exportData);

window.addEventListener('resize', () => {
  const width = window.innerWidth - 360;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

buildPack();

function animate(now) {
  requestAnimationFrame(animate);
  const config = getInputs();
  const step = 1 / config.fps;
  accum += (now - lastTime) / 1000;
  lastTime = now;

  const maxSubSteps = 10;
  let sub = 0;
  while (accum >= step && sub < maxSubSteps) {
    stepPhysics(step);
    accum -= step;
    sub += 1;
  }

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame((t) => {
  lastTime = t;
  animate(t);
});
