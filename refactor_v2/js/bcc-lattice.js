/**
 * BCC 晶格动画（旋转晶胞）
 * 体心立方 (Body-Centered Cubic) 晶体结构可视化
 * 位置：左侧中上部 (Top 30%)
 */

(function () {
    'use strict';

    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'bcc-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // 配置参数
    // 配置参数
    const CONFIG = {
        size: 160,          // 略小于 FCC (180)
        cellSize: 50,       // 晶胞大小
        atomRadius: 6,      // 原子半径
        rotationSpeed: 0.006, // 旋转速度略慢
        opacity: 0.75,
        atomColor: '#FFD700', // 默认金色 (深色模式)
        secondaryColor: '#FFFFFF', // 默认白色 (深色模式)
        bondColor: 'rgba(255, 255, 255, 0.35)',
        bondWidth: 1.2
    };

    // 监听背景主题变化 (反向变色龙)
    window.addEventListener('lattice-theme-change', (e) => {
        const isDark = e.detail.isDark;
        if (isDark) {
            // 深色背景
            CONFIG.atomColor = '#FFD700';
            CONFIG.secondaryColor = '#FFFFFF';
            CONFIG.bondColor = 'rgba(255, 255, 255, 0.35)';
        } else {
            // 浅色背景 (高对比度)
            CONFIG.atomColor = '#00008B'; // 深蓝
            CONFIG.secondaryColor = '#333333'; // 深灰
            CONFIG.bondColor = 'rgba(0, 0, 0, 0.4)';
        }
    });

    // 设置 Canvas 样式
    canvas.width = CONFIG.size;
    canvas.height = CONFIG.size;
    canvas.style.position = 'fixed';
    canvas.style.top = '28%';   // 位于位错下方
    canvas.style.left = '25px'; // 左侧对齐
    canvas.style.zIndex = '50';
    canvas.style.pointerEvents = 'auto'; // 允许交互
    canvas.style.cursor = 'grab';
    canvas.style.opacity = CONFIG.opacity;

    // BCC 晶胞原子坐标（归一化 0-1）
    // 8个顶点 + 1个体心
    const atomPositions = [
        // 8个角原子
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
        [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1],
        // 1个体心原子
        [0.5, 0.5, 0.5]
    ];

    // 键连接：体心原子连接8个顶点
    const bonds = [
        [8, 0], [8, 1], [8, 2], [8, 3],
        [8, 4], [8, 5], [8, 6], [8, 7],
        // 可选：添加立方体边框以增强立体感
        [0, 1], [0, 2], [0, 3],
        [1, 4], [1, 5],
        [2, 4], [2, 6],
        [3, 5], [3, 6],
        [4, 7], [5, 7], [6, 7]
    ];

    let angleY = 0;
    let angleX = 0.35; // 改为 let

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
        angleX += deltaY * 0.01;
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
        const sortedAtoms = transformedAtoms.map((pos, index) => ({ pos, index }))
            .sort((a, b) => a.pos[2] - b.pos[2]);

        sortedAtoms.forEach(item => {
            const [x, y, z] = item.pos;
            const index = item.index; // 确保获取原始索引

            // 简单的深度缩放效果
            const scale = 1 + z / (CONFIG.size * 2);
            const radius = CONFIG.atomRadius * scale;
            const alpha = 0.6 + z / (CONFIG.size) * 0.4; // 深度也影响透明度

            // 颜色逻辑：FCC风格 (顶点=ThemeColor，体心=SecondaryColor)
            // BCC: 0-7 是顶点，8 是体心
            const isCorner = index < 8;
            const color = isCorner ? CONFIG.atomColor : CONFIG.secondaryColor;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = Math.max(0.2, Math.min(1, alpha)); // 限制透明度范围
            ctx.fill();

            // 高光
            ctx.beginPath();
            ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fill();
        });

        ctx.globalAlpha = 1; // 重置全局透明度

        // 标题 (白色高亮 + 阴影增强可读性)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.font = '11px "Noto Serif SC", serif';
        ctx.textAlign = 'center';
        ctx.fillText('BCC (Interactive)', CONFIG.size / 2, CONFIG.size - 8);
        // 重置阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        if (!isDragging && !autoRotateTimeout) {
            angleY += CONFIG.rotationSpeed;
        }
        requestAnimationFrame(draw);
    }

    draw();
})();
