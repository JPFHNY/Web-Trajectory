import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/controls/OrbitControls.js';

const INCH_TO_M = 0.0254;
const FT_TO_M = 0.3048;
const AIR_DENSITY = 1.225;

const ui = {
  fps: document.getElementById('fps'),
  cylinderDiameter: document.getElementById('cylinderDiameter'),
  sphereDiameter: document.getElementById('sphereDiameter'),
  sphereSpacing: document.getElementById('sphereSpacing'),
  rows: document.getElementById('rows'),
  insetRows: document.getElementById('insetRows'),
  density: document.getElementById('density'),
  runBtn: document.getElementById('runBtn'),
  resetBtn: document.getElementById('resetBtn'),
  exportConfigBtn: document.getElementById('exportConfigBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  recordBtn: document.getElementById('recordBtn'),
  metrics: document.getElementById('metrics'),
};

const canvas = document.getElementById('sceneCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f1a);

const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
camera.position.set(0.2, 0.22, 0.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0.6);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xc8e6ff, 0x101010, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(1, 2, 1.2);
scene.add(dir);

const grid = new THREE.GridHelper(5, 40, 0x335577, 0x223344);
grid.position.z = 2;
scene.add(grid);

const axis = new THREE.AxesHelper(0.3);
scene.add(axis);

const launcherGroup = new THREE.Group();
scene.add(launcherGroup);

const shotGroup = new THREE.Group();
scene.add(shotGroup);

let simulation = null;
let csvData = 'distance_m,retained_speed_m_per_s\n';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function readConfig() {
  const fps = clamp(Number(ui.fps.value), 1, 30000);
  const cylinderDiameterIn = clamp(Number(ui.cylinderDiameter.value), 1, 6);
  const sphereDiameterIn = clamp(Number(ui.sphereDiameter.value), 0.1, 1);
  const spacingIn = clamp(Number(ui.sphereSpacing.value), 0, 0.25);
  const rows = clamp(Math.round(Number(ui.rows.value)), 1, 250);
  const insetRows = clamp(Math.round(Number(ui.insetRows.value)), 1, 250);
  const density = Number(ui.density.value);

  ui.fps.value = fps;
  ui.cylinderDiameter.value = cylinderDiameterIn;
  ui.sphereDiameter.value = sphereDiameterIn;
  ui.sphereSpacing.value = spacingIn;
  ui.rows.value = rows;
  ui.insetRows.value = insetRows;

  return { fps, cylinderDiameterIn, sphereDiameterIn, spacingIn, rows, insetRows, density };
}

function retainedSpeedAtDistance(v0, distanceM, sphereDiameterM, materialDensity) {
  const cd = 0.47;
  const area = Math.PI * (sphereDiameterM * 0.5) ** 2;
  const mass = materialDensity * (4 / 3) * Math.PI * (sphereDiameterM * 0.5) ** 3;
  const k = (0.5 * AIR_DENSITY * cd * area) / mass;
  return v0 * Math.exp(-k * distanceM);
}

function buildLauncher(config) {
  launcherGroup.clear();

  const cylinderRadiusM = (config.cylinderDiameterIn * INCH_TO_M) / 2;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(cylinderRadiusM, cylinderRadiusM, 0.2, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x6a7f93, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.1;
  launcherGroup.add(barrel);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(cylinderRadiusM, 0.003, 14, 64),
    new THREE.MeshStandardMaterial({ color: 0xbfd8ee, metalness: 0.3, roughness: 0.5 })
  );
  ring.position.z = 0;
  launcherGroup.add(ring);
}

function createShots(config) {
  shotGroup.clear();

  const sphereDiameterM = config.sphereDiameterIn * INCH_TO_M;
  const spacingM = config.spacingIn * INCH_TO_M;
  const cylinderRadiusM = (config.cylinderDiameterIn * INCH_TO_M) / 2;

  const sphereGeom = new THREE.SphereGeometry(sphereDiameterM / 2, 18, 18);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffb86c, metalness: 0.2, roughness: 0.25 });

  const perLayer = [];
  const particles = [];
  for (let layer = 0; layer < config.insetRows; layer += 1) {
    const radius = cylinderRadiusM - sphereDiameterM / 2 - layer * (sphereDiameterM + spacingM);
    if (radius <= 0) break;
    const circumference = 2 * Math.PI * radius;
    const sphereCount = Math.max(1, Math.floor(circumference / (sphereDiameterM + spacingM)));
    perLayer.push(sphereCount);

    for (let r = 0; r < config.rows; r += 1) {
      const y = (r - (config.rows - 1) / 2) * (sphereDiameterM + spacingM);
      for (let i = 0; i < sphereCount; i += 1) {
        const angle = (i / sphereCount) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z0 = Math.sin(angle) * radius;
        const mesh = new THREE.Mesh(sphereGeom, sphereMat);
        mesh.position.set(x, y, z0);
        shotGroup.add(mesh);

        particles.push({
          mesh,
          start: new THREE.Vector3(x, y, z0),
          offsetVel: new THREE.Vector3(x, y * 0.2, z0).normalize().multiplyScalar(0.03),
        });
      }
    }
  }

  return { particles, perLayer };
}

function runSimulation() {
  const config = readConfig();
  buildLauncher(config);

  const v0 = config.fps * FT_TO_M;
  const sphereDiameterM = config.sphereDiameterIn * INCH_TO_M;

  const { particles, perLayer } = createShots(config);
  const distances = [1, 5, 10, 15];
  const retained = distances.map((d) => retainedSpeedAtDistance(v0, d, sphereDiameterM, config.density));

  csvData = 'distance_m,retained_speed_m_per_s\n' + distances.map((d, i) => `${d},${retained[i].toFixed(4)}`).join('\n');

  simulation = {
    config,
    particles,
    v0,
    dragK: (0.5 * AIR_DENSITY * 0.47 * Math.PI * (sphereDiameterM / 2) ** 2) /
      (config.density * (4 / 3) * Math.PI * (sphereDiameterM / 2) ** 3),
    startTime: performance.now(),
  };

  const layerText = perLayer.length ? perLayer.map((c, i) => `L${i + 1}:${c}`).join(', ') : 'No valid layers';
  const totalPerRing = perLayer.reduce((a, b) => a + b, 0);
  const totalSpheres = totalPerRing * config.rows;

  ui.metrics.innerHTML = `
    <strong>Sphere counts</strong><br>
    Per inset layer around diameter: ${layerText}<br>
    Total per vertical row set: ${totalPerRing}<br>
    Total spheres (rows × layers): ${totalSpheres}<br><br>
    <strong>Retained speeds</strong><br>
    1m: ${retained[0].toFixed(2)} m/s (${(retained[0] / FT_TO_M).toFixed(1)} fps)<br>
    5m: ${retained[1].toFixed(2)} m/s (${(retained[1] / FT_TO_M).toFixed(1)} fps)<br>
    10m: ${retained[2].toFixed(2)} m/s (${(retained[2] / FT_TO_M).toFixed(1)} fps)<br>
    15m: ${retained[3].toFixed(2)} m/s (${(retained[3] / FT_TO_M).toFixed(1)} fps)
  `;
}

let recorder = null;
let recordedChunks = [];
function toggleRecording() {
  if (!recorder || recorder.state === 'inactive') {
    const stream = canvas.captureStream(60);
    recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    recordedChunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trajectory-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    recorder.start();
    ui.recordBtn.textContent = 'Stop recording';
  } else {
    recorder.stop();
    ui.recordBtn.textContent = 'Record animation (WebM)';
  }
}

function exportConfig() {
  const data = JSON.stringify(readConfig(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trajectory-config-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const blob = new Blob([csvData], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `retained-speeds-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

ui.runBtn.addEventListener('click', runSimulation);
ui.resetBtn.addEventListener('click', () => {
  camera.position.set(0.2, 0.22, 0.8);
  controls.target.set(0, 0, 0.6);
  controls.update();
});
ui.exportConfigBtn.addEventListener('click', exportConfig);
ui.exportCsvBtn.addEventListener('click', exportCsv);
ui.recordBtn.addEventListener('click', toggleRecording);

window.addEventListener('resize', () => {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
});

function animate(now) {
  requestAnimationFrame(animate);
  controls.update();

  if (simulation) {
    const t = (now - simulation.startTime) / 1000;
    const v = simulation.v0 * Math.exp(-simulation.dragK * t * simulation.v0 * 0.4);

    for (const p of simulation.particles) {
      const travel = (simulation.v0 / simulation.dragK) * (1 - Math.exp(-simulation.dragK * t));
      p.mesh.position.x = p.start.x + p.offsetVel.x * t;
      p.mesh.position.y = p.start.y + p.offsetVel.y * t;
      p.mesh.position.z = p.start.z + travel + p.offsetVel.z * t;
    }

    if (simulation.particles.length > 0) {
      const hue = THREE.MathUtils.clamp((v / simulation.v0) * 0.2, 0.02, 0.2);
      simulation.particles[0].mesh.material.color.setHSL(hue, 0.9, 0.6);
    }
  }

  renderer.render(scene, camera);
}

runSimulation();
animate(performance.now());
