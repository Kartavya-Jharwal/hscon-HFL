// ─────────────────────────────────────────────────────────────────────────────
// CLOSE THE LOOP — paper toss
// Flick a black paper cup into the green square recycling bin.
// Render: three.js  ·  Physics: cannon-es  ·  Audio: procedural WebAudio
// Units are metres. 1 unit = 1 m.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Sfx } from "./sfx";

export type PtPhase = "ready" | "aiming" | "flight" | "scored" | "miss";

export interface PtState {
  phase: PtPhase;
  score: number;
  best: number;
}

export interface PtHooks {
  onState: (s: PtState) => void;
  onMessage: (text: string, kind: "info" | "good" | "bad") => void;
}

export interface PtApi {
  destroy: () => void;
  reset: () => void;
}

const CFG = {
  gravity: 8.0,
  rimY: 0.85, // the real campus bin is tall
  binX: 0,
  binZ: -0.15, // bin pulled 2/3 closer — short gentle dunks, no long-range bombing
  binHalf: 0.2, // 0.40 m square footprint, matching the photo proportions
  wallT: 0.045,
  binH: 0.85,
  cupR: 0.06, // physics sphere for the paper cup
  spawn: { x: 0, y: 0.36, z: 0.59 }, // 0.74 m gap to the bin centre = 1/3 of the old distance
  levitateY: 0.3,
  powerRef: 1.5, // px/ms of upward flick = full power
  vUpBase: 3.0,
  vUpGain: 1.6,
  latGain: 0.85,
  latMax: 1.1,
  damping: 0.08,
};

// Horizontal launch speed so the cup crosses the rim plane while descending,
// just in front of the bin centre, for any flick strength. Derived straight
// from the projectile equations (spawn height -> rim height) instead of a
// calibrated table, so it stays exact for the new, much closer bin.
function fwdFor(vUp: number): number {
  const dy = CFG.binH - CFG.levitateY;
  const disc = vUp * vUp - 2 * CFG.gravity * dy;
  const tDesc = disc > 0 ? (vUp + Math.sqrt(disc)) / CFG.gravity : 0.4;
  const zCross = CFG.binZ + CFG.binHalf * 0.15;
  return Math.max(0.3, (CFG.spawn.z - zCross) / tDesc);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A clean paper cup: tapered wall + bottom, like the black cups in the photos. */
function buildCupMesh(tex: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const wallGeo = new THREE.CylinderGeometry(0.074, 0.052, 0.132, 30, 1, true);
  const wall = new THREE.Mesh(wallGeo, mat);
  wall.castShadow = true;
  const bottomGeo = new THREE.CircleGeometry(0.052, 24);
  const bottom = new THREE.Mesh(bottomGeo, mat);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.065;
  group.add(wall, bottom);
  return group;
}

export function createPaperToss(container: HTMLElement, hooks: PtHooks): PtApi {
  const sfx = new Sfx();
  const disposables: { dispose: () => void }[] = [];
  const isSmall = Math.min(window.innerWidth, window.innerHeight) < 720;

  // ── Renderer / scene / camera ──────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.75 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f7f4);
  scene.fog = new THREE.Fog(0xf7f7f4, 9, 24);

  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 60);
  const camBase = new THREE.Vector3(0, 1.5, 2.2);
  camera.position.copy(camBase);
  camera.lookAt(0, 0.42, -0.15);

  // ── Textures ───────────────────────────────────────────────────────────────
  const loader = new THREE.TextureLoader();
  const loadTex = (url: string, repeat?: [number, number]) => {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
  };
  const binTex = loadTex("../textures/bin-loop.png");
  const binPhotoTex = loadTex("../textures/bin-photo.png");
  const cupTex = loadTex("../textures/cup-black.png");
  const floorTex = loadTex("../textures/floor-wood.png", [7, 7]);
  const backdropTex = loadTex("../textures/backdrop.png", [5, 2]);

  // ── Lights ─────────────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe0d2, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(3, 6, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe6f6ea, 0.8);
  fill.position.set(-4, 3, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbdeecb, 0.9);
  rim.position.set(0, 2.5, -5);
  scene.add(rim);

  // ── Studio set: pale oak floor + white brick wall ─────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.02 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  disposables.push(floorMat, floor.geometry);

  const backdropMat = new THREE.MeshBasicMaterial({ map: backdropTex });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), backdropMat);
  backdrop.position.set(0, 5.4, -9.5);
  scene.add(backdrop);
  disposables.push(backdropMat, backdrop.geometry);

  // ── Physics world ──────────────────────────────────────────────────────────
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -CFG.gravity, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;

  const matWorld = new CANNON.Material("world");
  const matCup = new CANNON.Material("cup");
  world.addContactMaterial(
    new CANNON.ContactMaterial(matWorld, matCup, { friction: 0.42, restitution: 0.42 })
  );

  const BX = CFG.binX;
  const BZ = CFG.binZ;
  const HALF = CFG.binHalf;
  const T = CFG.wallT;
  const H = CFG.binH;

  const groundBody = new CANNON.Body({
    mass: 0,
    material: matWorld,
    shape: new CANNON.Box(new CANNON.Vec3(15, 0.05, 15)),
    position: new CANNON.Vec3(0, -0.05, 0),
  });
  world.addBody(groundBody);

  const binFloorBody = new CANNON.Body({
    mass: 0,
    material: matWorld,
    shape: new CANNON.Box(new CANNON.Vec3(HALF, 0.015, HALF)),
    position: new CANNON.Vec3(BX, 0.015, BZ),
  });
  world.addBody(binFloorBody);

  type Outward = "px" | "nx" | "pz" | "nz";
  const binOuterMat = new THREE.MeshStandardMaterial({ map: binTex, roughness: 0.55, metalness: 0.12 });
  const binInnerMat = new THREE.MeshStandardMaterial({ color: 0x116648, roughness: 0.8, metalness: 0.05 });
  const binSideMat = new THREE.MeshStandardMaterial({ color: 0x158366, roughness: 0.6, metalness: 0.1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x0f5f4a, roughness: 0.5, metalness: 0.15 });
  disposables.push(binOuterMat, binInnerMat, binSideMat, rimMat);

  function addWall(w: number, h: number, d: number, x: number, y: number, z: number, outward: Outward) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mats: THREE.MeshStandardMaterial[] = [];
    const opposite: Record<Outward, Outward> = { px: "nx", nx: "px", pz: "nz", nz: "pz" };
    const faceList = ["px", "nx", "py", "ny", "pz", "nz"] as const;
    for (const face of faceList) {
      if (face === outward) mats.push(binOuterMat);
      else if (face === opposite[outward]) mats.push(binInnerMat);
      else if (face === "py" || face === "ny") mats.push(binInnerMat);
      else mats.push(binSideMat);
    }
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = new CANNON.Body({
      mass: 0,
      material: matWorld,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
      position: new CANNON.Vec3(x, y, z),
    });
    world.addBody(body);
    disposables.push(geo);
  }
  // north / south walls span full width, east / west walls fill between
  addWall(HALF * 2, H, T, BX, H / 2, BZ - (HALF - T / 2), "nz");
  addWall(HALF * 2, H, T, BX, H / 2, BZ + (HALF - T / 2), "pz");
  addWall(T, H, HALF * 2 - T * 2, BX - (HALF - T / 2), H / 2, BZ, "nx");
  addWall(T, H, HALF * 2 - T * 2, BX + (HALF - T / 2), H / 2, BZ, "px");

  // the real campus bin photo, laid flat on top of the 3D model — a textured
  // plane covering the front face while the open mouth stays 3D behind it
  const BIN_PHOTO_ASPECT = 278 / 598; // px of public/textures/bin-photo.png
  const photoH = H;
  const photoW = photoH * BIN_PHOTO_ASPECT;
  const photoMat = new THREE.MeshBasicMaterial({
    map: binPhotoTex,
    transparent: true,
    alphaTest: 0.02,
    toneMapped: false, // keep the photo's true colours
  });
  const binPhotoPlane = new THREE.Mesh(new THREE.PlaneGeometry(photoW, photoH), photoMat);
  binPhotoPlane.position.set(BX, photoH / 2, BZ + HALF + 0.012);
  binPhotoPlane.renderOrder = 2;
  scene.add(binPhotoPlane);
  disposables.push(photoMat, binPhotoPlane.geometry);

  // visual bin floor slab + rim lips
  const slabGeo = new THREE.BoxGeometry(HALF * 2, 0.03, HALF * 2);
  const slab = new THREE.Mesh(slabGeo, binInnerMat);
  slab.position.set(BX, 0.015, BZ);
  slab.receiveShadow = true;
  scene.add(slab);
  disposables.push(slabGeo);
  const lipGeo = new THREE.BoxGeometry(HALF * 2 + 0.02, 0.02, 0.024);
  const lipGeo2 = new THREE.BoxGeometry(0.024, 0.02, HALF * 2 + 0.02);
  const lips: THREE.Mesh[] = [
    new THREE.Mesh(lipGeo, rimMat),
    new THREE.Mesh(lipGeo, rimMat),
    new THREE.Mesh(lipGeo2, rimMat),
    new THREE.Mesh(lipGeo2, rimMat),
  ];
  lips[0]!.position.set(BX, H + 0.007, BZ - HALF);
  lips[1]!.position.set(BX, H + 0.007, BZ + HALF);
  lips[2]!.position.set(BX - HALF, H + 0.007, BZ);
  lips[3]!.position.set(BX + HALF, H + 0.007, BZ);
  for (const lip of lips) {
    lip.castShadow = true;
    scene.add(lip);
  }
  disposables.push(lipGeo, lipGeo2);

  // invisible far walls so the cup never leaves the stage
  const bounds: [number, number, number, number][] = [
    [12, 0.5, 0, 6],
    [12, 0.5, 0, -8],
    [0.5, 14, 7, -1],
    [0.5, 14, -7, -1],
  ];
  for (const [w, d, x, z] of bounds) {
    const b = new CANNON.Body({
      mass: 0,
      material: matWorld,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, 2, d / 2)),
      position: new CANNON.Vec3(x, 2, z),
    });
    world.addBody(b);
  }

  // ── The paper cup ──────────────────────────────────────────────────────────
  const cupMesh = buildCupMesh(cupTex);
  scene.add(cupMesh);
  disposables.push(...cupMesh.children.map((c) => (c as THREE.Mesh).geometry));

  const cupBody = new CANNON.Body({
    mass: 0.02,
    type: CANNON.Body.KINEMATIC, // floats "in hand" until thrown
    material: matCup,
    shape: new CANNON.Sphere(CFG.cupR),
    position: new CANNON.Vec3(CFG.spawn.x, CFG.spawn.y, CFG.spawn.z),
    linearDamping: CFG.damping,
    angularDamping: 0.45,
    allowSleep: true,
    sleepSpeedLimit: 0.3,
    sleepTimeLimit: 0.5,
  });
  cupBody.angularVelocity.set(0.12, 0.18, -0.09);
  world.addBody(cupBody);

  // ── FX: trail + score burst ────────────────────────────────────────────────
  const TRAIL_N = 26;
  const trailPts: THREE.Vector3[] = [];
  const trailArr = new Float32Array(TRAIL_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(trailArr, 3).setUsage(THREE.DynamicDrawUsage)
  );
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.LineBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.26 });
  const trail = new THREE.Line(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  disposables.push(trailGeo, trailMat);

  const SHARDS = isSmall ? 22 : 36;
  const shardGeo = new THREE.PlaneGeometry(0.022, 0.028);
  const shardMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARDS);
  shards.frustumCulled = false;
  shards.visible = false;
  scene.add(shards);
  disposables.push(shardGeo, shardMat);
  const shardPos: THREE.Vector3[] = [];
  const shardVel: THREE.Vector3[] = [];
  const shardRot: THREE.Euler[] = [];
  let shardLife = 0;
  const dummy = new THREE.Object3D();

  // ── State ──────────────────────────────────────────────────────────────────
  let phase: PtPhase = "ready";
  let score = 0;
  let best = 0;
  try {
    best = Number(window.localStorage.getItem("ctl-best") || "0") || 0;
  } catch {
    best = 0;
  }
  let flightTime = 0;
  let restTimer = 0;
  let groundTime = 0;
  let scoredThisThrow = false;
  const samples: { t: number; x: number; y: number }[] = [];
  const respawnTimers = new Set<ReturnType<typeof setTimeout>>();
  let lastStateJson = "";

  function pushState() {
    const snap: PtState = { phase, score, best };
    const j = JSON.stringify(snap);
    if (j !== lastStateJson) {
      lastStateJson = j;
      hooks.onState(snap);
    }
  }
  pushState();

  // ── Throw physics ──────────────────────────────────────────────────────────
  function computeThrow(fUp: number, fLat: number) {
    const p = clamp(fUp / CFG.powerRef, 0, 1.08);
    const vUp = CFG.vUpBase + CFG.vUpGain * Math.pow(p, 0.85);
    const fwd = fwdFor(vUp);
    const lat = clamp(fLat * CFG.latGain, -CFG.latMax, CFG.latMax) * 0.85;
    cupBody.type = CANNON.Body.DYNAMIC;
    cupBody.wakeUp();
    cupBody.position.y = Math.max(cupBody.position.y, CFG.levitateY);
    cupBody.position.z = CFG.spawn.z;
    cupBody.velocity.set(lat, vUp, -fwd);
    cupBody.angularVelocity.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5);
    cupBody.aabbNeedsUpdate = true;
    phase = "flight";
    flightTime = 0;
    restTimer = 0;
    groundTime = 0;
    scoredThisThrow = false;
    trailPts.length = 0;
    sfx.throwWhoosh(clamp(p, 0.3, 1));
    pushState();
  }

  function respawnCup() {
    cupBody.type = CANNON.Body.KINEMATIC;
    cupBody.position.set(
      CFG.spawn.x + (Math.random() - 0.5) * 0.06,
      CFG.spawn.y,
      CFG.spawn.z + (Math.random() - 0.5) * 0.08
    );
    cupBody.quaternion.set(0, 0, 0, 1);
    cupBody.velocity.set(0, 0, 0);
    cupBody.angularVelocity.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3);
    cupBody.aabbNeedsUpdate = true;
    cupBody.wakeUp();
    phase = "ready";
    pushState();
  }

  function classify() {
    const p = cupBody.position;
    const inside =
      Math.abs(p.x - BX) < HALF - CFG.cupR * 0.6 &&
      Math.abs(p.z - BZ) < HALF - CFG.cupR * 0.6 &&
      p.y < CFG.rimY - 0.08;
    if (inside && !scoredThisThrow) {
      scoredThisThrow = true;
      phase = "scored";
      score += 1;
      if (score > best) {
        best = score;
        try {
          window.localStorage.setItem("ctl-best", String(best));
        } catch {
          /* storage unavailable */
        }
      }
      sfx.score();
      spawnBurst();
      if ("vibrate" in navigator) navigator.vibrate(25);
      hooks.onMessage("+1", "good");
      pushState();
    } else if (!scoredThisThrow) {
      phase = "miss";
      sfx.miss();
      pushState();
    } else {
      phase = "scored";
    }
    const t = setTimeout(
      () => {
        respawnTimers.delete(t);
        respawnCup();
      },
      phase === "scored" ? 900 : 650
    );
    respawnTimers.add(t);
  }

  function spawnBurst() {
    shardLife = 1;
    shards.visible = true;
    shardPos.length = 0;
    shardVel.length = 0;
    shardRot.length = 0;
    for (let i = 0; i < SHARDS; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * HALF * 0.7;
      shardPos.push(new THREE.Vector3(BX + Math.cos(a) * r, CFG.rimY + 0.05, BZ + Math.sin(a) * r));
      shardVel.push(
        new THREE.Vector3(
          Math.cos(a) * (0.4 + Math.random() * 1.2),
          1.1 + Math.random() * 1.7,
          Math.sin(a) * (0.4 + Math.random() * 1.2)
        )
      );
      shardRot.push(new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI));
      dummy.position.copy(shardPos[i]!);
      dummy.rotation.copy(shardRot[i]!);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      shards.setMatrixAt(i, dummy.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  const pointerNdc = { x: 0, y: 0 };
  let aiming = false;

  function onPointerDown(e: PointerEvent) {
    sfx.unlock();
    if (phase !== "ready") return;
    aiming = true;
    phase = "aiming";
    samples.length = 0;
    samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    renderer.domElement.setPointerCapture?.(e.pointerId);
    pushState();
  }

  function onPointerMove(e: PointerEvent) {
    const r = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointerNdc.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (!aiming) return;
    samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (samples.length > 40) samples.shift();
  }

  function onPointerUp() {
    if (!aiming) return;
    aiming = false;
    const now = performance.now();
    const recent = samples.filter((s) => now - s.t <= 140);
    const first = recent.length > 1 ? recent[0] : samples[0];
    const last = samples[samples.length - 1];
    if (!first || !last || last.t === first.t) {
      phase = "ready";
      pushState();
      return;
    }
    const dt = Math.max(last.t - first.t, 16);
    const dx = (last.x - first.x) / dt; // px per ms
    const dy = (last.y - first.y) / dt; // px per ms, negative when flicking up
    // normalise flick speed by screen height so mobile and desktop feel equal
    const hScale = 800 / Math.max(400, container.clientHeight);
    const fUp = -dy * hScale;
    const fLat = dx * hScale;
    if (fUp < 0.2) {
      phase = "ready";
      pushState();
      return;
    }
    computeThrow(fUp, fLat);
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // ── Resize ─────────────────────────────────────────────────────────────────
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // pause the render loop while the game is scrolled off-screen (mobile battery)
  let visible = true;
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    },
    { rootMargin: "60px" }
  );
  io.observe(container);

  // ── Collision sounds ───────────────────────────────────────────────────────
  let lastImpact = 0;
  const onCupCollide = (e: { contact: { getImpactVelocityAlongNormal: () => number } }) => {
    const now = performance.now();
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 1.1 && now - lastImpact > 90) {
      lastImpact = now;
      sfx.impact(clamp(v / 6, 0.1, 1));
    }
  };
  cupBody.addEventListener("collide", onCupCollide);

  // ── Main loop ──────────────────────────────────────────────────────────────
  let lastFrame = performance.now();
  let raf = 0;

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!visible) return;
    const now = performance.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    // levitate the cup while aiming
    if (phase === "aiming") {
      const tx = CFG.spawn.x + pointerNdc.x * 0.1;
      const ty = CFG.levitateY + Math.max(0, -pointerNdc.y) * 0.05;
      cupBody.position.x += (tx - cupBody.position.x) * 0.14;
      cupBody.position.y += (ty - cupBody.position.y) * 0.14;
      cupBody.position.z += (CFG.spawn.z - cupBody.position.z) * 0.14;
      cupBody.aabbNeedsUpdate = true;
    }

    world.step(1 / 120, dt, 8);

    // sync visuals
    cupMesh.position.copy(cupBody.position as unknown as THREE.Vector3);
    cupMesh.quaternion.copy(cupBody.quaternion as unknown as THREE.Quaternion);

    // flight bookkeeping
    if (phase === "flight") {
      flightTime += dt;
      trailPts.push(cupMesh.position.clone());
      if (trailPts.length > TRAIL_N) trailPts.shift();
      const p = cupBody.position;
      const speed = cupBody.velocity.length();
      const spin = cupBody.angularVelocity.length();
      const insideNow =
        Math.abs(p.x - BX) < HALF - CFG.cupR * 0.4 && Math.abs(p.z - BZ) < HALF - CFG.cupR * 0.4;
      if (!scoredThisThrow && insideNow && p.y < CFG.rimY - 0.22 && cupBody.velocity.y < 0.6) {
        classify();
      } else if (!scoredThisThrow) {
        if (speed < 0.4 && spin < 1.2) {
          restTimer += dt;
          if (restTimer > 0.45) classify();
        } else {
          restTimer = 0;
        }
        // grounded outside the bin can never score — end the round briskly
        const grounded = p.y < 0.2 && !insideNow;
        if (grounded) {
          groundTime += dt;
          if (groundTime > 0.7) classify();
        } else {
          groundTime = 0;
        }
        if (flightTime > 4) classify();
        if (cupBody.sleepState === CANNON.Body.SLEEPING) classify();
      }
    } else if (trailPts.length) {
      trailPts.shift();
    }

    // trail geometry — write into the pre-allocated buffer
    if (trailPts.length > 1) {
      for (let i = 0; i < trailPts.length; i++) {
         trailArr[i * 3] = trailPts[i]!.x;
         trailArr[i * 3 + 1] = trailPts[i]!.y;
         trailArr[i * 3 + 2] = trailPts[i]!.z;
      }
      (trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      trailGeo.setDrawRange(0, trailPts.length);
      trail.visible = true;
    } else {
      trail.visible = false;
    }

    // shards
    if (shardLife > 0) {
      shardLife -= dt * 0.9;
      for (let i = 0; i < SHARDS; i++) {
        const pos = shardPos[i]!;
        const v = shardVel[i]!;
        const rot = shardRot[i]!;
        v.y -= 5.2 * dt;
        pos.x += v.x * dt;
        pos.y += v.y * dt;
        pos.z += v.z * dt;
        rot.x += dt * 4;
        rot.z += dt * 3;
        dummy.position.copy(pos);
        dummy.rotation.copy(rot);
        dummy.scale.setScalar(clamp(shardLife, 0, 1));
        dummy.updateMatrix();
        shards.setMatrixAt(i, dummy.matrix);
      }
      shards.instanceMatrix.needsUpdate = true;
      if (shardLife <= 0) shards.visible = false;
    }

    // gentle camera parallax
    camera.position.x += (camBase.x + pointerNdc.x * 0.08 - camera.position.x) * 0.05;
    camera.position.y += (camBase.y - pointerNdc.y * 0.07 - camera.position.y) * 0.05;
    camera.lookAt(0, 0.42, -0.15);

    renderer.render(scene, camera);
  }
  tick();

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      cupBody.removeEventListener("collide", onCupCollide);
      for (const t of respawnTimers) clearTimeout(t);
      respawnTimers.clear();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
      sfx.dispose();
    },
    reset() {
      for (const t of respawnTimers) clearTimeout(t);
      respawnTimers.clear();
      score = 0;
      phase = "ready";
      respawnCup();
      pushState();
    },
  };
}
