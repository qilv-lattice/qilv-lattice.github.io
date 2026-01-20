/**
 * SC 晶格动画（旋转晶胞）
 * 简单立方 (Simple Cubic) 晶体结构可视化
 * 位置：左上角（替换原位错滑移面）
 */

(function () {
    'use strict';

    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'sc-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // 配置参数
    const CONFIG = {
        size: 180,
        cellSize: 60,
        atomRadius: 8,
        rotationSpeed: 0.006,
        opacity: 0.75,
        atomColor: '#FFD700', // 默认金色 (深色模式)
        bondColor: 'rgba(255, 255, 255, 0.35)',
        bondWidth: 1.5
    };

    // 监听背景主题变化 (反向变色龙)
    window.addEventListener('lattice-theme-change', (e) => {
        const isDark = e.detail.isDark;
        if (isDark) {
            CONFIG.atomColor = '#FFD700';
            CONFIG.bondColor = 'rgba(255, 255, 255, 0.35)';
        } else {
            CONFIG.atomColor = '#00008B';
            CONFIG.bondColor = 'rgba(0, 0, 0, 0.4)';
        }
    });

    // 设置 Canvas 样式 - 左上角
    canvas.width = CONFIG.size;
    canvas.height = CONFIG.size;
    canvas.style.position = 'fixed';
    canvas.style.top = '15px';
    canvas.style.left = '20px';
    canvas.style.zIndex = '50';
    canvas.style.pointerEvents = 'auto'; // 允许交互
    canvas.style.cursor = 'grab';
    canvas.style.opacity = CONFIG.opacity;

    // SC 晶胞原子坐标（归一化 0-1）- 仅8个角原子
    const atomPositions = [
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
        [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]
    ];

    // 键连接 - SC 晶格的12条边
    const bonds = [
        // 底面
        [0, 1], [0, 2], [1, 4], [2, 4],
        // 顶面
        [3, 5], [3, 6], [5, 7], [6, 7],
        // 垂直边
        [0, 3], [1, 5], [2, 6], [4, 7]
    ];

    let angleY = 0;

    // SC 原本只有 angleY，这里添加 X 轴控制逻辑来兼容统一交互
    // 但原 project 函数是为单轴优化的，我们需要修改 project 函数或者适配
    // 简单起见，我们给 SC 也加个全局 angleX 变量，并修改 projection
    let angleX = 0;

    // 交互状态变量
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let autoRotateTimeout = null;

    // ===== 交互事件监听 =====
    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('touchstart', startDrag, { passive: false });

    window.addEventListener('mousemove', drag);
    window.addEventListener('touchmove', drag, { passive: false });

    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);

    function startDrag(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        lastMouseX = clientX;
        lastMouseY = clientY;
        canvas.style.cursor = 'grabbing';

        if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
        autoRotateTimeout = null;
    }

    function drag(e) {
        if (!isDragging) return;
        if (e.type === 'touchmove' && e.target === canvas) {
            e.preventDefault();
        }
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaX = clientX - lastMouseX;
        const deltaY = clientY - lastMouseY;
        angleY += deltaX * 0.01;
        angleX += deltaY * 0.01; // SC 增加 X 轴旋转支持
        lastMouseX = clientX;
        lastMouseY = clientY;
    }

    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = 'grab';
        if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
        autoRotateTimeout = setTimeout(() => {
            autoRotateTimeout = null;
        }, 2000);
    }

    // 3D 投影函数 (升级支持 X 轴旋转)
    function project(x, y, z, rotY, rotX) {
        // 先中心化
        let cx = x - 0.5;
        let cy = y - 0.5;
        let cz = z - 0.5;

        // 绕 Y 轴旋转
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        let x1 = cx * cosY - cz * sinY;
        let z1 = cx * sinY + cz * cosY;
        let y1 = cy;

        // 绕 X 轴旋转
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        let y2 = y1 * cosX - z1 * sinX;
        let z2 = y1 * sinX + z1 * cosX;
        let x2 = x1;

        // 还原尺寸
        x2 *= CONFIG.cellSize;
        y2 *= CONFIG.cellSize;
        z2 *= CONFIG.cellSize;

        const perspective = 300;
        const scale = perspective / (perspective + z2);

        return {
            x: CONFIG.size / 2 + x2 * scale,
            y: CONFIG.size / 2 + y2 * scale, // SC 不需要特殊的 0.9 压缩了
            z: z2,
            scale: scale
        };
    }

    function draw() {
        ctx.clearRect(0, 0, CONFIG.size, CONFIG.size);

        // 计算所有原子的投影位置
        const projectedAtoms = atomPositions.map(pos =>
            project(pos[0], pos[1], pos[2], angleY, angleX)
        );

        // 按 z 排序绘制键
        const sortedBonds = [...bonds].sort((a, b) => {
            const zA = (projectedAtoms[a[0]].z + projectedAtoms[a[1]].z) / 2;
            const zB = (projectedAtoms[b[0]].z + projectedAtoms[b[1]].z) / 2;
            return zA - zB;
        });

        sortedBonds.forEach(bond => {
            const atom1 = projectedAtoms[bond[0]];
            const atom2 = projectedAtoms[bond[1]];

            ctx.beginPath();
            ctx.moveTo(atom1.x, atom1.y);
            ctx.lineTo(atom2.x, atom2.y);
            ctx.strokeStyle = CONFIG.bondColor;
            ctx.lineWidth = CONFIG.bondWidth * Math.min(atom1.scale, atom2.scale);
            ctx.stroke();
        });

        // 按 z 排序绘制原子
        const sortedAtoms = projectedAtoms
            .map((proj, i) => ({ proj, i }))
            .sort((a, b) => a.proj.z - b.proj.z);

        sortedAtoms.forEach(({ proj }) => {
            const radius = CONFIG.atomRadius * proj.scale;

            // 原子渐变
            const gradient = ctx.createRadialGradient(
                proj.x - radius * 0.3, proj.y - radius * 0.3, 0,
                proj.x, proj.y, radius
            );
            gradient.addColorStop(0, 'white');
            gradient.addColorStop(0.3, CONFIG.atomColor);
            gradient.addColorStop(1, 'rgba(0,0,0,0.3)');

            ctx.beginPath();
            ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        });

        // 标题 (白色高亮 + 阴影增强可读性)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.font = '11px "Noto Serif SC", serif';
        ctx.textAlign = 'center';
        ctx.fillText('SC (Interactive)', CONFIG.size / 2, CONFIG.size - 8);
        // 重置阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        if (!isDragging && !autoRotateTimeout) {
            angleY += CONFIG.rotationSpeed;
        }
        requestAnimationFrame(draw);
    }

    draw();
    console.log('SC Unit Cell Animation initialized');
})();
