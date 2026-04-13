import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ============================================================
// CONFIG
// ============================================================
const CHAOS_COLOR   = '#FF0033';
const ACCENT_COLOR  = '#00FFCC';
const GRAVITY_2D    = 860;   // px/s²
const GRAVITY_3D    = 13;    // Three.js world units/s²
const FLOOR_Y_3D    = -10.8; // Three.js world floor
const TOP_Y_3D      = 13.5;  // Three.js spawn height
const L_X_3D        = -9.5;
const R_X_3D        = 9.5;

// 掉落文字内容
const PRODUCT_TEXTS = [
  'Anatome', 'A boutique for curious girls.', 'Praying Candle',
  'Dreamy perfume', 'Blinkie Pouch', '40.00SGD', '25.00SGD',
];

const BASE = import.meta.env.BASE_URL;

// 掉落图片列表
const IMG_FILES = [
  BASE + 'blinkiebouch.png',
  BASE + 'hands.png',
  BASE + 'perrfume.png',
];

// GLB 模型列表
const GLB_FILES = [
  BASE + 'barbie.glb',
  BASE + 'organ1.glb',
  BASE + 'organ2.glb',
  BASE + 'organ3.glb',
];

// 预加载的 GLB 场景缓存
const glbCache = {};

// ============================================================
// STATE
// ============================================================
let domLayer, domItems = [];
let threeCanvas, threeScene, threeCam, threeRend;
let chaos3D       = [];
let animRunning   = false;
let lastTS        = 0;
let chaosStarted  = false;
let glitchCleanup = null;

// ============================================================
// HELPERS
// ============================================================
function mkEl(tag, opts = {}) {
  const e = document.createElement(tag);
  const { innerHTML, textContent, style, ...rest } = opts;
  if (innerHTML   !== undefined) e.innerHTML   = innerHTML;
  if (textContent !== undefined) e.textContent = textContent;
  if (style       !== undefined) e.style.cssText = style;
  Object.entries(rest).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

// ============================================================
// INJECT STYLES
// ============================================================
function injectStyles() {
  const css = `
    /* ---- 对话框按钮 ---- */
    .chaos-btn-choice {
      flex: 1; padding: 11px 16px;
      border: 2px solid #000;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px; cursor: pointer;
      transition: background 0.15s, color 0.15s;
      letter-spacing: 0.04em;
    }
    .chaos-btn-yes { background: #fff; color: #000; }
    .chaos-btn-yes:hover { background: #000; color: #fff; }
    .chaos-btn-no  { background: #000; color: #fff; }
    .chaos-btn-no:hover  { background: ${CHAOS_COLOR}; border-color: ${CHAOS_COLOR}; }

    /* ---- 容器抖动 ---- */
    @keyframes chaosShake {
      0%,100% { transform: translate(0, 0); }
      8%  { transform: translate(-6px,  3px); }
      16% { transform: translate( 6px, -3px); }
      24% { transform: translate(-4px,  5px); }
      32% { transform: translate( 5px, -5px); }
      40% { transform: translate(-7px,  2px); }
      48% { transform: translate( 7px, -2px); }
      56% { transform: translate(-3px,  6px); }
      64% { transform: translate( 3px, -6px); }
      72% { transform: translate(-5px,  3px); }
      80% { transform: translate( 5px, -3px); }
      88% { transform: translate(-2px,  5px); }
    }

    /* ---- iframe 容器滤镜故障 ---- */
    @keyframes chaosFilter {
      0%,100% { filter: none; }
      10% { filter: hue-rotate(90deg)  contrast(1.8) saturate(2.2); }
      20% { filter: hue-rotate(180deg) invert(0.12) brightness(1.4); }
      30% { filter: hue-rotate(260deg) contrast(2.2) saturate(3);   }
      45% { filter: none; }
      55% { filter: hue-rotate(45deg)  saturate(2.8) brightness(1.3); }
      65% { filter: hue-rotate(310deg) contrast(1.6); }
      75% { filter: none; }
      85% { filter: hue-rotate(130deg) contrast(2.5) saturate(2.5); }
    }

    #inner-web-window.chaos-glitching {
      animation: chaosShake  0.10s steps(1) infinite,
                 chaosFilter 0.16s steps(1) infinite;
    }

    /* ---- 扫描线 ---- */
    @keyframes scanDown {
      0%   { top: -8px;  }
      100% { top: 100%;  }
    }
    #chaos-scan {
      position: absolute; left: 0; width: 100%; height: 7px;
      background: rgba(255,255,255,0.85);
      pointer-events: none; z-index: 30;
      animation: scanDown 0.38s linear infinite;
    }

    /* ---- 彩色闪烁层 ---- */
    @keyframes glitchRedFlash {
      0%,100% { opacity: 0; transform: translate(0); }
      6%  { opacity: 0.5; transform: translate(-5px, 0); }
      12% { opacity: 0;   transform: translate( 5px, 0); }
      44% { opacity: 0; }
      50% { opacity: 0.6; transform: translate(-4px, 0); }
      56% { opacity: 0; }
      78% { opacity: 0; }
      84% { opacity: 0.4; transform: translate( 4px, 0); }
      90% { opacity: 0; }
    }
    @keyframes glitchCyanFlash {
      0%,100% { opacity: 0; transform: translate(0); }
      14% { opacity: 0; }
      20% { opacity: 0.45; transform: translate(4px, 0); }
      26% { opacity: 0;    transform: translate(-4px, 0); }
      60% { opacity: 0; }
      66% { opacity: 0.5; transform: translate(3px, 0); }
      72% { opacity: 0; }
    }
    #chaos-red-layer {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: ${CHAOS_COLOR}; mix-blend-mode: multiply;
      opacity: 0; pointer-events: none; z-index: 28;
      animation: glitchRedFlash 0.12s steps(1) infinite;
    }
    #chaos-cyan-layer {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: ${ACCENT_COLOR}; mix-blend-mode: screen;
      opacity: 0; pointer-events: none; z-index: 29;
      animation: glitchCyanFlash 0.14s steps(1) infinite;
    }

    /* ---- 评价按钮脉冲 ---- */
    @keyframes btnPulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(0,0,0,0.3); }
      50%      { box-shadow: 0 0 0 5px rgba(0,0,0,0); }
    }
    #chaos-review-btn {
      animation: btnPulse 2.4s ease-in-out infinite;
    }
  `;
  document.head.appendChild(mkEl('style', { textContent: css }));
}

// ============================================================
// BUILD UI
// ============================================================
function buildUI() {
  injectStyles();

  // --- 2D 掉落物 DOM 层 ---
  domLayer = mkEl('div', {
    id: 'chaos-dom-layer',
    style: `position:fixed;top:0;left:0;width:100vw;height:100vh;
            z-index:60;pointer-events:none;overflow:hidden;`,
  });
  document.body.appendChild(domLayer);

  // --- Three.js 3D 掉落层 ---
  threeCanvas = mkEl('canvas', {
    id: 'chaos-3d-canvas',
    style: `position:fixed;top:0;left:0;width:100vw;height:100vh;
            z-index:65;pointer-events:none;`,
  });
  document.body.appendChild(threeCanvas);

  // --- 评价按钮（embed 右下角）---
  const btn = mkEl('div', {
    id: 'chaos-review-btn',
    innerHTML: `<span style="font:600 10px/1 'Helvetica Neue',Arial,sans-serif;
                letter-spacing:0.12em;">REVIEW</span>`,
    style: `position:fixed;bottom:24px;right:calc(15% + 16px);z-index:80;
            padding:11px 22px;background:#000;color:#fff;border-radius:999px;
            cursor:pointer;opacity:0;
            transition:opacity 1.2s ease, transform 0.15s ease;
            user-select:none;`,
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.08)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
  });
  btn.addEventListener('click', showDialog);
  document.body.appendChild(btn);

  // --- 对话框遮罩 ---
  const backdrop = mkEl('div', {
    id: 'chaos-backdrop',
    style: `position:fixed;top:0;left:0;width:100vw;height:100vh;
            z-index:89;background:rgba(0,0,0,0.35);display:none;`,
  });
  backdrop.addEventListener('click', closeDialog);
  document.body.appendChild(backdrop);

  // --- 对话框 ---
  const dlg = mkEl('div', {
    id: 'chaos-dialog',
    innerHTML: `
      <p style="margin:0 0 22px;font-size:19px;font-weight:bold;
                letter-spacing:0.04em;line-height:1.45;">
        Do you like this website?
      </p>
      <div style="display:flex;gap:12px;">
        <button class="chaos-btn-choice chaos-btn-yes">YES ♡</button>
        <button class="chaos-btn-choice chaos-btn-no">NO</button>
      </div>
    `,
    style: `position:fixed;top:50%;left:50%;
            transform:translate(-50%,-50%);z-index:90;
            background:#fff;padding:30px 38px;
            font-family:'Helvetica Neue',Arial,sans-serif;
            min-width:268px;display:none;
            border:2px solid #000;box-shadow:6px 6px 0 #000;`,
  });
  document.body.appendChild(dlg);

  dlg.querySelector('.chaos-btn-yes').addEventListener('click', () => {
    closeDialog();
  });
  dlg.querySelector('.chaos-btn-no').addEventListener('click', () => {
    closeDialog();
    setTimeout(startChaos, 180);
  });
}

// ============================================================
// BUTTON / DIALOG
// ============================================================
function showButton() {
  const btn = document.getElementById('chaos-review-btn');
  if (btn) btn.style.opacity = '1';
}

function showDialog() {
  document.getElementById('chaos-dialog').style.display  = 'block';
  document.getElementById('chaos-backdrop').style.display = 'block';
  const btn = document.getElementById('chaos-review-btn');
  if (btn) btn.style.opacity = '0.2';
}

function closeDialog() {
  document.getElementById('chaos-dialog').style.display  = 'none';
  document.getElementById('chaos-backdrop').style.display = 'none';
  const btn = document.getElementById('chaos-review-btn');
  if (btn) btn.style.opacity = '0';
}

// ============================================================
// CHAOS SEQUENCE
// ============================================================
function startChaos() {
  if (chaosStarted) return;
  chaosStarted = true;

  // === Phase 1 (0 ~ 950ms): 故障效果 ===
  const iw = document.getElementById('inner-web-window');

  if (iw) {
    // 给容器加 shake + filter 动画
    iw.classList.add('chaos-glitching');

    // 在 inner-web-window 内部插入彩色层 + 扫描线
    const redLayer  = mkEl('div', { id: 'chaos-red-layer'  });
    const cyanLayer = mkEl('div', { id: 'chaos-cyan-layer' });
    const scan      = mkEl('div', { id: 'chaos-scan'       });
    iw.appendChild(redLayer);
    iw.appendChild(cyanLayer);
    iw.appendChild(scan);
    glitchCleanup = () => {
      redLayer.remove();
      cyanLayer.remove();
      scan.remove();
    };
  }

  // === Phase 2 (950ms): iframe 淡出并从 DOM 移除，背景变红 ===
  setTimeout(() => {
    if (iw) {
      iw.classList.remove('chaos-glitching');
      iw.style.transition = 'opacity 0.38s';
      iw.style.opacity    = '0';
      // 过渡完成后彻底移除
      setTimeout(() => iw.remove(), 420);
    }
    if (glitchCleanup) { glitchCleanup(); glitchCleanup = null; }

    document.body.style.transition      = 'background-color 0.45s';
    document.body.style.backgroundColor = CHAOS_COLOR;
  }, 950);

  // === Phase 3 (1350ms): 开始掉落 ===
  setTimeout(spawnAllItems, 1350);
}

// ============================================================
// SPAWN ALL ITEMS  —— 在 0~5.5s 内随机错落出现
// ============================================================
function spawnAllItems() {
  const WINDOW = 5500;
  const tasks  = [];

  // 每张图片随机重复 2~3 次，尺寸略微随机
  IMG_FILES.forEach((src) => {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const scale = 0.7 + Math.random() * 0.7;
      const w = Math.round(160 * scale);
      const h = Math.round(200 * scale);
      tasks.push({ delay: Math.random() * WINDOW * 0.75, fn: () => spawnImageBox(src, w, h) });
    }
  });

  PRODUCT_TEXTS.forEach((text) => {
    tasks.push({ delay: Math.random() * WINDOW, fn: () => spawnText(text) });
  });

  tasks.sort((a, b) => a.delay - b.delay);
  tasks.forEach(({ delay, fn }) => setTimeout(fn, delay));

  // 3D GLB 模型
  initThreeJS();
  const loader = new GLTFLoader();
  GLB_FILES.forEach((path) => {
    loader.load(path, (gltf) => {
      glbCache[path] = gltf.scene;
    });
    // 每个模型掉落 2 次，错开时间
    for (let rep = 0; rep < 2; rep++) {
      const d = 300 + Math.random() * WINDOW;
      setTimeout(() => spawnOneShape(path), d);
    }
  });

  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('ribcageCollapse'));
  }, WINDOW + 2500);

  animRunning = true;
  lastTS = performance.now();
  requestAnimationFrame(physicsLoop);
}

// ============================================================
// 2D IMAGE BOX
// ============================================================
function spawnImageBox(src, w, h) {
  const iL = window.innerWidth * 0.15;
  const iW = window.innerWidth * 0.70;
  const x  = iL + Math.random() * Math.max(0, iW - w);

  const div = mkEl('div', {
    style: `position:fixed;width:${w}px;height:${h}px;
            top:${-h - 12}px;left:${x}px;
            border-radius:12px;
            pointer-events:none;overflow:hidden;
            transform-origin:center center;`,
    innerHTML: `<img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;" draggable="false"/>`,
  });
  domLayer.appendChild(div);

  domItems.push({
    el: div, x, y: -h - 12, w, h,
    vx:   (Math.random() - 0.5) * 190,
    vy:   Math.random() * 60 - 15,
    rot:  (Math.random() - 0.5) * 22,
    avel: (Math.random() - 0.5) * 95,
    landed: false,
  });
}

// ============================================================
// 2D TEXT ITEM
// ============================================================
function spawnText(text) {
  const iL     = window.innerWidth * 0.15;
  const iW     = window.innerWidth * 0.70;
  const isPrice = text.startsWith('¥');
  const isBig   = isPrice || ['SALE', 'SOLD OUT', 'ANATOME', 'LIMITED'].includes(text);
  const fs      = isBig ? (20 + Math.random() * 22) : (13 + Math.random() * 14);
  const x       = iL + Math.random() * Math.max(0, iW - 240);

  // 随机样式：黑底白字 / 白底黑字 / 无背景
  const styleVariant = Math.random();
  let color, bgStyle;
  if (styleVariant < 0.35) {
    color   = '#fff'; bgStyle = `background:#000;padding:3px 8px;border-radius:6px;`;
  } else if (styleVariant < 0.55) {
    color   = '#000'; bgStyle = `background:#fff;padding:3px 8px;border-radius:6px;`;
  } else {
    color   = '#fff'; bgStyle = '';
  }

  const div = mkEl('div', {
    style: `position:fixed;top:-60px;left:${x}px;
            font:${isBig ? 'bold' : '600'} ${fs}px/1.2
              'Helvetica Neue',Arial,sans-serif;
            color:${color};${bgStyle}
            white-space:nowrap;pointer-events:none;
            letter-spacing:0.05em;transform-origin:center center;`,
    textContent: text,
  });
  domLayer.appendChild(div);

  const w = fs * text.length * 0.62;
  const h = fs * 1.5;

  domItems.push({
    el: div, x, y: -60, w, h,
    vx:   (Math.random() - 0.5) * 130,
    vy:   Math.random() * 40 - 10,
    rot:  (Math.random() - 0.5) * 28,
    avel: (Math.random() - 0.5) * 115,
    landed: false,
  });
}

// ============================================================
// PHYSICS LOOP (2D)
// ============================================================
function physicsLoop(ts) {
  if (!animRunning) return;
  const dt    = Math.min((ts - lastTS) / 1000, 0.05);
  lastTS      = ts;

  const floor  = window.innerHeight - 30;
  const lBound = window.innerWidth * 0.13;
  const rBound = window.innerWidth * 0.87;

  for (const item of domItems) {
    if (item.landed) {
      item.avel *= 0.83;
      item.rot  += item.avel * dt;
      item.el.style.transform = `rotate(${item.rot}deg)`;
      continue;
    }

    item.vy  += GRAVITY_2D * dt;
    item.x   += item.vx   * dt;
    item.y   += item.vy   * dt;
    item.rot += item.avel * dt;

    // 地板碰撞
    if (item.y + item.h > floor) {
      item.y   = floor - item.h;
      item.vy *= -0.32;
      item.vx *= 0.73;
      item.avel *= 0.58;
      if (Math.abs(item.vy) < 20) { item.landed = true; item.vy = 0; }
    }

    // 侧壁碰撞
    if (item.x < lBound)              { item.x = lBound;            item.vx *= -0.44; }
    if (item.x + item.w > rBound)     { item.x = rBound - item.w;   item.vx *= -0.44; }

    item.el.style.top       = `${item.y}px`;
    item.el.style.left      = `${item.x}px`;
    item.el.style.transform = `rotate(${item.rot}deg)`;
  }

  update3D(dt);
  requestAnimationFrame(physicsLoop);
}

// ============================================================
// THREE.JS SETUP
// ============================================================
function initThreeJS() {
  threeScene = new THREE.Scene();

  const aspect = window.innerWidth / window.innerHeight;
  threeCam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  threeCam.position.set(0, 0, 20);

  threeRend = new THREE.WebGLRenderer({
    canvas:    threeCanvas,
    alpha:     true,
    antialias: true,
  });
  threeRend.setSize(window.innerWidth, window.innerHeight);
  threeRend.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRend.setClearColor(0x000000, 0);

  // 光源
  const amb = new THREE.AmbientLight(0xffffff, 1.8);
  threeScene.add(amb);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5, 10, 10);
  threeScene.add(key);

  const fill = new THREE.DirectionalLight(0xff0033, 1.4);
  fill.position.set(-5, -5, 5);
  threeScene.add(fill);

  const back = new THREE.DirectionalLight(0x00ffcc, 0.8);
  back.position.set(0, -8, -5);
  threeScene.add(back);
}

// ============================================================
// 3D SHAPES  —— 使用 GLB 模型，由 spawnAllItems 控制调度时机
// ============================================================
function spawnOneShape(path) {
  if (!threeScene) return;

  const cached = glbCache[path];
  if (!cached) {
    // 模型还未加载完，稍后重试
    setTimeout(() => spawnOneShape(path), 300);
    return;
  }

  // SkeletonUtils.clone 正确处理蒙皮网格（SkinnedMesh / Barbie 等）
  const root = SkeletonUtils.clone(cached);

  // 用原始缓存模型计算尺寸（clone 后蒙皮模型 bbox 可能为零）
  const box = new THREE.Box3().setFromObject(cached);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const isBarbie = path.includes('barbie');
  const targetSize = isBarbie
    ? 8.0 + Math.random() * 1.5   // barbie 专用尺寸
    : 4.0 + Math.random() * 1.5;  // 其他模型
  root.scale.setScalar(targetSize / maxDim);

  root.position.set(
    L_X_3D + Math.random() * (R_X_3D - L_X_3D),
    TOP_Y_3D + Math.random() * 3.5,
    (Math.random() - 0.5) * 2.5,
  );
  root.rotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
  );

  threeScene.add(root);
  chaos3D.push({
    mesh: root,
    vx: (Math.random() - 0.5) * 2.8,
    vy: 0,
    ax: (Math.random() - 0.5) * 4.5,
    ay: (Math.random() - 0.5) * 4.5,
    az: (Math.random() - 0.5) * 4.5,
    landed: false,
  });
}

// ============================================================
// 3D PHYSICS UPDATE
// ============================================================
function update3D(dt) {
  if (!threeRend || !threeScene || !threeCam) return;

  for (const obj of chaos3D) {
    if (obj.landed) {
      obj.ax *= 0.87; obj.ay *= 0.87; obj.az *= 0.87;
      obj.mesh.rotation.x += obj.ax * dt;
      obj.mesh.rotation.y += obj.ay * dt;
      obj.mesh.rotation.z += obj.az * dt;
      continue;
    }

    obj.vy += GRAVITY_3D * dt;
    obj.mesh.position.x += obj.vx * dt;
    obj.mesh.position.y -= obj.vy * dt;  // y 向下为正
    obj.mesh.rotation.x += obj.ax * dt;
    obj.mesh.rotation.y += obj.ay * dt;
    obj.mesh.rotation.z += obj.az * dt;

    // 地板
    if (obj.mesh.position.y < FLOOR_Y_3D) {
      obj.mesh.position.y = FLOOR_Y_3D;
      obj.vy *= -0.3;
      obj.vx *= 0.72;
      obj.ax *= 0.55; obj.ay *= 0.55; obj.az *= 0.55;
      if (Math.abs(obj.vy) < 0.28) { obj.landed = true; obj.vy = 0; }
    }
    // 侧壁
    if (obj.mesh.position.x < L_X_3D) { obj.mesh.position.x = L_X_3D; obj.vx *= -0.48; }
    if (obj.mesh.position.x > R_X_3D) { obj.mesh.position.x = R_X_3D; obj.vx *= -0.48; }
  }

  threeRend.render(threeScene, threeCam);
}

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  if (!threeRend || !threeCam) return;
  const aspect = window.innerWidth / window.innerHeight;
  threeCam.aspect = aspect;
  threeCam.updateProjectionMatrix();
  threeRend.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// ENTRY
// ============================================================
buildUI();

window.addEventListener('anatomeOpened', () => {
  // fallback：8 秒后无论如何都显示
  const fallback = setTimeout(showButton, 8000);
  let triggered = false;

  function trigger() {
    if (triggered) return;
    triggered = true;
    clearTimeout(fallback);
    showButton();
    window.removeEventListener('wheel', onWheelWindow, { passive: true });
    const iw = document.getElementById('inner-web-window');
    if (iw) iw.removeEventListener('wheel', onWheelContainer, { passive: true });
  }

  let accDelta = 0;

  // 方案1：scroll chaining 抵达 window（部分浏览器/设备有效）
  function onWheelWindow(e) {
    if (e.deltaY > 0) trigger();
  }

  // 方案2：监听容器本身的 wheel，累计向下滚动量
  // Framer 某些情况下滚动会溢出到容器层
  function onWheelContainer(e) {
    if (e.deltaY <= 0) return;
    accDelta += e.deltaY;
    if (accDelta >= 300) trigger(); // 累计约 3 次正常滚动
  }

  window.addEventListener('wheel', onWheelWindow, { passive: true });
  const iw = document.getElementById('inner-web-window');
  if (iw) iw.addEventListener('wheel', onWheelContainer, { passive: true });
});
