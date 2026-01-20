/**
 * FCC 晶格动画（旋转晶胞）
 * 面心立方 (Face-Centered Cubic) 晶体结构可视化
 * 位置：左下角
 */

(function () {
    'use strict';

    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'fcc-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // 配置参数
    // 配置参数
    const CONFIG = {
        size: 180,
        cellSize: 55,
        atomRadius: 7,
        rotationSpeed: 0.008,
        opacity: 0.75,
        atomColor: '#FFD700', // 默认金色 (深色模式)
        bondColor: 'rgba(255, 255, 255, 0.35)',
        bondWidth: 1.2
    };

    // 监听背景主题变化 (反向变色龙)
    window.addEventListener('lattice-theme-change', (e) => {
        const isDark = e.detail.isDark;
        if (isDark) {
            // 深色背景 -> 金色原子
            CONFIG.atomColor = '#FFD700';
            CONFIG.bondColor = 'rgba(255, 255, 255, 0.35)';
        } else {
            // 浅色背景 -> 深蓝原子 (高对比度)
            CONFIG.atomColor = '#00008B';
            CONFIG.bondColor = 'rgba(0, 0, 0, 0.4)';
        }
    });

    // 设置 Canvas 样式
    canvas.width = CONFIG.size;
    canvas.height = CONFIG.size;
    canvas.style.position = 'fixed';
    canvas.style.bottom = '25px';
    canvas.style.left = '25px';  // 左下角
    canvas.style.zIndex = '50';
    canvas.style.pointerEvents = 'auto'; // 允许鼠标/触摸交互
    canvas.style.cursor = 'grab';       // 抓手光标
    canvas.style.opacity = CONFIG.opacity;

    // FCC 晶胞原子坐标（归一化 0-1）
    const atomPositions = [
        // 8个角原子
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
        [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1],
        // 6个面心原子
        [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5],
        [1, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0.5, 1]
    ];

    // 键连接
    const bonds = [
        [8, 0], [8, 1], [8, 2], [8, 4],
        [9, 0], [9, 1], [9, 3], [9, 5],
        [10, 0], [10, 2], [10, 3], [10, 6],
        [11, 1], [11, 4], [11, 5], [11, 7],
        [12, 2], [12, 4], [12, 6], [12, 7],
        [13, 3], [13, 5], [13, 6], [13, 7]
    ];

    let angleY = 0;
    let angleX = 0.35; // 改为 let 允许修改

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

        // 暂停自动旋转
        if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
        autoRotateTimeout = null;
    }

    function drag(e) {
        if (!isDragging) return;

        // 仅当手指在 Canvas 上时阻止滚动
        if (e.type === 'touchmove' && e.target === canvas) {
            e.preventDefault();
        }

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - lastMouseX;
        const deltaY = clientY - lastMouseY;

        // 更新角度 (灵敏度 0.01)
        angleY += deltaX * 0.01;
        angleX += deltaY * 0.01;

        lastMouseX = clientX;
        lastMouseY = clientY;
    }

    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = 'grab';

        // 2秒后恢复自动旋转
        if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
        autoRotateTimeout = setTimeout(() => {
            autoRotateTimeout = null;
        }, 2000);
    }

    function rotateY(point, angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return [point[0] * cos - point[2] * sin, point[1], point[0] * sin + point[2] * cos];
    }

    function rotateX(point, angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return [point[0], point[1] * cos - point[2] * sin, point[1] * sin + point[2] * cos];
    }

    function project(point) {
        return [
            point[0] * CONFIG.cellSize + CONFIG.size / 2,
            point[1] * CONFIG.cellSize + CONFIG.size / 2,
            point[2]
        ];
    }

    function draw() {
        ctx.clearRect(0, 0, CONFIG.size, CONFIG.size);

        const transformedAtoms = atomPositions.map(pos => {
            let centered = [pos[0] - 0.5, pos[1] - 0.5, pos[2] - 0.5];
            centered = rotateY(centered, angleY);
            centered = rotateX(centered, angleX);
            return project(centered);
        });

        // 绘制键
        ctx.strokeStyle = CONFIG.bondColor;
        ctx.lineWidth = CONFIG.bondWidth;
        bonds.forEach(bond => {
            ctx.beginPath();
            ctx.moveTo(transformedAtoms[bond[0]][0], transformedAtoms[bond[0]][1]);
            ctx.lineTo(transformedAtoms[bond[1]][0], transformedAtoms[bond[1]][1]);
            ctx.stroke();
        });

        // 按深度排序绘制原子
        const sortedAtoms = transformedAtoms
            .map((atom, index) => ({ atom, index }))
            .sort((a, b) => a.atom[2] - b.atom[2]);

        sortedAtoms.forEach(({ atom, index }) => {
            const depth = (atom[2] + 0.5);
            const radius = CONFIG.atomRadius * (0.7 + depth * 0.3);
            const alpha = 0.5 + depth * 0.5;
            const isCorner = index < 8;

            ctx.beginPath();
            ctx.arc(atom[0], atom[1], radius, 0, Math.PI * 2);
            ctx.fillStyle = isCorner ? CONFIG.atomColor : '#FFFFFF';
            ctx.globalAlpha = alpha;
            ctx.fill();
            ctx.globalAlpha = 1;

            // 高光
            ctx.beginPath();
            ctx.arc(atom[0] - radius * 0.3, atom[1] - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
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
        ctx.fillText('FCC (Interactive)', CONFIG.size / 2, CONFIG.size - 8);
        // 重置阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // 仅在非拖拽且无暂停时自动旋转
        if (!isDragging && !autoRotateTimeout) {
            angleY += CONFIG.rotationSpeed;
        }

        requestAnimationFrame(draw);
    }

    draw();
    console.log('FCC Unit Cell Animation initialized');
})();
