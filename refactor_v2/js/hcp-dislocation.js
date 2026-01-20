/**
 * HCP 位错滑移面可视化
 * 密排六方晶格的基面 {0001}<11-20> 滑移系统
 * 位置：右列，与HCP晶格对应
 */

(function () {
    'use strict';

    if (typeof THREE === 'undefined') {
        console.log('Loading Three.js for HCP Dislocation...');
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
        container.id = 'hcp-dislocation-3d';
        container.style.cssText = `
            position: fixed;
            top: 55%;
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
        camera.position.set(3, 3, 4);

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

        // HCP 六方柱框架
        const hexRadius = 1.2;
        const hexHeight = 1.8;

        // 六边形顶点
        function createHexPrism() {
            const material = new THREE.LineBasicMaterial({ color: 0x888888 });
            const points = [];

            // 底面和顶面六边形
            for (let face = 0; face < 2; face++) {
                const y = face === 0 ? -hexHeight / 2 : hexHeight / 2;
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI * 2) / 6;
                    const nextAngle = ((i + 1) * Math.PI * 2) / 6;
                    points.push(
                        new THREE.Vector3(Math.cos(angle) * hexRadius, y, Math.sin(angle) * hexRadius),
                        new THREE.Vector3(Math.cos(nextAngle) * hexRadius, y, Math.sin(nextAngle) * hexRadius)
                    );
                }
            }

            // 垂直边
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                const x = Math.cos(angle) * hexRadius;
                const z = Math.sin(angle) * hexRadius;
                points.push(
                    new THREE.Vector3(x, -hexHeight / 2, z),
                    new THREE.Vector3(x, hexHeight / 2, z)
                );
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            scene.add(new THREE.LineSegments(geometry, material));
        }
        createHexPrism();

        // 基面 {0001} - 两个六边形面
        function createBasalPlane(y, color) {
            const shape = new THREE.Shape();
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                const x = Math.cos(angle) * hexRadius * 1.1;
                const z = Math.sin(angle) * hexRadius * 1.1;
                if (i === 0) shape.moveTo(x, z);
                else shape.lineTo(x, z);
            }
            shape.closePath();

            const geometry = new THREE.ShapeGeometry(shape);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.25
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = y;
            scene.add(mesh);
        }

        createBasalPlane(0, 0x44ff44);  // 中心基面（主滑移面）
        createBasalPlane(-hexHeight / 4, 0x44ff4433);  // 辅助面
        createBasalPlane(hexHeight / 4, 0x44ff4433);   // 辅助面

        // <11-20> 位错线 (基面内方向)
        function createDislocation(points, color) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
            scene.add(new THREE.Line(geometry, material));
        }

        // 三个 <11-20> 方向
        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3;
            const x1 = Math.cos(angle) * hexRadius * 0.8;
            const z1 = Math.sin(angle) * hexRadius * 0.8;
            const x2 = -x1;
            const z2 = -z1;
            const colors = [0xff8800, 0x00ffff, 0xff00ff];
            createDislocation([
                new THREE.Vector3(x1, 0, z1),
                new THREE.Vector3(x2, 0, z2)
            ], colors[i]);
        }

        // 标题
        const title = document.createElement('div');
        title.textContent = 'HCP Basal Slip';
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

        console.log('HCP Dislocation Visualization initialized');
    }
})();
