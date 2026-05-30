"use client";

import * as THREE from "three";

/** Set up a neon-themed Three.js scene with sensible defaults. Returns cleanup. */
export function makeScene(canvas: HTMLCanvasElement, opts: {
  fov?: number;
  bgColor?: number;
  fog?: { color: number; near: number; far: number };
  shadows?: boolean;
} = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = opts.shadows ?? true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  if (opts.bgColor !== undefined) scene.background = new THREE.Color(opts.bgColor);
  if (opts.fog) scene.fog = new THREE.Fog(opts.fog.color, opts.fog.near, opts.fog.far);

  const camera = new THREE.PerspectiveCamera(opts.fov ?? 60, 1, 0.1, 200);
  camera.position.set(0, 4, 8);
  camera.lookAt(0, 0, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(6, 10, 4);
  dir.castShadow = opts.shadows ?? true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 50;
  const d = 12;
  dir.shadow.camera.left = -d;
  dir.shadow.camera.right = d;
  dir.shadow.camera.top = d;
  dir.shadow.camera.bottom = -d;
  scene.add(dir);

  // Neon rim
  const purple = new THREE.PointLight(0xb14aed, 1.4, 20);
  purple.position.set(-5, 4, 2);
  scene.add(purple);
  const cyan = new THREE.PointLight(0x22d3ee, 1.2, 20);
  cyan.position.set(5, 3, -2);
  scene.add(cyan);

  const handleResize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  handleResize();
  window.addEventListener("resize", handleResize);

  return {
    renderer,
    scene,
    camera,
    lights: { dir, purple, cyan },
    handleResize,
    dispose: () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        }
      });
    },
  };
}

/** Standard neon "stars" backdrop sphere */
export function addStarfield(scene: THREE.Scene, count = 600) {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 60 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, sizeAttenuation: true, transparent: true, opacity: 0.85 });
  const stars = new THREE.Points(geom, mat);
  scene.add(stars);
  return stars;
}

/** Returns a glowing emissive material */
export function neonMat(color: number, intensity = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.3,
  });
}
