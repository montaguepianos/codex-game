import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const scoreEl = document.getElementById('scoreValue');
const bestEl = document.getElementById('bestValue');
const statusEl = document.getElementById('statusMessage');
const healthValueEl = document.getElementById('healthValue');
const healthFillEl = document.getElementById('healthFill');
const overlayEl = document.getElementById('gameOverScreen');
const finalScoreEl = document.getElementById('finalScore');
const overlayBestEl = document.getElementById('overlayBest');
const playAgainBtn = document.getElementById('playAgainBtn');
const quitBtn = document.getElementById('quitBtn');
const fireButton = document.getElementById('fireButton');

const PLAY_AREA = {
  x: 6,
  yMin: -3,
  yMax: 3
};

const HEALTH = {
  max: 100,
  current: 100
};

function updateHealthUI() {
  const pct = (HEALTH.current / HEALTH.max) * 100;
  healthValueEl.textContent = `${Math.round(pct)}%`;
  healthFillEl.style.width = `${pct}%`;
  const gradient = pct < 35 ? ['#ff6b6b', '#ffa36e'] : ['#5af5a2', '#2ee6cf'];
  healthFillEl.style.background = `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`;
}

function changeHealth(delta) {
  HEALTH.current = THREE.MathUtils.clamp(HEALTH.current + delta, 0, HEALTH.max);
  updateHealthUI();
  return HEALTH.current;
}

function resetHealth() {
  HEALTH.current = HEALTH.max;
  updateHealthUI();
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03060d);
scene.fog = new THREE.Fog(0x030914, 18, 90);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, 1.4, 6.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.setClearColor(0x03060d, 1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const ambient = new THREE.AmbientLight(0x4c5575, 0.8);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xe8f0ff, 1.0);
dirLight.position.set(6, 7, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
scene.add(dirLight);

const shipGeometry = new THREE.ConeGeometry(0.4, 1.1, 16);
shipGeometry.rotateX(Math.PI / 2);
const shipMaterial = new THREE.MeshStandardMaterial({
  color: 0x74f0ff,
  emissive: 0x0f223b,
  metalness: 0.35,
  roughness: 0.18
});
const player = new THREE.Mesh(shipGeometry, shipMaterial);
player.castShadow = true;
player.position.set(0, 0.3, 0);
scene.add(player);

const shieldRing = new THREE.TorusGeometry(0.48, 0.05, 12, 48);
const shieldMaterial = new THREE.MeshStandardMaterial({
  color: 0x3dd6ff,
  emissive: 0x082433,
  transparent: true,
  opacity: 0.65
});
const playerShield = new THREE.Mesh(shieldRing, shieldMaterial);
playerShield.rotation.x = Math.PI / 2;
playerShield.position.set(0, 0.4, -0.15);
player.add(playerShield);

let score = 0;
let bestScore = Number(window.localStorage.getItem('codexRunnerBest') || 0);
let pickupsCollected = 0;
let runOriginZ = player.position.z;
let statusTimer = 4;
bestEl.textContent = bestScore.toString();
updateHealthUI();

const state = {
  forwardSpeed: 12,
  baseSpeed: 12,
  maxSpeed: 22,
  crashFx: 0,
  speedBoost: 0
};

const clock = new THREE.Clock();

const stars = (() => {
  const starGeometry = new THREE.BufferGeometry();
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = Math.random() * 18 - 4;
    positions[i * 3 + 2] = -Math.random() * 280;
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, opacity: 0.8, transparent: true });
  const points = new THREE.Points(starGeometry, starMaterial);
  scene.add(points);
  return points;
})();

const nebula = (() => {
  const geometry = new THREE.SphereGeometry(20, 32, 32);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      float noise(vec2 p){
        return fract(sin(dot(p, vec2(12.9898, 4.1414))) * 43758.5453);
      }
      void main() {
        float n = noise(vUv * 8.0 + time * 0.05);
        float glow = smoothstep(0.2, 1.0, n);
        gl_FragColor = vec4(vec3(0.02, 0.09, 0.16) + glow * vec3(0.04, 0.12, 0.3), 0.35 * glow);
      }
    `
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(-1, 1, 1);
  scene.add(mesh);
  return mesh;
})();

const obstacles = [];
const pickups = [];
const burstParticles = [];
const lasers = [];
let nextObstacleZ = -18;
let nextPickupZ = -12;
const lastObstaclePosition = new THREE.Vector2(999, 999);
let isGamePaused = false;

const burstGeometry = new THREE.SphereGeometry(0.055, 6, 6);
const laserGeometry = new THREE.CylinderGeometry(0.12, 0.3, 8, 12, 1, true);
laserGeometry.rotateX(Math.PI / 2);
const LASER = {
  length: 16,
  width: 1.6,
  height: 1.3,
  ttl: 0.23,
  cooldown: 0.4
};
const baseLaserMaterial = new THREE.MeshBasicMaterial({
  color: 0x7df9ff,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending
});
let lastLaserTime = -Infinity;

function clearEntities() {
  obstacles.forEach((o) => scene.remove(o));
  pickups.forEach((p) => scene.remove(p));
  burstParticles.forEach((b) => {
    scene.remove(b.mesh);
    b.material.dispose();
  });
  lasers.forEach((beam) => {
    scene.remove(beam);
    beam.material.dispose();
  });
  obstacles.length = 0;
  pickups.length = 0;
  burstParticles.length = 0;
  lasers.length = 0;
}

function showGameOver(finalScore) {
  isGamePaused = true;
  input.pointerActive = false;
  input.keys = {};
  finalScoreEl.textContent = finalScore.toString();
  overlayBestEl.textContent = bestScore.toString();
  overlayEl.classList.add('overlay--visible');
}

function hideGameOver() {
  overlayEl.classList.remove('overlay--visible');
}

function restartRun() {
  hideGameOver();
  clearEntities();
  score = 0;
  pickupsCollected = 0;
  player.position.set(0, 0.3, 0);
  runOriginZ = player.position.z;
  player.rotation.set(0, 0, 0);
  state.forwardSpeed = state.baseSpeed;
  state.speedBoost = 0;
  state.crashFx = 0;
  input.pointerActive = false;
  input.keys = {};
  resetHealth();
  updateScoreboard();
  statusEl.textContent = 'Drag, tap, or use arrows to drift through the asteroid field.';
  statusTimer = 3;
  nextObstacleZ = player.position.z - 20;
  nextPickupZ = player.position.z - 12;
  lastObstaclePosition.set(999, 999);
  isGamePaused = false;
}

playAgainBtn?.addEventListener('click', () => {
  resumeAudio();
  restartRun();
});
quitBtn?.addEventListener('click', () => {
  resumeAudio();
  window.location.reload();
});

function spawnBurst(position, color = 0xfff0a1) {
  for (let i = 0; i < 16; i++) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(burstGeometry, material);
    mesh.position.copy(position);
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      Math.random() * 1.2,
      (Math.random() - 0.5) * 2
    );
    const life = 0.65 + Math.random() * 0.35;
    burstParticles.push({ mesh, velocity, life, ttl: life, material });
    scene.add(mesh);
  }
}

function destroyObstacleAtIndex(index, burstColor = 0xfff0a1) {
  const obstacle = obstacles[index];
  if (!obstacle) return;
  spawnBurst(obstacle.position.clone(), burstColor);
  scene.remove(obstacle);
  obstacle.geometry?.dispose?.();
  obstacle.material?.dispose?.();
  obstacles.splice(index, 1);
}

function updateBursts(delta) {
  for (let i = burstParticles.length - 1; i >= 0; i--) {
    const p = burstParticles[i];
    p.life -= delta;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.material.dispose();
      burstParticles.splice(i, 1);
    } else {
      const fade = p.life / p.ttl;
      p.mesh.position.addScaledVector(p.velocity, delta * 4);
      p.material.opacity = fade;
    }
  }
}

function randomInPlayArea() {
  return {
    x: THREE.MathUtils.randFloatSpread(PLAY_AREA.x * 2),
    y: THREE.MathUtils.randFloat(PLAY_AREA.yMin, PLAY_AREA.yMax)
  };
}

function spawnObstacle(z) {
  const size = 0.5 + Math.random() * 1.3;
  const geometry = new THREE.IcosahedronGeometry(size, 0);
  geometry.verticesNeedUpdate = true;
  const color = new THREE.Color().setHSL(THREE.MathUtils.randFloat(0.58, 0.68), 0.35, 0.45);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: 0x08101f,
    metalness: 0.15,
    roughness: 0.75
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  let pos = randomInPlayArea();
  for (let i = 0; i < 4; i++) {
    const distSq = lastObstaclePosition.distanceToSquared(new THREE.Vector2(pos.x, pos.y));
    if (distSq > 2.2) break;
    pos = randomInPlayArea();
  }
  lastObstaclePosition.set(pos.x, pos.y);
  mesh.position.set(pos.x, pos.y, z);
  mesh.rotationSpeed = new THREE.Vector3(Math.random() * 0.3, Math.random() * 0.4, Math.random() * 0.2);
  scene.add(mesh);
  obstacles.push(mesh);
}

function spawnPickup(z) {
  const kind = Math.random() < 0.28 ? 'heal' : 'speed';
  const geometry = new THREE.SphereGeometry(0.28, 16, 12);
  const color = kind === 'heal' ? 0x7dfff2 : 0xfff38e;
  const emissive = kind === 'heal' ? 0x154240 : 0x30220d;
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.7,
    metalness: 0.1,
    roughness: 0.2
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  const pos = randomInPlayArea();
  mesh.position.set(pos.x, THREE.MathUtils.clamp(pos.y, PLAY_AREA.yMin * 0.8, PLAY_AREA.yMax * 0.8), z);
  mesh.userData.kind = kind;
  scene.add(mesh);
  pickups.push(mesh);
}

const input = {
  pointerActive: false,
  pointerX: 0,
  pointerY: 0,
  keys: {}
};

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const nx = (event.clientX - rect.left) / rect.width;
  const ny = (event.clientY - rect.top) / rect.height;
  input.pointerX = THREE.MathUtils.clamp((nx - 0.5) * PLAY_AREA.x * 2, -PLAY_AREA.x, PLAY_AREA.x);
  input.pointerY = THREE.MathUtils.clamp(
    THREE.MathUtils.mapLinear(1 - ny, 0, 1, PLAY_AREA.yMin, PLAY_AREA.yMax),
    PLAY_AREA.yMin,
    PLAY_AREA.yMax
  );
}

window.addEventListener('pointerdown', (event) => {
  input.pointerActive = true;
  updatePointer(event);
  resumeAudio();
});
window.addEventListener('pointermove', (event) => {
  if (input.pointerActive) {
    updatePointer(event);
  }
});
window.addEventListener('pointerup', () => {
  input.pointerActive = false;
});
window.addEventListener('pointerleave', () => {
  input.pointerActive = false;
});

fireButton?.addEventListener('pointerdown', (event) => {
  event.stopPropagation();
  requestLaserFire();
});
fireButton?.addEventListener('pointerup', (event) => {
  event.stopPropagation();
});

window.addEventListener('keydown', (event) => {
  input.keys[event.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === 'Space') {
    requestLaserFire();
  }
  resumeAudio();
});
window.addEventListener('keyup', (event) => {
  input.keys[event.code] = false;
});

const AudioContextClass = window.AudioContext || window.webkitAudioContext || null;
let audioContext = null;
let audioUnlocked = false;

function resumeAudio() {
  if (!AudioContextClass || audioUnlocked) return;
  if (!audioContext) {
    try {
      audioContext = new AudioContextClass();
    } catch (err) {
      console.warn('AudioContext init failed', err);
      return;
    }
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  audioUnlocked = audioContext.state === 'running';
}

function playTone(frequency, duration, type = 'sine', gainValue = 0.18) {
  if (!audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(gainValue, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function requestLaserFire() {
  if (isGamePaused) return;
  resumeAudio();
  fireLaser();
}

function fireLaser() {
  const now = clock.getElapsedTime();
  if (now - lastLaserTime < LASER.cooldown) return;
  lastLaserTime = now;
  const beamMaterial = baseLaserMaterial.clone();
  const beam = new THREE.Mesh(laserGeometry, beamMaterial);
  const scaleFactor = LASER.length / 8;
  beam.scale.set(1, 1, scaleFactor);
  beam.position.copy(player.position);
  beam.position.z -= (LASER.length / 2) + 0.5;
  beam.userData.ttl = LASER.ttl;
  scene.add(beam);
  lasers.push(beam);
  carveObstaclesWithLaser(player.position);
  playTone(980, 0.12, 'square', 0.2);
  playTone(320, 0.18, 'sawtooth', 0.12);
  statusEl.textContent = 'Laser burst engaged!';
  statusTimer = 1.6;
}

function carveObstaclesWithLaser(origin) {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obstacle = obstacles[i];
    if (
      obstacle.position.z < origin.z - 0.4 &&
      obstacle.position.z > origin.z - LASER.length - 1
    ) {
      const dx = obstacle.position.x - origin.x;
      const dy = obstacle.position.y - origin.y;
      if (Math.abs(dx) <= LASER.width && Math.abs(dy) <= LASER.height) {
        destroyObstacleAtIndex(i, 0x7df9ff);
      }
    }
  }
}

function updateLasers(delta) {
  for (let i = lasers.length - 1; i >= 0; i--) {
    const beam = lasers[i];
    beam.userData.ttl -= delta;
    const lifeRatio = Math.max(beam.userData.ttl / LASER.ttl, 0);
    beam.material.opacity = 0.85 * lifeRatio;
    if (beam.userData.ttl <= 0) {
      scene.remove(beam);
      beam.material.dispose();
      lasers.splice(i, 1);
    }
  }
}

function desiredX() {
  if (input.pointerActive) return input.pointerX;
  let dir = 0;
  if (input.keys.ArrowLeft || input.keys.KeyA) dir -= 1;
  if (input.keys.ArrowRight || input.keys.KeyD) dir += 1;
  return dir * PLAY_AREA.x * 0.7;
}

function desiredY() {
  if (input.pointerActive) return input.pointerY;
  let dir = 0;
  if (input.keys.ArrowUp || input.keys.KeyW) dir += 1;
  if (input.keys.ArrowDown || input.keys.KeyS) dir -= 1;
  return THREE.MathUtils.clamp(dir * PLAY_AREA.yMax * 0.6, PLAY_AREA.yMin, PLAY_AREA.yMax);
}

function ensureHazards() {
  while (nextObstacleZ > player.position.z - 120) {
    spawnObstacle(nextObstacleZ);
    nextObstacleZ -= 8 + Math.random() * 7;
  }
  while (nextPickupZ > player.position.z - 80) {
    if (pickups.length < 16) {
      spawnPickup(nextPickupZ - Math.random() * 8);
      if (pickups.length < 16) {
        spawnPickup(nextPickupZ - Math.random() * 8 - 2);
      }
    }
    nextPickupZ -= 12 + Math.random() * 6;
  }
}

const playerBox = new THREE.Box3();
const tempBox = new THREE.Box3();

function updateObstacles(delta) {
  playerBox.setFromObject(player);
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obstacle = obstacles[i];
    obstacle.rotation.x += obstacle.rotationSpeed.x * delta;
    obstacle.rotation.y += obstacle.rotationSpeed.y * delta;
    obstacle.rotation.z += obstacle.rotationSpeed.z * delta;
    tempBox.setFromObject(obstacle);
    if (playerBox.intersectsBox(tempBox)) {
      registerImpact();
      destroyObstacleAtIndex(i, 0xff4f70);
      continue;
    }
    if (obstacle.position.z > player.position.z + 5) {
      destroyObstacleAtIndex(i);
    }
  }
}

function updatePickups(delta) {
  playerBox.setFromObject(player);
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.rotation.y += delta * 1.4;
    pickup.position.y += Math.sin(performance.now() * 0.001 + pickup.position.z) * 0.0008;
    tempBox.setFromObject(pickup);
    if (playerBox.intersectsBox(tempBox)) {
      pickupsCollected += 1;
      const kind = pickup.userData.kind || 'speed';
      const burstColor = kind === 'heal' ? 0x90fff4 : 0xfff2a8;
      spawnBurst(pickup.position.clone(), burstColor);
      if (kind === 'heal') {
        changeHealth(25);
        statusEl.textContent = 'Nanite canister acquired. Hull integrity recovering.';
        playTone(420, 0.22, 'sine', 0.18);
      } else {
        playTone(660, 0.18, 'triangle', 0.22);
        statusEl.textContent = 'Energy orb collected! Engines supercharged.';
        state.speedBoost = Math.min(state.speedBoost + 0.6, 2.2);
      }
      scene.remove(pickup);
      pickups.splice(i, 1);
      statusTimer = 3.5;
      continue;
    }
    if (pickup.position.z > player.position.z + 5) {
      scene.remove(pickup);
      pickups.splice(i, 1);
    }
  }
}

function registerImpact() {
  if (isGamePaused) return;
  const damage = THREE.MathUtils.randInt(24, 38);
  const remaining = changeHealth(-damage);
  spawnBurst(player.position.clone(), 0xff4f70);
  playTone(200, 0.25, 'sawtooth', 0.2);
  state.crashFx = 1;
  statusEl.textContent = remaining <= 0
    ? 'Hull integrity failure! Rebooting systems...'
    : `Hull hit! Integrity at ${Math.round((remaining / HEALTH.max) * 100)}%.`;
  statusTimer = 4;
  if (remaining <= 0) {
    handleDeath();
  }
}

function handleDeath() {
  const finalScore = score;
  if (finalScore > bestScore) {
    bestScore = finalScore;
    window.localStorage.setItem('codexRunnerBest', String(bestScore));
    bestEl.textContent = bestScore.toString();
  }
  state.forwardSpeed = 0;
  state.speedBoost = 0;
  state.crashFx = 1;
  showGameOver(finalScore);
}

function updateScoreboard() {
  const distanceScore = Math.max(0, (runOriginZ - player.position.z) * 4.2);
  score = Math.floor(distanceScore + pickupsCollected * 50);
  scoreEl.textContent = score.toString();
  if (score > bestScore) {
    bestScore = score;
    bestEl.textContent = bestScore.toString();
    window.localStorage.setItem('codexRunnerBest', String(bestScore));
  }
}

function updateStatus(delta) {
  if (statusTimer > 0) {
    statusTimer -= delta;
    if (statusTimer <= 0) {
      statusEl.textContent = 'Drag, tap, or use arrows to weave through the asteroid field.';
    }
  }
}

function updateCamera(delta) {
  const desiredCamX = player.position.x * 0.35;
  camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamX, 1.4, delta);
  const desiredCamY = 1.6 + player.position.y * 0.3;
  camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamY, 2.2, delta);
  const desiredCamZ = player.position.z + 5.5;
  camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamZ, 2.5, delta);
  camera.lookAt(player.position.x, player.position.y + 0.3, player.position.z - 4);
}

function updatePlayer(delta) {
  const targetX = desiredX();
  const targetY = desiredY();
  player.position.x = THREE.MathUtils.damp(player.position.x, targetX, 6, delta);
  player.position.y = THREE.MathUtils.damp(player.position.y, targetY, 4, delta);
  player.position.x = THREE.MathUtils.clamp(player.position.x, -PLAY_AREA.x, PLAY_AREA.x);
  player.position.y = THREE.MathUtils.clamp(player.position.y, PLAY_AREA.yMin, PLAY_AREA.yMax);
  player.position.z -= state.forwardSpeed * delta;
  player.rotation.z = THREE.MathUtils.damp(player.rotation.z, -player.position.x * 0.1, 8, delta);
  player.rotation.y = THREE.MathUtils.damp(player.rotation.y, player.position.x * 0.02, 4, delta);
  playerShield.material.opacity = 0.55 + Math.sin(performance.now() * 0.004) * 0.15;
}

function updateStars() {
  stars.position.z = (player.position.z % 60) * 0.2;
}

function updateCrashFx(delta) {
  if (state.crashFx > 0) {
    state.crashFx = Math.max(0, state.crashFx - delta * 2.5);
    renderer.setClearColor(0x120109, 1);
  } else {
    renderer.setClearColor(0x03060d, 1);
  }
}

function update() {
  const delta = Math.min(0.12, clock.getDelta());
  nebula.material.uniforms.time.value += delta;
  if (!isGamePaused) {
    state.speedBoost = Math.max(0, state.speedBoost - delta * 0.8);
    const targetSpeed = state.baseSpeed + state.speedBoost * 3;
    state.forwardSpeed = THREE.MathUtils.damp(state.forwardSpeed, Math.min(targetSpeed, state.maxSpeed), 1.2, delta);
    updatePlayer(delta);
    ensureHazards();
    updateObstacles(delta);
    updatePickups(delta);
    updateScoreboard();
    updateStatus(delta);
  }
  updateCamera(delta);
  updateCrashFx(delta);
  updateBursts(delta);
  updateLasers(delta);
  updateStars();
  renderer.render(scene, camera);
  requestAnimationFrame(update);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

update();
