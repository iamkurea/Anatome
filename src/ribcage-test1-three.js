import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, sceneFG, camera, renderer, rendererFG, mixer, mixerFG, clock, ribcageModel, ribcageFG;
let isOpened = false;
let animationsData = [];
let initialY = 0;

// 倒下物理
let collapseActive = false;
let collapseTime   = 0;
const TILT_DURATION = 0.7;  // 倾斜阶段时长（秒）
const TILT_ANGLE    = Math.PI * 0.55; // 最终倾斜角（略超 90°）
const FALL_GRAVITY  = 4.5;  // 坠落加速度（world units/s²）
let fallVY = 0;

init();

function init() {
    clock = new THREE.Clock();
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 2.4;
    camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 1000);
    camera.position.z = 10;

    // --- 初始化底层场景 ---
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('three-bg').appendChild(renderer.domElement);

    // --- 初始化顶层场景 (前景) ---
    sceneFG = new THREE.Scene();
    rendererFG = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererFG.setSize(window.innerWidth, window.innerHeight);
    rendererFG.localClippingEnabled = true; // 开启裁切支持
    document.getElementById('three-fg').appendChild(rendererFG.domElement);

    // 1. 增强环境光（提供基础亮度，让暗部不至于漆黑）
    const ambient = new THREE.AmbientLight(0xffffff, 1.2); 
    scene.add(ambient);
    sceneFG.add(ambient.clone());

    // 2. 增加主方向光（从右上角射入，产生明显的明暗面，增加立体感）
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
    mainLight.position.set(5, 10, 7);
    scene.add(mainLight);
    sceneFG.add(mainLight.clone());

    // 3. 增加侧翼补光（从左侧射入，补足肋骨侧边的细节）
    const fillLight = new THREE.PointLight(0xffffff, 1.5);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);
    sceneFG.add(fillLight.clone());

    const loader = new GLTFLoader();
    loader.load('public/openribcage.glb', (gltf) => {
        ribcageModel = gltf.scene;
        animationsData = gltf.animations;

        // 计算缩放和位置
        const box = new THREE.Box3().setFromObject(ribcageModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const f = 4.5 / Math.max(size.x, size.y, size.z);
        
        ribcageModel.scale.set(f, f, f);
        ribcageModel.position.set(-center.x * f, (-center.y * f) - 0.5, -center.z * f);
        initialY = ribcageModel.position.y;

        // --- 前景处理：只留尖端 ---
        ribcageFG = ribcageModel.clone();
        // 裁切面：在 Z 轴 0.1 处切一刀，只显示比这个位置更靠前的物体
        const localPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.1); 
        
        ribcageFG.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.clippingPlanes = [localPlane];
            }
        });

        scene.add(ribcageModel);
        sceneFG.add(ribcageFG);

        mixer = new THREE.AnimationMixer(ribcageModel);
        mixerFG = new THREE.AnimationMixer(ribcageFG);
        
        renderer.setAnimationLoop(animate);
    });

    window.addEventListener('click', onDocumentClick);

    window.addEventListener('ribcageCollapse', () => {
        collapseActive = true;
        collapseTime   = 0;
        fallVY         = 0;
    });
}

function onDocumentClick(event) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // 无论点哪个模型（FG或BG），只要点中了就触发
    if (ribcageModel && !isOpened) {
        const intersects = raycaster.intersectObjects(ribcageModel.children, true);
        const intersectsFG = raycaster.intersectObjects(ribcageFG.children, true);

        if (intersects.length > 0 || intersectsFG.length > 0) {
            console.log("双场景动画同步开启...");
            
            // 循环所有动画剪辑
            animationsData.forEach(clip => {
                // 背景模型动作
                const actionBG = mixer.clipAction(clip);
                actionBG.setLoop(THREE.LoopOnce);
                actionBG.clampWhenFinished = true; // 播完停在最后一帧
                actionBG.play();

                // 前景模型动作 (完全镜像)
                const actionFG = mixerFG.clipAction(clip);
                actionFG.setLoop(THREE.LoopOnce);
                actionFG.clampWhenFinished = true; // 播完停在最后一帧
                actionFG.play();
            });

            isOpened = true;

            // 显示网页
            const webWindow = document.getElementById('inner-web-window');
            if (webWindow) {
                setTimeout(() =>{
                    webWindow.style.opacity = "1";
                    // 通知 chaos 系统：页面已展开
                    window.dispatchEvent(new CustomEvent('anatomeOpened'));
                }, 1500);
                webWindow.style.pointerEvents = "auto";
            }

            // 1.5秒后（动画播完）释放点击拦截
            setTimeout(() => {
                document.getElementById('three-fg').style.pointerEvents = 'none';
            }, 1500);
        }
    }
}

function animate() {
    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // 两个 Mixer 必须同时更新
    if (mixer) mixer.update(delta);
    if (mixerFG) mixerFG.update(delta);

    if (ribcageModel && ribcageFG) {
        if (collapseActive) {
            collapseTime += delta;

            // 1. 向后倒：绕 X 轴负方向旋转，easeInQuad 先慢后快
            const t    = Math.min(collapseTime / TILT_DURATION, 1);
            const tilt = -TILT_ANGLE * t * t;   // 负值 = 顶部向后倒
            ribcageModel.rotation.x = tilt;
            ribcageFG.rotation.x    = tilt;

            // 2. 坠落：倾斜 0.2s 后加速下沉
            if (collapseTime > 0.2) {
                fallVY += FALL_GRAVITY * delta;
                const newY = ribcageModel.position.y - fallVY * delta;
                ribcageModel.position.y = newY;
                ribcageFG.position.y    = newY;
            }
        } else {
            const breathe = Math.sin(elapsedTime * 2) * 0.005;
            ribcageModel.position.y = initialY + breathe;
            ribcageFG.position.y    = initialY + breathe;

            const shake = Math.sin(elapsedTime * 0.4) * 0.002;
            ribcageModel.rotation.z = shake;
            ribcageFG.rotation.z    = shake;
        }
    }

    renderer.render(scene, camera);
    rendererFG.render(sceneFG, camera);
}
