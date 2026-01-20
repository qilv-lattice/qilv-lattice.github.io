/**
 * BCC 位错滑移面可视化
 * 体心立方晶格的 {110}<111> 滑移系统
 * 位置：右列，与BCC晶格对应
 */

(function () {
    'use strict';

    if (typeof THREE === 'undefined') {
        console.log('Loading Three.js for BCC Dislocation...');
        const threeScript = document.createElement('script');
        threeScript.src = 'https://cdn.jsdelivr.net/npm/three@0.109.0/build/three.min.js';
        threeScript.onload = function () {
            const controlsScript = document.createElement('script');
            controlsScript.src = 'https://cdn.jsdelivr.net/npm/three@0.109.0/examples/js/controls/OrbitControls.js';
            controlsScript.onload = initScene;
            document.head.appendChild(controlsScript);
        };
        document.head.appendChild(threeScript);
    } else {
        initScene();
    }

    function initScene() {
        const CONFIG = {
            size: 160,
            opacity: 0.85
        };

        const container = document.createElement('div');
        container.id = 'bcc-dislocation-3d';
        container.style.cssText = `
            position: fixed;
            top: 28%;
            left: 300px;
            width: ${CONFIG.size}px;
            height: ${CONFIG.size}px;
            z-index: 50;
            border-radius: 8px;
            overflow: hidden;
            opacity: ${CONFIG.opacity};
            pointer-events: auto;
        `;
        document.body.appendChild(container);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        camera.position.set(3, 2.5, 4);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(CONFIG.size, CONFIG.size);
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.2;

        const light = new THREE.DirectionalLight(0xffffff, 0.8);
        light.position.set(5, 5, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0x404040, 0.6));

        scene.add(new THREE.AxesHelper(1.2));

        // BCC 晶胞框架
        const boxGeom = new THREE.BoxGeometry(2, 2, 2);
        const edges = new THREE.EdgesGeometry(boxGeom);
        const cubeEdges = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x888888 }));
        scene.add(cubeEdges);

        // {110} 滑移面 (6个面)
        function createSlipPlane(normal, color) {
            const size = 2.5;
            const geom = new THREE.PlaneGeometry(size, size * 1.414); // 对角面更长
            const mat = new THREE.MeshBasicMaterial({
                color: color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.15
            });
            const plane = new THREE.Mesh(geom, mat);

            const up = new THREE.Vector3(0, 0, 1);
            const n = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
            const axis = new THREE.Vector3().crossVectors(up, n).normalize();
            const angle = Math.acos(up.dot(n));
            if (axis.length() > 0) {
                plane.rotateOnAxis(axis, angle);
            }

            scene.add(plane);
        }

        // {110} 面族 - 对角滑移面
        createSlipPlane([1, 1, 0], 0xff4444);   // (110) 红色
        createSlipPlane([1, -1, 0], 0x44ff44);  // (1-10) 绿色
        createSlipPlane([1, 0, 1], 0x4444ff);   // (101) 蓝色
        createSlipPlane([0, 1, 1], 0xffff44);   // (011) 黄色

        // <111> 位错线 (体对角线方向)
        function createDislocation(points, color) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
            scene.add(new THREE.Line(geometry, material));
        }

        // 沿体对角线方向的位错线
        createDislocation([new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)], 0xff8800);
        createDislocation([new THREE.Vector3(-1, 1, -1), new THREE.Vector3(1, -1, 1)], 0x00ffff);
        createDislocation([new THREE.Vector3(1, -1, -1), new THREE.Vector3(-1, 1, 1)], 0xff00ff);

        // 标题
        const title = document.createElement('div');
        title.textContent = 'BCC {110} Slip';
        title.style.cssText = `
            position: absolute;
            bottom: 5px;
            left: 0;
            right: 0;
            text-align: center;
            color: rgba(255,255,255,0.85);
            font-size: 10px;
            font-family: "Noto Serif SC", serif;
            pointer-events: none;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        `;
        container.appendChild(title);

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        console.log('BCC Dislocation Visualization initialized');
    }
})();
