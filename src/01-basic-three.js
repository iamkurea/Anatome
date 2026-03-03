import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { GLTFAnimationPointerExtension } from '@needle-tools/three-animation-pointer';

let mixer;
const clock = new THREE.Clock();

// 初始化渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
// 确保页面上有 container 元素，如果没有则直接挂载到 body
const container = document.getElementById('container') || document.body;
container.appendChild(renderer.domElement);

// 性能监控
const stats = new Stats();
container.appendChild(stats.dom);

// 场景与环境
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3dd);
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// 相机
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.2, 100);
camera.position.set(-3, 2, 6);

// 控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);
controls.update();
controls.enablePan = false;
controls.enableDamping = true;

// --- 加载器配置 ---
// 使用 CDN 路径加载 Draco 解码器，避免本地文件丢失
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const ktx2Loader = new KTX2Loader()
    .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@latest/examples/jsm/libs/basis/')
    .detectSupport(renderer);

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.setKTX2Loader(ktx2Loader);

// 注册动画指针扩展
loader.register(p => new GLTFAnimationPointerExtension(p));

// 加载模型
loader.load('https://cloud.needle.tools/-/assets/Z23hmXB27L6Db-optimized/file', function (gltf) {
    const model = gltf.scene;
    scene.add(model);

    mixer = new THREE.AnimationMixer(model);
    if (gltf.animations.length > 0) {
        mixer.clipAction(gltf.animations[0]).play();
    }

    // 使用渲染器自带的动画循环
    renderer.setAnimationLoop(animate);

}, undefined, function (e) {
    console.error('模型加载出错：', e);
});

// 窗口自适应
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    controls.update();
    stats.update();
    renderer.render(scene, camera);
}