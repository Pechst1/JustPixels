
import { useEffect, useRef, useState, useCallback } from "react";
import type React from "react";
import * as THREE from "three";

// Types
type PrimaryImage = { src: string; width: number; height: number };
type SecondaryImage = { src: string; width: number; height: number };
type Sampler = (u: number, v: number) => [number, number, number, number];
type PixelState = {
  offsetX: number;
  offsetY: number;
  rotation: number;
  scale: number;
  velocity: { x: number; y: number };
  originalX: number;
  originalY: number;
  phase: number;
  energy: number;
  mixSrcX: number;
  mixSrcY: number;
  mixImg: number; // 0 -> A, 1 -> B
  mixInit: boolean;
};

export default function App() {
  // --- Images ---
  const [primaryImage, setPrimaryImage] = useState<PrimaryImage | null>(null);
  const [secondaryImage, setSecondaryImage] = useState<SecondaryImage | null>(null);

  // --- Renderer mode ---
  const [rendererMode, setRendererMode] = useState("2d"); // "2d" | "3d"

  // --- Pixel + visual controls (2D) ---
  const [pixelSize, setPixelSize] = useState(16);
  const [pixelShape, setPixelShape] = useState("square");
  const [grayscale, setGrayscale] = useState(false);

  // --- Animation controls (shared) ---
  // Rename from `effect` to `activeEffect` to avoid any TDZ / name collisions
  const [activeEffect, setActiveEffect] = useState("none");
  const [amplitude, setAmplitude] = useState(10);
  const [frequency, setFrequency] = useState(0.12);
  const [speed, setSpeed] = useState(1);
  const [intensity, setIntensity] = useState(6);
  const [playing, setPlaying] = useState(true);

  // --- Combination (two-photo) controls (2D) ---
  const [combineMode, setCombineMode] = useState("none"); // none | checkerboard | rows | columns | scramble
  const [swapAB, setSwapAB] = useState(false);
  const [scrambleDuration, setScrambleDuration] = useState(6); // seconds

  // --- 3D controls ---
  const [threeEffect, setThreeEffect] = useState("voxel"); // voxel | spiral | blackhole
  const [threeAutoRotate, setThreeAutoRotate] = useState(true);
  const [threeRotateSpeed, setThreeRotateSpeed] = useState(0.2);

  // 3D: Voxel
  const [voxelCell, setVoxelCell] = useState(12); // sample cell px
  const [voxelGap, setVoxelGap] = useState(0.12); // spacing between voxels (0..0.45)
  const [voxelHeightScale, setVoxelHeightScale] = useState(6);
  const [voxelMorph, setVoxelMorph] = useState(0.5); // A↔B mix
  const [voxelMorphAuto, setVoxelMorphAuto] = useState(true);
  const [voxelMorphSpeed, setVoxelMorphSpeed] = useState(0.5);
  const [voxelColorMode, setVoxelColorMode] = useState("mix"); // "a" | "b" | "mix"
  const [voxelUnlit, setVoxelUnlit] = useState(true); // preserve photo colours spectrum
  const [voxelUnderlay, setVoxelUnderlay] = useState(true); // show the original photo plane beneath

  // 3D: Spiral
  const [spiralCount, setSpiralCount] = useState(30000);
  const [spiralOpacity, setSpiralOpacity] = useState(0.6);
  const [spiralSpeed, setSpiralSpeed] = useState(0.4);
  const [spiralScale, setSpiralScale] = useState(2.2);
  const [spiralPhotoInfluence, setSpiralPhotoInfluence] = useState(1); // 0..1 how much image drives positions

  // 3D: Black Hole
  const [bhCount, setBhCount] = useState(45000);
  const [bhOpacity, setBhOpacity] = useState(0.7);
  const [bhInner, setBhInner] = useState(0.8);
  const [bhOuter, setBhOuter] = useState(4.0);
  const [bhSpin, setBhSpin] = useState(1.2);
  const [bhInfall, setBhInfall] = useState(0.4);
  const [bhGlow, setBhGlow] = useState(0.6);

  // 3D: Balls mode
  const [ballCell, setBallCell] = useState(12);
  const [ballRadius, setBallRadius] = useState(0.45);
  const [ballMotionAmp, setBallMotionAmp] = useState(0.8);
  const [ballMotionSpeed, setBallMotionSpeed] = useState(0.6);

  // Appearance
  const [lightBg, setLightBg] = useState(true);
  const [colorGain, setColorGain] = useState(1.6); // simple brightness gain for instance colors

  // --- UI/Runtime ---
  const [isDraggingA, setIsDraggingA] = useState(false);
  const [isDraggingB, setIsDraggingB] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThreeInFullscreen, setShowThreeInFullscreen] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const threeMountRef = useRef<HTMLDivElement | null>(null);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const combineStartRef = useRef<number>(0);

  // 3D internals
  const threeRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const threeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const threeRootRef = useRef<THREE.Group | null>(null); // rotating group
  const threeObjsRef = useRef<{ group: THREE.Group | null; mat: THREE.Material | null }>({ group: null, mat: null });
  const spiralMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const blackHoleMatRef = useRef<THREE.ShaderMaterial | null>(null);

  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);
  const fileInputARef = useRef<HTMLInputElement | null>(null);
  const fileInputBRef = useRef<HTMLInputElement | null>(null);

  // Per-pixel states (for physics + scramble mapping) — 2D
  const pixelStatesRef = useRef<PixelState[][]>([]);

  // ---------- Helpers ----------
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
  const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const aspectPercent = (w: number, h: number) => {
    if (!w || !h) return 56.25; // default 16:9
    return (h / w) * 100;
  };

  // Build quick CPU sampler from an image element at target size
  const makePhotoSampler = (img: HTMLImageElement, w: number, h: number): Sampler => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return () => [0, 0, 0, 0];
    (g as CanvasRenderingContext2D).imageSmoothingEnabled = false; g.drawImage(img, 0, 0, w, h);
    const data = (g as CanvasRenderingContext2D).getImageData(0, 0, w, h).data;
    return (u: number, v: number) => { // u,v in [0,1]
      const x = clamp(Math.floor(u * (w - 1)), 0, w - 1);
      const y = clamp(Math.floor(v * (h - 1)), 0, h - 1);
      const i = (y * w + x) * 4; return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, data[i + 3] / 255];
    };
  };

  const getPhotoSampleFns = (): { sampleA: Sampler | null; sampleB: Sampler | null } => {
    const imgA = imgARef.current; if (!imgA) return { sampleA: null, sampleB: null };
    const baseW = 256, baseH = Math.max(64, Math.round((imgA.height / imgA.width) * 256));
    const sampleA = makePhotoSampler(imgA, baseW, baseH);
    let sampleB: Sampler | null = null;
    if (imgBRef.current) sampleB = makePhotoSampler(imgBRef.current, baseW, baseH);
    return { sampleA, sampleB };
  };

  const colorFromMix = (
    u: number,
    v: number,
    morph: number,
    mode: string,
    sampleA?: Sampler | null,
    sampleB?: Sampler | null
  ): [number, number, number] => {
    const [rA, gA, bA] = sampleA ? sampleA(u, v) : ([1, 1, 1, 1] as [number, number, number, number]);
    if (!sampleB || mode === "a") return [rA, gA, bA];
    const [rB, gB, bB] = sampleB ? sampleB(u, v) : ([rA, gA, bA, 1] as [number, number, number, number]);
    if (mode === "b") return [rB, gB, bB];
    const t = clamp(morph, 0, 1);
    return [lerp(rA, rB, t), lerp(gA, gB, t), lerp(bA, bB, t)];
  };

  // ---------- File handling ----------
  const loadImage = (file: File, which: "A" | "B") => {
    if (!file || !file.type.startsWith("image/")) {
      alert("Please upload a valid image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const img = new Image();
      img.onload = () => {
        if (which === "A") {
          imgARef.current = img;
          const res = e.target?.result; if (typeof res === "string") setPrimaryImage({ src: res, width: img.width, height: img.height });
          startTimeRef.current = 0;
        } else {
          imgBRef.current = img;
          const res = e.target?.result; if (typeof res === "string") setSecondaryImage({ src: res, width: img.width, height: img.height });
          startTimeRef.current = 0;
        }
      };
      img.onerror = () => alert("Failed to load image. Please try another file.");
      const res = e.target?.result; if (typeof res === "string") img.src = res;
    };
    reader.readAsDataURL(file);
  };

  const onFileSelectA = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) loadImage(f, "A"); };
  const onFileSelectB = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) loadImage(f, "B"); };

  // Drag/drop for A
  const handleDragOverA = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDraggingA(true); };
  const handleDragLeaveA = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDraggingA(false); };
  const handleDropA = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDraggingA(false); const f = e.dataTransfer.files?.[0]; if (f) loadImage(f, "A"); };
  // Drag/drop for B
  const handleDragOverB = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDraggingB(true); };
  const handleDragLeaveB = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDraggingB(false); };
  const handleDropB = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDraggingB(false); const f = e.dataTransfer.files?.[0]; if (f) loadImage(f, "B"); };

  // Paste to primary (FIXED syntax error)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile(); if (f) loadImage(f, "A");
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Fullscreen
  const toggleFullscreen = () => { if (!document.fullscreenElement) stageRef.current?.requestFullscreen(); else document.exitFullscreen(); };
  useEffect(() => { const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", onChange); return () => document.removeEventListener("fullscreenchange", onChange); }, []);

  // Keyboard shortcuts
  useEffect(() => { const onKey = (e: KeyboardEvent) => { const target = e.target as HTMLElement | null; if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return; if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); startTimeRef.current = 0; } else if (e.key.toLowerCase() === "f") toggleFullscreen(); else if (e.key.toLowerCase() === "d") downloadImage(); else if (e.key.toLowerCase() === "r") resetSettings(); else if (e.key.toLowerCase() === "s") restartScramble(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  // ---------- Effects (2D) ----------
  const calculateEffectOffset = (x: number, y: number, time: number, pixelState: PixelState, pxSize: number) => {
    let offsetX = 0, offsetY = 0, rotation = 0, scale = 1;

    // Guards to avoid accessing undefined on first frames
    const grid = pixelStatesRef.current;
    const gridH = grid.length || 1;
    const gridW = (grid[0] && grid[0].length) || 1;

    switch (activeEffect) {
      case "wave": offsetX = Math.sin(y * frequency + time * speed) * amplitude; break;
      case "dance": { const seed = ((x * 374761393 + y * 668265263) % 100000) / 100000; offsetX = Math.sin(seed * 10 + time * speed) * intensity; offsetY = Math.cos(seed * 10 + time * speed * 1.1) * intensity; break; }
      case "spiral": { const cx = gridW / 2; const cy = gridH / 2; const dx = x - cx, dy = y - cy; const dist = Math.hypot(dx, dy); const ang = Math.atan2(dy, dx) + time * speed * 0.5; const sOff = Math.sin(dist * 0.1 - time * speed) * amplitude; offsetX = Math.cos(ang) * sOff; offsetY = Math.sin(ang) * sOff; rotation = ang; break; }
      case "explosion": { const cx = gridW / 2; const cy = gridH / 2; const dx = x - cx, dy = y - cy; const dist = Math.hypot(dx, dy) || 1; const f = Math.sin(time * speed) * intensity; if (f > 0) { offsetX = (dx / dist) * f * (dist * 0.1); offsetY = (dy / dist) * f * (dist * 0.1); } break; }
      case "gravity": { pixelState.velocity.y += 0.5 * speed; pixelState.velocity.x *= 0.99; pixelState.offsetY += pixelState.velocity.y; pixelState.offsetX += pixelState.velocity.x; const maxY = gridH * pxSize; if (y * pxSize + pixelState.offsetY > maxY - pxSize) { pixelState.offsetY = maxY - pxSize - y * pxSize; pixelState.velocity.y *= -0.7; pixelState.velocity.x = (Math.random() - 0.5) * intensity; } if (Math.abs(pixelState.velocity.y) < 0.1 && Math.random() < 0.01) { pixelState.velocity.y = -Math.random() * intensity; pixelState.offsetY = 0; } offsetX = pixelState.offsetX; offsetY = pixelState.offsetY; break; }
      case "staircase": { const ph = (time * speed + x * 0.5 + y * 0.3) % (Math.PI * 2); offsetY = Math.floor(Math.sin(ph) * 3) * (amplitude / 3); offsetX = Math.sin(ph * 2) * amplitude * 0.3; break; }
      case "fight": { const phase = (time * speed) % 10; if (phase < 5) { pixelState.energy = Math.min(pixelState.energy + 0.1, 1); const n = Math.sin(x * y + time) > 0 ? 1 : -1; offsetX = Math.sin(pixelState.phase + time * 3) * intensity * pixelState.energy * n; offsetY = Math.cos(pixelState.phase + time * 3) * intensity * pixelState.energy * n; rotation = time * 2 * n; } else { pixelState.energy = Math.max(pixelState.energy - 0.1, 0); offsetX *= pixelState.energy; offsetY *= pixelState.energy; rotation *= pixelState.energy; } break; }
      case "breathe": { const ph = Math.sin(time * speed * 0.5); scale = 1 + ph * 0.3; offsetX = (x - gridW / 2) * ph * 0.1; offsetY = (y - gridH / 2) * ph * 0.1; break; }
      case "melt": { const prog = (Math.sin(time * speed * 0.3) + 1) / 2; const thr = y / gridH; if (prog > thr) { offsetY = (gridH - y) * intensity * (prog - thr); offsetX = Math.sin(y * 0.5 + time) * amplitude * 0.2; } break; }
      default: break;
    }
    return { offsetX, offsetY, rotation, scale };
  };

  // ---------- Combination logic (2D) ----------
  const restartScramble = () => { combineStartRef.current = performance.now(); };

  // ---------- Rendering 2D ----------
  const render2D = useCallback((timestamp: number) => {
    const canvas = canvasRef.current; if (!canvas || !imgARef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imgA = imgARef.current; const imgB = imgBRef.current;

    const holder = canvasBoxRef.current;
    const maxWidth = holder ? holder.clientWidth : (isFullscreen ? window.innerWidth : 900);
    const maxHeight = holder ? holder.clientHeight : (isFullscreen ? window.innerHeight : 600);
    const srcW = imgA.width, srcH = imgA.height;
    const scale = Math.min(maxWidth / srcW, maxHeight / srcH);
    const width = Math.max(1, Math.floor(srcW * scale));
    const height = Math.max(1, Math.floor(srcH * scale));
    canvas.width = width; canvas.height = height; // drawing resolution
    ctx.fillStyle = lightBg ? "#ffffff" : "#0b0b0c"; ctx.fillRect(0, 0, width, height);

    const pw = Math.ceil(width / pixelSize); const ph = Math.ceil(height / pixelSize);
    const needScramble = combineMode === "scramble";
    if (!pixelStatesRef.current.length || pixelStatesRef.current.length !== ph || pixelStatesRef.current[0].length !== pw) {
      initPixelStates2D(pw, ph, needScramble); if (needScramble) combineStartRef.current = timestamp;
    } else if (needScramble) {
      for (let y = 0; y < ph; y++) { for (let x = 0; x < pw; x++) { const st = pixelStatesRef.current[y][x]; if (!st.mixInit) { st.mixSrcX = Math.floor(Math.random() * pw); st.mixSrcY = Math.floor(Math.random() * ph); st.mixImg = Math.random() < 0.5 ? 0 : 1; st.mixInit = true; } } }
      if (!combineStartRef.current) combineStartRef.current = timestamp;
    }

    const offA = document.createElement("canvas"); offA.width = pw; offA.height = ph; const offCtxA = offA.getContext("2d", { willReadFrequently: true }); if (!offCtxA) return; (offCtxA as CanvasRenderingContext2D).imageSmoothingEnabled = false; offCtxA.drawImage(imgA, 0, 0, pw, ph); const dataA = (offCtxA as CanvasRenderingContext2D).getImageData(0, 0, pw, ph).data;
    let dataB: Uint8ClampedArray | null = null; if (imgB) { const offB = document.createElement("canvas"); offB.width = pw; offB.height = ph; const offCtxB = offB.getContext("2d", { willReadFrequently: true }); if (!offCtxB) return; (offCtxB as CanvasRenderingContext2D).imageSmoothingEnabled = false; offCtxB.drawImage(imgB, 0, 0, pw, ph); dataB = (offCtxB as CanvasRenderingContext2D).getImageData(0, 0, pw, ph).data; }

    const time = playing ? (timestamp - (startTimeRef.current || timestamp)) / 1000 : 0; if (!startTimeRef.current) startTimeRef.current = timestamp;
    const scrambleT = combineMode === "scramble" ? clamp(((timestamp - (combineStartRef.current || timestamp)) / 1000) / Math.max(0.1, scrambleDuration), 0, 1) : 1; const scrambleEased = easeInOutCubic(scrambleT);

    ctx.imageSmoothingEnabled = false;
    const pickPx = (src: Uint8ClampedArray, sx: number, sy: number) => { const ix = Math.max(0, Math.min(pw - 1, Math.round(sx))); const iy = Math.max(0, Math.min(ph - 1, Math.round(sy))); const i = (iy * pw + ix) * 4; return [src[i], src[i + 1], src[i + 2], src[i + 3] / 255] as [number, number, number, number]; };

    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        let srcImg = 0; let sx = x, sy = y; let drawX = x, drawY = y;
        if (combineMode === "checkerboard" && dataB) { const useB = (((x + y) % 2 === 0) !== swapAB); srcImg = useB ? 1 : 0; }
        else if (combineMode === "rows" && dataB) { const useB = ((y % 2 === 0) !== swapAB); srcImg = useB ? 1 : 0; }
        else if (combineMode === "columns" && dataB) { const useB = ((x % 2 === 0) !== swapAB); srcImg = useB ? 1 : 0; }
        else if (combineMode === "scramble") { const st = pixelStatesRef.current[y][x]; const startX = st.mixSrcX, startY = st.mixSrcY; const startImg = (swapAB ? (st.mixImg === 0 ? 1 : 0) : st.mixImg); const p = scrambleEased; drawX = lerp(startX, x, p); drawY = lerp(startY, y, p); if (p < 0.5) { srcImg = startImg; sx = startX; sy = startY; } else { srcImg = 0; sx = x; sy = y; } }
        const [r0, g0, b0, a0] = srcImg === 1 && dataB ? pickPx(dataB, sx, sy) : pickPx(dataA, sx, sy);
        let r = r0, g = g0, b = b0, a = a0; if (grayscale) { const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b); r = g = b = gray; }
        const st = (pixelStatesRef.current[y]?.[x] as PixelState) || { offsetX: 0, offsetY: 0, rotation: 0, scale: 1, velocity: { x: 0, y: 0 }, phase: 0, energy: 0, originalX: x, originalY: y, mixSrcX: x, mixSrcY: y, mixImg: 0, mixInit: false };
        const fx = calculateEffectOffset(x, y, time, st as PixelState, pixelSize);
        const finalX = drawX * pixelSize + fx.offsetX; const finalY = drawY * pixelSize + fx.offsetY; const finalSize = pixelSize * Math.max(0.1, fx.scale);
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = `rgb(${r},${g},${b})`;
        if (fx.rotation !== 0) { ctx.translate(finalX + finalSize / 2, finalY + finalSize / 2); ctx.rotate(fx.rotation); ctx.translate(-finalSize / 2, -finalSize / 2); } else { ctx.translate(finalX, finalY); }
        if (pixelShape === "circle") { ctx.beginPath(); ctx.arc(finalSize / 2, finalSize / 2, finalSize / 2, 0, Math.PI * 2); ctx.fill(); }
        else if (pixelShape === "diamond") { ctx.beginPath(); ctx.moveTo(finalSize / 2, 0); ctx.lineTo(finalSize, finalSize / 2); ctx.lineTo(finalSize / 2, finalSize); ctx.lineTo(0, finalSize / 2); ctx.closePath(); ctx.fill(); }
        else if (pixelShape === "hexagon") { const rads = finalSize / 2; ctx.beginPath(); for (let k = 0; k < 6; k++) { const ang = (Math.PI / 3) * k; const hx = rads + Math.cos(ang) * rads; const hy = rads + Math.sin(ang) * rads; if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy); } ctx.closePath(); ctx.fill(); }
        else { ctx.fillRect(0, 0, finalSize, finalSize); }
        ctx.restore();
      }
    }
  }, [pixelSize, pixelShape, grayscale, activeEffect, amplitude, frequency, speed, intensity, playing, isFullscreen, combineMode, scrambleDuration, swapAB]);

  const initPixelStates2D = useCallback((width: number, height: number, forScramble = false) => {
    const states: PixelState[][] = [];
    for (let y = 0; y < height; y++) {
      states[y] = [] as PixelState[];
      for (let x = 0; x < width; x++) {
        const st: PixelState = { offsetX: 0, offsetY: 0, rotation: 0, scale: 1, velocity: { x: 0, y: 0 }, originalX: x, originalY: y, phase: Math.random() * Math.PI * 2, energy: 0, mixSrcX: x, mixSrcY: y, mixImg: 0, mixInit: false };
        if (forScramble) { st.mixSrcX = Math.floor(Math.random() * width); st.mixSrcY = Math.floor(Math.random() * height); st.mixImg = Math.random() < 0.5 ? 0 : 1; st.mixInit = true; }
        states[y][x] = st;
      }
    }
    pixelStatesRef.current = states;
  }, []);

  // --- Dev self-tests (lightweight, run once in dev) ---
  useEffect(() => {
    if (import.meta.env && import.meta.env.PROD) return;
    try {
      console.groupCollapsed('PixelPromptLab self-tests');
      // basic math helpers
      console.assert(lerp(0, 10, 0.5) === 5, 'lerp basic');
      console.assert(clamp(-1, 0, 1) === 0 && clamp(2, 0, 1) === 1, 'clamp bounds');
      console.assert(Math.abs(easeInOutCubic(0) - 0) < 1e-6 && Math.abs(easeInOutCubic(1) - 1) < 1e-6, 'ease endpoints');

      // pixel states + effect offset
      initPixelStates2D(4, 4, false);
      const ps = pixelStatesRef.current[1][1];
      const fx0 = calculateEffectOffset(1, 1, 0, ps, 16);
      console.assert(['offsetX','offsetY','rotation','scale'].every(k => typeof fx0[k] === 'number'), 'effect offset shape');

      // extra test: wave amplitude should influence offset
      const prevAmp = amplitude;
      const prevEffect = activeEffect;
      // simulate wave
      setActiveEffectInternalForTest('wave');
      const fxLow = testEffectOffsetWithAmplitude(1);
      const fxHigh = testEffectOffsetWithAmplitude(20);
      console.assert(Math.abs(fxHigh.offsetX) >= Math.abs(fxLow.offsetX), 'wave amplitude affects offset');
      // restore
      setActiveEffectInternalForTest(prevEffect);
      setAmplitude(prevAmp);

      console.groupEnd();
    } catch (err) { console.error('Self-tests failed', err); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initPixelStates2D]);

  // --- Tiny helpers used ONLY in dev self-tests above ---
  const setActiveEffectInternalForTest = (name: string) => { setActiveEffect(name); };
  const testEffectOffsetWithAmplitude = (amp: number) => {
    setAmplitude(amp);
    const ps = pixelStatesRef.current[1][1];
    return calculateEffectOffset(1, 1, 0.123, ps as PixelState, 16);
  };

  // Animation loop (2D) – always run when a primary image exists
  useEffect(() => { if (!primaryImage) return; const animate = (ts: number) => { if (!startTimeRef.current) startTimeRef.current = ts; render2D(ts); if (playing) animationRef.current = requestAnimationFrame(animate); }; if (playing) animationRef.current = requestAnimationFrame(animate); else render2D(performance.now()); return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); }; }, [primaryImage, render2D, playing]);

  // Resize (defined after render2D to avoid TDZ)
  useEffect(() => {
    const onResize = () => {
      if (rendererMode === "2d") { if (primaryImage) render2D(performance.now()); }
      else { resizeThree(); }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [rendererMode, primaryImage, render2D]);

  // Observe container resizes (Safari-friendly) and redraw/reflow
  useEffect(() => {
    const c = canvasBoxRef.current; if (!c) return;
    const RO = (window as any).ResizeObserver;
    const ro = RO ? new RO(() => { if (primaryImage) render2D(performance.now()); }) : null;
    if (ro && c) ro.observe(c);
    return () => { if (ro && c) ro.unobserve(c); };
  }, [primaryImage, render2D]);

  useEffect(() => {
    const m = threeMountRef.current; if (!m) return;
    const RO = (window as any).ResizeObserver;
    const ro = RO ? new RO(() => { resizeThree(); }) : null;
    if (ro && m) ro.observe(m);
    return () => { if (ro && m) ro.unobserve(m); };
  }, [threeMountRef, rendererMode, showThreeInFullscreen]);

  // Resize again after style changes or fullscreen toggles
  useEffect(() => {
    requestAnimationFrame(() => resizeThree());
  }, [isFullscreen, lightBg, rendererMode, showThreeInFullscreen]);

  // ---------- THREE.JS (3D) ----------
  const ensureThree = useCallback(() => {
    if (threeRendererRef.current) return;
    const mount = threeMountRef.current; if (!mount) return;
    // Ensure the mount can hold an absolutely positioned canvas
    (mount.style as CSSStyleDeclaration).position = (mount.style.position || '');
    if (!mount.style.position) (mount.style as CSSStyleDeclaration).position = 'relative';

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Use robust size detection with fallbacks to avoid 0x0 canvases
    const rect = mount.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || mount.clientWidth || 640));
    const h = Math.max(1, Math.floor(rect.height || mount.clientHeight || Math.round(w * 9 / 16)));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);
    // Ensure the WebGL canvas fills the mount without changing layout
    const style = renderer.domElement.style as CSSStyleDeclaration;
    style.position = 'absolute'; style.top = '0'; style.left = '0'; style.right = '0'; style.bottom = '0';
    style.width = '100%'; style.height = '100%'; style.display = 'block';

    const scene = new THREE.Scene(); scene.background = new THREE.Color(lightBg ? 0xffffff : 0x0b0b0c);
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 4000);
    camera.position.set(0, 1.5, 9);

    const root = new THREE.Group(); scene.add(root);

    const amb = new THREE.AmbientLight(0xffffff, 1.2); scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(4, 6, 8); scene.add(dir);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.4); rim.position.set(-6, 4, -8); scene.add(rim);

    threeRendererRef.current = renderer; threeSceneRef.current = scene; threeCameraRef.current = camera; threeRootRef.current = root;
    // Re-measure next frame in case the container just mounted
    requestAnimationFrame(() => resizeThree());
  }, [lightBg]);

  const disposeThreeObjects = () => {
    const group = threeObjsRef.current.group; if (group) { group.traverse((o: any) => { if (o.geometry) o.geometry.dispose?.(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose?.()); else o.material.dispose?.(); } }); threeRootRef.current?.remove(group); }
    threeObjsRef.current = { group: null, mat: null };
    spiralMatRef.current = null; blackHoleMatRef.current = null;
  };

  const createInstanceColorMaterial = () => {
    return new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        precision highp float;
        attribute vec3 position;
        attribute vec3 instanceColor;
        attribute mat4 instanceMatrix;
        varying vec3 vColor;
        uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
        void main(){ vColor = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * (instanceMatrix * vec4(position,1.0)); }
      `,
      fragmentShader: `
        precision highp float; varying vec3 vColor;
        void main(){ gl_FragColor = vec4(vColor, 1.0); }
      `,
      transparent: false,
      depthWrite: true,
      toneMapped: false,
    });
  };

  const resizeThree = () => { const renderer = threeRendererRef.current; const camera = threeCameraRef.current; const mount = threeMountRef.current; if (!renderer || !camera || !mount) return; const w = mount.clientWidth, h = mount.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };

  // Build voxel scene from image(s) — unlit colours, per-instance setColorAt
  const buildVoxel = useCallback(() => {
    ensureThree();
    const scene = threeSceneRef.current; const root = threeRootRef.current; if (!scene || !root) return;
    disposeThreeObjects();

    const img = imgARef.current; if (!img) return;

    const { sampleA, sampleB } = getPhotoSampleFns();
    const sampleMode = voxelColorMode; // "a" | "b" | "mix"
    const morph = voxelMorph;

    const cell = Math.max(4, voxelCell);
    const targetW = Math.floor(Math.min(180, Math.max(24, Math.round(img.width / cell))));
    const targetH = Math.floor(Math.min(180, Math.max(24, Math.round(img.height / cell))));
    const count = targetW * targetH;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const gap = clamp(voxelGap, 0, 0.45);
    const scaleXY = 1 - gap * 2;
    const heightGamma = 0.9;
    const heightScale = Math.max(0.5, voxelHeightScale);

    let i = 0;
    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const u = targetW > 1 ? x / (targetW - 1) : 0;
        const v = targetH > 1 ? y / (targetH - 1) : 0;

        let r = 1, g = 1, b = 1;
        if (sampleMode === 'a') {
          [r, g, b] = (sampleA ? sampleA(u, v) : [1, 1, 1, 1]) as [number, number, number, number];
        } else if (sampleMode === 'b') {
          [r, g, b] = (sampleB ? sampleB(u, v) : [1, 1, 1, 1]) as [number, number, number, number];
        } else {
          const [rA, gA, bA] = sampleA ? sampleA(u, v) : [1, 1, 1, 1];
          const [rB, gB, bB] = sampleB ? sampleB(u, v) : [rA, gA, bA, 1];
          r = lerp(rA, rB, morph); g = lerp(gA, gB, morph); b = lerp(bA, bB, morph);
        }

        r = clamp(r * colorGain, 0, 1);
        g = clamp(g * colorGain, 0, 1);
        b = clamp(b * colorGain, 0, 1);

        const brightness = Math.pow(0.2126 * r + 0.7152 * g + 0.0722 * b, heightGamma);
        const h = 0.2 + brightness * heightScale;

        const px = x - targetW / 2 + 0.5; const py = y - targetH / 2 + 0.5;
        dummy.position.set(px, h / 2 - 1.0, -py);
        dummy.scale.set(scaleXY, h, scaleXY);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);

        color.setRGB(r, g, b);
        mesh.setColorAt(i, color);
        i++;
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const group = new THREE.Group(); group.add(mesh);

    if (voxelUnderlay) {
      const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); if (g) { (g as CanvasRenderingContext2D).imageSmoothingEnabled = false; g.drawImage(img, 0, 0); } return c; })());
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(targetW + 6, targetH + 6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, toneMapped: false }));
      plane.rotation.x = -Math.PI / 2; plane.position.y = -1.01; group.add(plane);
    }

    threeRootRef.current?.add(group); threeObjsRef.current.group = group;

    const camera = threeCameraRef.current; const maxDim = Math.max(targetW, targetH);
    if (camera) { camera.near = 0.1; camera.far = 5000; camera.updateProjectionMatrix(); camera.position.set(0, maxDim * 0.35, maxDim * 1.25); camera.lookAt(0, maxDim * 0.08, 0); }
  }, [ensureThree, voxelCell, voxelGap, voxelHeightScale, voxelColorMode, voxelMorph, voxelUnderlay, colorGain]);

  // Build colored balls from image(s)
  // Build coloured balls — unlit, per-instance setColorAt, spread out
  const buildBalls = useCallback(() => {
    ensureThree();
    const scene = threeSceneRef.current; const root = threeRootRef.current; if (!scene || !root) return;
    disposeThreeObjects();

    const img = imgARef.current; if (!img) return;
    const { sampleA, sampleB } = getPhotoSampleFns();

    const cell = Math.max(4, ballCell);
    const targetW = Math.floor(Math.min(160, Math.max(24, Math.round(img.width / cell))));
    const targetH = Math.floor(Math.min(160, Math.max(24, Math.round(img.height / cell))));
    const count = targetW * targetH;

    const geo = new THREE.SphereGeometry(0.6, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D(); const color = new THREE.Color();
    const baseX = new Float32Array(count); const baseY = new Float32Array(count); const baseZ = new Float32Array(count); const phase = new Float32Array(count); const radii = new Float32Array(count);

    let i = 0;
    const maxDim = Math.max(targetW, targetH);
    const baseR = Math.max(8, maxDim * 0.55);

    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const u = targetW > 1 ? x / (targetW - 1) : 0;
        const v = targetH > 1 ? y / (targetH - 1) : 0;

        const [rA, gA, bA] = sampleA ? sampleA(u, v) : [1, 1, 1, 1];
        const [rB, gB, bB] = sampleB ? sampleB(u, v) : [rA, gA, bA, 1];
        let r = lerp(rA, rB, voxelMorph); let g = lerp(gA, gB, voxelMorph); let b = lerp(bA, bB, voxelMorph);
        r = clamp(r * colorGain, 0, 1); g = clamp(g * colorGain, 0, 1); b = clamp(b * colorGain, 0, 1);

        const angle = (u * Math.PI * 2) + Math.random() * 0.25;
        const rr = baseR * (0.55 + 0.45 * Math.random());
        const px = Math.cos(angle) * rr; const pz = Math.sin(angle) * rr; const py = (v - 0.5) * baseR * 0.7;

        dummy.position.set(px, py, pz);

        const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const s = Math.max(0.18, ballRadius * (0.35 + 0.9 * brightness));
        dummy.scale.set(s, s, s);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);

        color.setRGB(r, g, b); mesh.setColorAt(i, color);

        baseX[i] = px; baseY[i] = py; baseZ[i] = pz; phase[i] = Math.random() * Math.PI * 2; radii[i] = s; i++;
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const group = new THREE.Group(); group.add(mesh);
    (group as any).userData = { type: 'balls', baseX, baseY, baseZ, phase, radii };
    threeRootRef.current?.add(group); threeObjsRef.current.group = group;

    const camera = threeCameraRef.current;
    if (camera) { const d = Math.max(targetW, targetH) * 1.6; camera.near = 0.1; camera.far = 5000; camera.updateProjectionMatrix(); camera.position.set(0, d * 0.55, d * 0.9); camera.lookAt(0, 0, 0); }
  }, [ensureThree, ballCell, ballRadius, colorGain, voxelMorph]);

  // Build spiral particles — now photo-driven
  const buildSpiral = useCallback(() => {
    ensureThree(); const root = threeRootRef.current; if (!root) return; disposeThreeObjects();
    const { sampleA, sampleB } = getPhotoSampleFns(); if (!sampleA) return;

    const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const count = clamp(spiralCount, 2000, 120000);
    const positions = new Float32Array(count * 3); const colors = new Float32Array(count * 3); const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const radius = Math.pow(t, 0.5) * spiralScale; // base radial growth
      const angle = t * Math.PI * 30;
      const height = (Math.random() - 0.5) * (spiralScale * 0.2);

      // Map photo: u from angle, v from t (or radius) blended by spiralPhotoInfluence
      const u = (angle / (Math.PI * 2)) % 1;
      const vPure = clamp(radius / Math.max(spiralScale, 0.0001), 0, 1);
      const vNoise = clamp(t + (Math.random() - 0.5) * 0.1, 0, 1);
      const v = clamp(lerp(vNoise, vPure, spiralPhotoInfluence), 0, 1);

      let [r, g, b] = colorFromMix(u, v, voxelMorph, "mix", sampleA, sampleB);
      // amplify photo colours and clamp them to [0, 1]
      r = clamp(r * colorGain, 0, 1);
      g = clamp(g * colorGain, 0, 1);
      b = clamp(b * colorGain, 0, 1);
      // now convert to linear colour space
      r = toLinear(r); g = toLinear(g); b = toLinear(b);

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
      const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sizes[i] = 0.12 + 0.25 * (1.0 - v) + brightness * 0.15;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, opacity: { value: spiralOpacity } },
      vertexShader: `
        uniform float time; attribute float size; attribute vec3 customColor; varying vec3 vColor;
        void main(){ vColor = customColor; vec3 pos = position;
          float r = length(pos.xz); float a = atan(pos.z, pos.x);
          float pulse = sin(time * 2.0) * 0.2 + 0.85;
          float wave = sin(r * 3.0 - time * 3.0) * 0.18;
          float vwave = cos(r * 2.0 - time * 1.2) * 0.24;
          float rot = 0.05 / (r + 1.0); float na = a + time * rot;
          vec3 np; np.x = cos(na) * (r + wave) * pulse; np.z = sin(na) * (r + wave) * pulse; np.y = pos.y + vwave;
          vec4 mv = modelViewMatrix * vec4(np, 1.0); gl_PointSize = size * (110.0 / -mv.z); gl_Position = projectionMatrix * mv; }
      `,
      fragmentShader: `
        uniform float opacity; varying vec3 vColor;
        void main(){ float d = length(gl_PointCoord - vec2(0.5)); if(d>0.5) discard; float a = (1.0 - smoothstep(0.45, 0.5, d)) * opacity; gl_FragColor = vec4(vColor, a); }
      `,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending
    });

    const points = new THREE.Points(geometry, material);
    const group = new THREE.Group(); group.add(points);
    threeRootRef.current?.add(group);
    threeObjsRef.current.group = group; spiralMatRef.current = material as THREE.ShaderMaterial;

    const camera = threeCameraRef.current; if (camera) { camera.position.set(0, 1.8, 6.5); camera.lookAt(0, 0, 0); }
  }, [ensureThree, spiralCount, spiralOpacity, spiralScale, spiralPhotoInfluence, voxelMorph]);

  // Build black hole particles — photo-colored accretion disk
  const buildBlackHole = useCallback(() => {
    ensureThree(); const root = threeRootRef.current; if (!root) return; disposeThreeObjects();
    const { sampleA, sampleB } = getPhotoSampleFns(); if (!sampleA) return;

    const count = clamp(bhCount, 5000, 120000);

    const positions = new Float32Array(count * 3);
    const polar = new Float32Array(count * 3); // radius0, angle0, height
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // distribute more densely near outer ring for visual texture
      const rt = Math.pow(Math.random(), 0.6);
      const r0 = lerp(bhInner, bhOuter, rt);
      const a0 = Math.random() * Math.PI * 2;
      const h0 = (Math.random() - 0.5) * 0.08 * (r0 / bhOuter);

      // photo mapping: u from angle, v from normalized radius
      const u = (a0 / (Math.PI * 2)) % 1;
      const v = clamp((r0 - bhInner) / Math.max(0.0001, (bhOuter - bhInner)), 0, 1);
      let [r, g, b] = colorFromMix(u, v, voxelMorph, "mix", sampleA, sampleB);
      r = clamp(r * colorGain, 0, 1);
      g = clamp(g * colorGain, 0, 1);
      b = clamp(b * colorGain, 0, 1);

      const x = Math.cos(a0) * r0, y = h0, z = Math.sin(a0) * r0;
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      polar[i * 3] = r0; polar[i * 3 + 1] = a0; polar[i * 3 + 2] = h0;
      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
      sizes[i] = 0.9 + Math.random() * 1.6;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('polar', new THREE.BufferAttribute(polar, 3));
    geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, opacity: { value: bhOpacity },
        inner: { value: bhInner }, outer: { value: bhOuter }, spin: { value: bhSpin }, infall: { value: bhInfall }
      },
      vertexShader: `
        uniform float time, inner, outer, spin, infall; attribute vec3 polar; // r0, a0, h0
        attribute float size; attribute vec3 customColor; varying vec3 vColor;
        void main(){ vColor = customColor; float r0 = polar.x; float a0 = polar.y; float h0 = polar.z;
          float dr = mod((r0 - inner) - infall * time, max(0.001, outer - inner));
          float r = inner + dr; float a = a0 + spin * time / (0.2 + r); // faster near center
          vec3 p; p.x = cos(a) * r; p.y = h0; p.z = sin(a) * r;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = size * (120.0 / -mv.z); gl_Position = projectionMatrix * mv; }
      `,
      fragmentShader: `
        uniform float opacity; varying vec3 vColor;
        void main(){ float d = length(gl_PointCoord - vec2(0.5)); if(d>0.5) discard; float a = (1.0 - smoothstep(0.42, 0.5, d)) * opacity; gl_FragColor = vec4(vColor, a); }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);

    // Event horizon + glow
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(bhInner * 0.92, 32, 32), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 }));
    const glow = new THREE.Mesh(new THREE.TorusGeometry((bhInner + bhOuter) * 0.5, (bhOuter - bhInner) * 0.08, 16, 128), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: bhGlow, blending: THREE.AdditiveBlending }));
    glow.rotation.x = Math.PI / 2; horizon.position.y = 0; glow.position.y = 0;

    const group = new THREE.Group(); group.add(points); group.add(horizon); group.add(glow);
    threeRootRef.current?.add(group); threeObjsRef.current.group = group; blackHoleMatRef.current = material as THREE.ShaderMaterial;

    const camera = threeCameraRef.current; if (camera) { camera.position.set(0, (bhOuter - bhInner) * 0.4, bhOuter * 2.2); camera.lookAt(0, 0, 0); }
  }, [ensureThree, bhCount, bhOpacity, bhInner, bhOuter, bhSpin, bhInfall, bhGlow, voxelMorph]);

  // Build/update three scene when needed
  useEffect(() => {
    ensureThree();
    if (threeEffect === "voxel") buildVoxel();
    else if (threeEffect === "balls") buildBalls();
    else if (threeEffect === "spiral") buildSpiral();
    else buildBlackHole();
    resizeThree();
  }, [threeEffect,
      // voxel
      buildVoxel,
      // balls
      buildBalls,
      // spiral
      buildSpiral,
      // black hole
      buildBlackHole,
      primaryImage, secondaryImage,
      rendererMode]);

  // Ensure the renderer is created and sized once the mount exists, then render a first frame
  useEffect(() => {
    const mount = threeMountRef.current;
    if (!mount) return;
    // Create renderer if missing
    if (!threeRendererRef.current) {
      ensureThree();
    }
    // Defer sizing to next frame so ratio-box has computed size
    requestAnimationFrame(() => {
      resizeThree();
      const r = threeRendererRef.current, s = threeSceneRef.current, c = threeCameraRef.current;
      if (r && s && c) r.render(s, c);
    });
  }, [ensureThree]);

  // Auto morph + rotation + animation (always run when 3D is initialized)
  useEffect(() => {
    const renderer = threeRendererRef.current; const scene = threeSceneRef.current; const camera = threeCameraRef.current; const root = threeRootRef.current;
    if (!renderer || !scene || !camera || (isFullscreen && !showThreeInFullscreen)) return;
    const clock = new THREE.Clock(); let raf: number;
    const animate = () => { raf = requestAnimationFrame(animate); const dt = clock.getDelta();
      if (threeEffect === "voxel" && voxelMorphAuto && secondaryImage) { const newMorph = (Math.sin(performance.now() * 0.001 * voxelMorphSpeed) * 0.5 + 0.5); if (Math.abs(newMorph - voxelMorph) > 0.01) setVoxelMorph(newMorph); }
      if (threeAutoRotate && root) root.rotation.y += threeRotateSpeed * dt;
      if (threeEffect === "spiral" && spiralMatRef.current?.uniforms?.time) spiralMatRef.current.uniforms.time.value += spiralSpeed * dt;
      if (threeEffect === "blackhole" && blackHoleMatRef.current?.uniforms?.time) blackHoleMatRef.current.uniforms.time.value += dt;
      if (threeEffect === "balls" && threeObjsRef.current.group) {
        const group = threeObjsRef.current.group as THREE.Group;
        const mesh = group.children[0] as THREE.InstancedMesh;
        const ud: any = group.userData;
        if (mesh && ud && ud.baseX) {
          const { baseX, baseY, baseZ, phase, radii } = ud as { baseX: Float32Array; baseY: Float32Array; baseZ: Float32Array; phase: Float32Array; radii: Float32Array };
          const n = baseX.length;
          const t = performance.now() * 0.001 * ballMotionSpeed;
          const dmy = new THREE.Object3D();
          for (let i = 0; i < n; i++) {
            const px = baseX[i];
            const py = baseY[i];
            const pz = baseZ[i];
            const ph = phase[i];
            const radius = Math.hypot(px, pz);
            const baseAngle = Math.atan2(pz, px);
            const angle = baseAngle + t + ph;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = py + Math.sin(ph + t * 2.0) * (ballMotionAmp * 0.8);
            dmy.position.set(x, y, z);
            const r = radii[i] || 1;
            dmy.scale.set(r, r, r);
            dmy.updateMatrix();
            mesh.setMatrixAt(i, dmy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      renderer.render(scene, camera);
    }; animate(); return () => { cancelAnimationFrame(raf); };
  }, [threeEffect, threeAutoRotate, threeRotateSpeed, voxelMorphAuto, voxelMorphSpeed, spiralSpeed, secondaryImage, voxelMorph, isFullscreen, showThreeInFullscreen]);

  // Dispose renderer on unmount
  useEffect(() => { return () => { const renderer = threeRendererRef.current; const mount = threeMountRef.current; disposeThreeObjects(); if (renderer) { renderer.dispose(); mount?.removeChild(renderer.domElement); } threeRendererRef.current = null; threeSceneRef.current = null; threeCameraRef.current = null; threeRootRef.current = null; }; }, []);

  // ---------- Actions ----------
  const downloadImage = () => { if (rendererMode === "2d") { const c = canvasRef.current; if (!c) return; const link = document.createElement("a"); link.download = "pixel-art.png"; link.href = c.toDataURL(); link.click(); } else { const r = threeRendererRef.current; if (!r) return; const link = document.createElement("a"); link.download = "pixel-3d.png"; link.href = r.domElement.toDataURL("image/png"); link.click(); } };
  const resetSettings = () => {
    setPixelSize(16); setPixelShape("square"); setGrayscale(false); setActiveEffect("none"); setAmplitude(10); setFrequency(0.12); setSpeed(1); setIntensity(6); setCombineMode("none"); setSwapAB(false); setScrambleDuration(6);
    setThreeEffect("voxel"); setThreeAutoRotate(true); setThreeRotateSpeed(0.2);
    setVoxelCell(12); setVoxelGap(0.12); setVoxelHeightScale(6); setVoxelMorph(0.5); setVoxelMorphAuto(true); setVoxelMorphSpeed(0.5); setVoxelColorMode("mix"); setVoxelUnlit(true); setVoxelUnderlay(true);
    setSpiralCount(30000); setSpiralOpacity(0.6); setSpiralSpeed(0.4); setSpiralScale(2.2); setSpiralPhotoInfluence(1);
    setBhCount(45000); setBhOpacity(0.7); setBhInner(0.8); setBhOuter(4.0); setBhSpin(1.2); setBhInfall(0.4); setBhGlow(0.6);
    startTimeRef.current = 0; combineStartRef.current = 0;
  };

  // React to background change for existing 3D scene
  useEffect(() => {
    const scene = threeSceneRef.current;
    if (scene) scene.background = new THREE.Color(lightBg ? 0xffffff : 0x0b0b0c);
  }, [lightBg]);

  // ---------- UI ----------
  return (
    <div ref={containerRef} className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-start gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Just Pixels.
            </h1>
            <p className="text-gray-400">
              2D pixel art + 3D voxel/spiral/black-hole modes driven by your photos.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={rendererMode}
              onChange={(e) => setRendererMode(e.target.value)}
              className="px-3 py-2 bg-gray-700 rounded-lg text-sm"
            >
              <option value="2d">2D Canvas</option>
              <option value="3d">3D WebGL</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-300 bg-gray-700/70 px-3 py-2 rounded-lg">
              <input type="checkbox" checked={lightBg} onChange={(e) => setLightBg(e.target.checked)} className="accent-purple-500" />
              Bg: Light
            </label>
            <button
              onClick={() => { setPlaying((p) => !p); startTimeRef.current = 0; }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="Space"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={toggleFullscreen}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="F"
            >
              {isFullscreen ? "Exit Fullscreen" : "⛶ Fullscreen"}
            </button>
          <button
              onClick={downloadImage}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="D"
            >
              ⬇️ Download
            </button>
            <label className="hidden md:flex items-center gap-2 text-sm text-gray-300 bg-gray-700/70 px-3 py-2 rounded-lg" title="Show 3D view while in fullscreen">
              <input
                type="checkbox"
                checked={showThreeInFullscreen}
                onChange={(e) => setShowThreeInFullscreen(e.target.checked)}
                className="accent-purple-500"
              />
              Fullscreen: 3D
            </label>
          </div>
        </div>

        {/* Upload Areas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Primary */}
          <div
            className={`p-6 border-2 border-dashed rounded-xl transition-all ${
              isDraggingA ? "border-purple-400 bg-purple-900/20" : "border-gray-600 hover:border-gray-500"
            }`}
            onDragOver={handleDragOverA}
            onDragLeave={handleDragLeaveA}
            onDrop={handleDropA}
          >
            <div className="text-center">
              <p className="font-semibold mb-2">Primary Image (A)</p>
              <p className="mb-3 text-sm text-gray-400">Drag & drop, paste with Ctrl/Cmd+V, or</p>
              <input
                ref={fileInputARef}
                type="file"
                accept="image/*"
                onChange={onFileSelectA}
                className="hidden"
              />
              <button
                onClick={() => fileInputARef.current?.click()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                Browse Files
              </button>
              {primaryImage && (
                <p className="mt-3 text-xs text-gray-500">
                  Loaded: {primaryImage.width}×{primaryImage.height}px
                </p>
              )}
            </div>
          </div>

          {/* Secondary */}
          <div
            className={`p-6 border-2 border-dashed rounded-xl transition-all ${
  isDraggingB ? "border-blue-400 bg-blue-900/20" : "border-gray-600 hover:border-gray-500"
}`}
          onDragOver={handleDragOverB}
          onDragLeave={handleDragLeaveB}
          onDrop={handleDropB}
        >
          <div className="text-center">
            <p className="font-semibold mb-2">Secondary Image (B) — optional</p>
            <p className="mb-3 text-sm text-gray-400">Drag & drop, or</p>
            <input
              ref={fileInputBRef}
              type="file"
              accept="image/*"
              onChange={onFileSelectB}
              className="hidden"
            />
          </div>
          <div className="text-center">
            <button
              onClick={() => fileInputBRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Browse Files
            </button>
            {secondaryImage && (
              <p className="mt-3 text-xs text-gray-500">
                Loaded: {secondaryImage.width}×{secondaryImage.height}px
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Controls Grid */}
      {rendererMode === "2d" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* Pixelation Controls */}
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
            <h3 className="text-lg font-semibold mb-4 text-purple-400">Pixelation</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">
                  Pixel Size: {pixelSize}px
                </label>
                <input
                  type="range"
                  min="2"
                  max="128"
                  value={pixelSize}
                  onChange={(e) => setPixelSize(parseInt(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Pixel Shape</label>
                <select
                  value={pixelShape}
                  onChange={(e) => setPixelShape(e.target.value)}
                  className="w-full p-2 bg-gray-700 rounded-lg text-sm"
                >
                  <option value="square">Square</option>
                  <option value="circle">Circle</option>
                  <option value="diamond">Diamond</option>
                  <option value="hexagon">Hexagon</option>
                </select>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={grayscale}
                  onChange={(e) => setGrayscale(e.target.checked)}
                  className="accent-purple-500"
                />
                <span className="text-sm">Black & White</span>
              </label>
            </div>
          </div>

          {/* Effects */}
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
            <h3 className="text-lg font-semibold mb-4 text-purple-400">Effects</h3>
            <div className="space-y-4">
              <select
                value={activeEffect}
                onChange={(e) => { setActiveEffect(e.target.value); startTimeRef.current = 0; }}
                className="w-full p-2 bg-gray-700 rounded-lg text-sm"
              >
                <option value="none">None</option>
                <option value="wave">Wave</option>
                <option value="dance">Dance</option>
                <option value="spiral">Spiral</option>
                <option value="explosion">Explosion</option>
                <option value="gravity">Gravity</option>
                <option value="staircase">Staircase</option>
                <option value="fight">Fight & Collapse</option>
                <option value="breathe">Breathe</option>
                <option value="melt">Melt</option>
              </select>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">
                  Intensity: {intensity}
                </label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={intensity}
                  onChange={(e) => setIntensity(parseInt(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">
                  Speed: {speed.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
              {(activeEffect === "wave" || activeEffect === "staircase") && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Amplitude: {amplitude}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={amplitude}
                    onChange={(e) => setAmplitude(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
              )}
              {activeEffect === "wave" && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Frequency: {frequency.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.02"
                    max="0.6"
                    step="0.01"
                    value={frequency}
                    onChange={(e) => setFrequency(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mixing / Two-photo */}
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
            <h3 className="text-lg font-semibold mb-4 text-purple-400">Mixing (Two Photos)</h3>
            <div className="space-y-4">
              <select
                value={combineMode}
                onChange={(e) => { setCombineMode(e.target.value); if (e.target.value === "scramble") restartScramble(); }}
                className="w-full p-2 bg-gray-700 rounded-lg text-sm"
              >
                <option value="none">None</option>
                <option value="checkerboard" disabled={!secondaryImage}>Checkerboard (every second pixel)</option>
                <option value="rows" disabled={!secondaryImage}>Alternate Rows</option>
                <option value="columns" disabled={!secondaryImage}>Alternate Columns</option>
                <option value="scramble">Random Scramble → Settle</option>
              </select>
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm text-gray-400">Swap A/B</label>
                <button
                  onClick={() => setSwapAB((s) => !s)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  {swapAB ? "A←→B (swapped)" : "A←→B"}
                </button>
              </div>
              {combineMode === "scramble" && (
                <>
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">
                      Scramble Duration: {scrambleDuration}s
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={scrambleDuration}
                      onChange={(e) => setScrambleDuration(parseInt(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                  <button
                    onClick={restartScramble}
                    className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                    title="S"
                  >
                    Restart Scramble
                  </button>
                </>
              )}
              {!secondaryImage && (
                <p className="text-xs text-gray-500">
                  Tip: load a secondary image (B) to enable checkerboard/rows/columns mixing.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* 3D: Mode */}
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
            <h3 className="text-lg font-semibold mb-4 text-purple-400">3D Mode</h3>
            <div className="space-y-4">
              <select
                value={threeEffect}
                onChange={(e) => setThreeEffect(e.target.value)}
                className="w-full p-2 bg-gray-700 rounded-lg text-sm"
              >
                <option value="voxel">Voxel Heightfield (photo-based)</option>
                <option value="balls">Coloured Balls (photo-based)</option>
                <option value="spiral">Spiral Particles (photo-mapped)</option>
                <option value="blackhole">Black Hole (photo-colored disk)</option>
              </select>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={threeAutoRotate}
                  onChange={(e) => setThreeAutoRotate(e.target.checked)}
                  className="accent-purple-500"
                />
                <span className="text-sm">Auto-rotate</span>
              </label>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">
                  Rotate Speed: {threeRotateSpeed.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={threeRotateSpeed}
                  onChange={(e) => setThreeRotateSpeed(parseFloat(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>
          </div>

          {/* 3D: Voxel controls */}
          {threeEffect === "voxel" && (
            <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
              <h3 className="text-lg font-semibold mb-4 text-purple-400">Voxelizer</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Color Gain: {colorGain.toFixed(2)}
                  </label>
                  <input type="range" min="0.5" max="2.5" step="0.01" value={colorGain} onChange={(e) => setColorGain(parseFloat(e.target.value))} className="w-full accent-purple-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Sample Cell: {voxelCell}px
                  </label>
                  <input
                    type="range"
                    min="4"
                    max="40"
                    value={voxelCell}
                    onChange={(e) => setVoxelCell(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Voxel Gap: {voxelGap.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.45"
                    step="0.01"
                    value={voxelGap}
                    onChange={(e) => setVoxelGap(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Height Scale: {voxelHeightScale}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={voxelHeightScale}
                    onChange={(e) => setVoxelHeightScale(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Photo Colour Source</label>
                  <select
                    value={voxelColorMode}
                    onChange={(e) => setVoxelColorMode(e.target.value)}
                    className="w-full p-2 bg-gray-700 rounded-lg text-sm"
                  >
                    <option value="a">Image A</option>
                    <option value="b" disabled={!secondaryImage}>Image B</option>
                    <option value="mix">A↔B Mix</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    A↔B Morph: {secondaryImage ? voxelMorph.toFixed(2) : "(B not loaded)"}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    disabled={!secondaryImage || voxelColorMode !== "mix"}
                    value={voxelMorph}
                    onChange={(e) => setVoxelMorph(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!secondaryImage}
                    checked={voxelMorphAuto && Boolean(secondaryImage)}
                    onChange={(e) => setVoxelMorphAuto(e.target.checked)}
                    className="accent-purple-500"
                  />
                  <span className="text-sm">Auto morph A↔B</span>
                </label>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Morph Speed: {voxelMorphSpeed.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={voxelMorphSpeed}
                    onChange={(e) => setVoxelMorphSpeed(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voxelUnlit}
                    onChange={(e) => setVoxelUnlit(e.target.checked)}
                    className="accent-purple-500"
                  />
                  <span className="text-sm">Photoreal colours (unlit)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voxelUnderlay}
                    onChange={(e) => setVoxelUnderlay(e.target.checked)}
                    className="accent-purple-500"
                  />
                  <span className="text-sm">Show underlay image plane</span>
                </label>
              </div>
            </div>
          )}

          {/* 3D: Balls controls */}
          {threeEffect === "balls" && (
            <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
              <h3 className="text-lg font-semibold mb-4 text-purple-400">Balls</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Color Gain: {colorGain.toFixed(2)}
                  </label>
                  <input type="range" min="0.5" max="2.5" step="0.01" value={colorGain} onChange={(e) => setColorGain(parseFloat(e.target.value))} className="w-full accent-purple-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Sample Cell: {ballCell}px
                  </label>
                  <input type="range" min="4" max="40" value={ballCell} onChange={(e) => setBallCell(parseInt(e.target.value))} className="w-full accent-purple-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Ball Radius: {ballRadius.toFixed(2)}
                  </label>
                  <input type="range" min="0.1" max="1.2" step="0.01" value={ballRadius} onChange={(e) => setBallRadius(parseFloat(e.target.value))} className="w-full accent-purple-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Motion Amplitude: {ballMotionAmp.toFixed(2)}
                  </label>
                  <input type="range" min="0" max="3" step="0.01" value={ballMotionAmp} onChange={(e) => setBallMotionAmp(parseFloat(e.target.value))} className="w-full accent-purple-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Motion Speed: {ballMotionSpeed.toFixed(2)}
                  </label>
                  <input type="range" min="0" max="3" step="0.01" value={ballMotionSpeed} onChange={(e) => setBallMotionSpeed(parseFloat(e.target.value))} className="w-full accent-purple-500" />
                </div>
              </div>
            </div>
          )}

          {/* 3D: Spiral controls */}
          {threeEffect === "spiral" && (
            <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
              <h3 className="text-lg font-semibold mb-4 text-purple-400">Spiral Particles (Photo-Mapped)</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Count: {spiralCount.toLocaleString()}
                  </label>
                  <input
                    type="range"
                    min="2000"
                    max="120000"
                    step="1000"
                    value={spiralCount}
                    onChange={(e) => setSpiralCount(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Opacity: {spiralOpacity.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={spiralOpacity}
                    onChange={(e) => setSpiralOpacity(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Motion Speed: {spiralSpeed.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={spiralSpeed}
                    onChange={(e) => setSpiralSpeed(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Scale: {spiralScale.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.6"
                    max="4"
                    step="0.05"
                    value={spiralScale}
                    onChange={(e) => setSpiralScale(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Photo influence: {spiralPhotoInfluence.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={spiralPhotoInfluence}
                    onChange={(e) => setSpiralPhotoInfluence(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3D: Black hole controls */}
          {threeEffect === "blackhole" && (
            <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
              <h3 className="text-lg font-semibold mb-4 text-purple-400">Black Hole (Photo Disk)</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Particles: {bhCount.toLocaleString()}
                  </label>
                  <input
                    type="range"
                    min="5000"
                    max="120000"
                    step="1000"
                    value={bhCount}
                    onChange={(e) => setBhCount(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Opacity: {bhOpacity.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.01"
                    value={bhOpacity}
                    onChange={(e) => setBhOpacity(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">
                      Inner Radius: {bhInner.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0.2"
                      max="2.5"
                      step="0.01"
                      value={bhInner}
                      onChange={(e) => setBhInner(parseFloat(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">
                      Outer Radius: {bhOuter.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min={bhInner + 0.1}
                      max="8"
                      step="0.01"
                      value={bhOuter}
                      onChange={(e) => setBhOuter(parseFloat(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">
                      Spin: {bhSpin.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.01"
                      value={bhSpin}
                      onChange={(e) => setBhSpin(parseFloat(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">
                      Infall: {bhInfall.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.01"
                      value={bhInfall}
                      onChange={(e) => setBhInfall(parseFloat(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Glow: {bhGlow.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={bhGlow}
                    onChange={(e) => setBhGlow(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Colours along the disk map to your photo(s): angle → x, radius → y. Load B to morph A↔B.
                </p>
              </div>
            </div>
          )}

          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
            <h3 className="text-lg font-semibold mb-4 text-purple-400">Tips</h3>
            <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
              <li>Voxel mode uses the photo plane underlay and unlit colours for true spectrum fidelity.</li>
              <li>Spiral & Black Hole pull colours from your photo using polar mapping.</li>
              <li>Use A↔B morph to animate between two moods.</li>
            </ul>
          </div>
        </div>
      )}
</div>
      {/* Stage */}
      <div ref={stageRef} className={`${lightBg ? 'bg-white' : 'bg-gray-900/60'} ${isFullscreen ? 'rounded-none p-0 ring-0' : 'rounded-xl p-1 ring-1 ring-gray-800'}`}>
        {!isFullscreen && (
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm text-gray-400">
              {primaryImage ? (
                <>
                  Image A: {primaryImage.width}×{primaryImage.height}px
                  {secondaryImage ? ` • Image B: ${secondaryImage.width}×${secondaryImage.height}px` : ""}
                </>
              ) : (
                "No image loaded yet"
              )}
            </div>
            <div className="text-xs text-gray-500">
              Shortcuts: <kbd>Space</kbd> play/pause • <kbd>F</kbd> fullscreen • <kbd>D</kbd> download •{" "}
              <kbd>R</kbd> reset • <kbd>S</kbd> restart scramble
            </div>
          </div>
        )}

        {/* 2D + 3D layout: in fullscreen stack with 3D taking more height; otherwise 3D wider */}
        {isFullscreen ? (
          showThreeInFullscreen ? (
            <div className="grid grid-cols-1 gap-2">
              {/* 2D smaller */}
              <div
                ref={canvasBoxRef}
                className={`${lightBg ? 'bg-white' : 'bg-black'} rounded-none relative overflow-hidden shadow-inner`}
                style={{ height: '35vh' }}
              >
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
              </div>

              {/* 3D larger (≥ half) */}
              <div
                ref={threeMountRef}
                className={`${lightBg ? 'bg-white' : 'bg-black'} rounded-none relative overflow-hidden shadow-inner`}
                style={{ height: '55vh' }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {/* 2D only in fullscreen */}
              <div
                ref={canvasBoxRef}
                className={`${lightBg ? 'bg-white' : 'bg-black'} rounded-none relative overflow-hidden shadow-inner`}
                style={{ height: '90vh' }}
              >
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
              </div>
            </div>
          )
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1.35fr' }}>
            <div
              ref={canvasBoxRef}
              className={`relative overflow-hidden ${lightBg ? 'bg-white' : 'bg-black'} ${isFullscreen ? 'rounded-none' : 'rounded-lg'} shadow-inner`}
              style={{ height: '520px' }}
            >
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
            </div>
            <div
              ref={threeMountRef}
              className={`relative overflow-hidden ${lightBg ? 'bg-white' : 'bg-black'} ${isFullscreen ? 'rounded-none' : 'rounded-lg'} shadow-inner`}
              style={{ height: '520px' }}
            />
          </div>
        )}

        {/* Source images (stacked). Hidden in fullscreen */}
        {!isFullscreen && (
          <div className="mt-4 space-y-12">
            {/* A (top) */}
            <div
              className={`${lightBg ? 'bg-white' : 'bg-black/80'} ${isFullscreen ? 'rounded-none' : 'rounded-lg'} overflow-hidden`}
              style={{ height: '160px' }}
            >
              {primaryImage ? (
                <img
                  src={primaryImage.src}
                  alt="Image A"
                  className="block w-full h-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-500 text-sm">
                  Image A not loaded
                </div>
              )}
            </div>
            {/* B (bottom) */}
            <div
              className={`${lightBg ? 'bg-white' : 'bg-black/80'} ${isFullscreen ? 'rounded-none' : 'rounded-lg'} overflow-hidden`}
              style={{ height: '160px' }}
            >
              {secondaryImage ? (
                <img
                  src={secondaryImage.src}
                  alt="Image B"
                  className="block w-full h-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-500 text-sm">
                  Image B not loaded
                </div>
              )}
            </div>
          </div>
        )}

        {!primaryImage && !isFullscreen && (
          <div className="text-center text-gray-500 text-sm mt-4">
            Upload a primary image to get started.
          </div>
        )}
      </div>
    </div>
  );
}
