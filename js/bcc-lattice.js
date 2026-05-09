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
    const CONFIG = {
        size: 160,          // 略小于 FCC (180)
        cellSize: 50,       // 晶胞大小
        atomRadius: 6,      // 原子半径
        rotationSpeed: 0.021,
        opacity: 0.8,
        atomColor: '#FFD700', // 默认金色 (深色模式)
        secondaryColor: '#FFFFFF', // 默认白色 (深色模式)
        bondColor: 'rgba(255, 255, 255, 0.25)',
        bondWidth: 1.2,
        glowColor: 'rgba(147, 68, 255, 0.4)'
    };

    // [新增] 目标配置，用于平滑过渡
    let TARGET_CONFIG = JSON.parse(JSON.stringify(CONFIG));
    const BASE_ROTATION_SPEED = CONFIG.rotationSpeed;

    // 辅助函数：颜色插值
    function lerpColor(a, b, amount) {
        const parseColor = (s) => {
            if (s.startsWith('#')) {
                const h = parseInt(s.replace(/#/g, ''), 16);
                return [h >> 16, h >> 8 & 0xff, h & 0xff, 1];
            }
            const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] ? parseFloat(m[4]) : 1] : [0, 0, 0, 1];
        };
        const [r1, g1, b1, a1] = parseColor(a);
        const [r2, g2, b2, a2] = parseColor(b);
        const r = Math.round(r1 + (r2 - r1) * amount);
        const g = Math.round(g1 + (g2 - g1) * amount);
        const b_ = Math.round(b1 + (b2 - b1) * amount);
        const alpha = a1 + (a2 - a1) * amount;
        return `rgba(${r}, ${g}, ${b_}, ${alpha})`;
    }

    // [新增] 记录当前星级颜色
    let CURRENT_STAR_COLOR = null;

    // [更新] 监听诗词情感变化 (加速版 + 星级联动)
    window.addEventListener('poem-emotion-change', (e) => {
        const emotion = e.detail.emotion;
        const starColor = e.detail.starColor; // [新增]
        const isDark = !document.body.classList.contains('light-theme');
        
        // 1. 设置目标颜色并锁定
        if (starColor) {
            CURRENT_STAR_COLOR = starColor;
            TARGET_CONFIG.atomColor = starColor;
            const sc = parseColor(starColor);
            TARGET_CONFIG.glowColor = `rgba(${sc.r}, ${sc.g}, ${sc.b}, 0.55)`;
        }

        // 2. 根据情感设置转速
        switch(emotion) {
            case 'heroic':
                TARGET_CONFIG.rotationSpeed = BASE_ROTATION_SPEED * 3.0;
                break;
            case 'vitality':
                TARGET_CONFIG.rotationSpeed = BASE_ROTATION_SPEED * 1.6;
                break;
            case 'ethereal':
                TARGET_CONFIG.rotationSpeed = BASE_ROTATION_SPEED * 0.75;
                break;
            case 'nostalgic':
                TARGET_CONFIG.rotationSpeed = BASE_ROTATION_SPEED * 1.0;
                break;
            case 'romantic':
                TARGET_CONFIG.rotationSpeed = BASE_ROTATION_SPEED * 0.85;
                break;
            case 'reflective':
                TARGET_CONFIG.rotationSpeed = BASE_ROTATION_SPEED * 1.4;
                break;
            default:
                TARGET_CONFIG.rotationSpeed = BASE_ROTATION_SPEED;
        }
    });

    // 监听背景主题变化 (反向变色龙)
    window.addEventListener('lattice-theme-change', (e) => {
        const isDark = e.detail.isDark;
        // 先更新键的可见度
        CONFIG.bondColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)';

        // 核心修复：如果有星级锁定，则不准重置原子颜色
        if (CURRENT_STAR_COLOR) {
            return;
        }

        if (isDark) {
            TARGET_CONFIG.atomColor = '#FFD700';
            TARGET_CONFIG.secondaryColor = '#FFFFFF';
        } else {
            TARGET_CONFIG.atomColor = '#00008B';
            TARGET_CONFIG.secondaryColor = '#333333';
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

    // 量子场交互变量
    let mousePos = { x: 0, y: 0 };
    let fieldIntensity = 0;
    let lastActivityTime = Date.now();

    // 监听全局鼠标移动以计算场效应
    window.addEventListener('mousemove', (e) => {
        mousePos.x = e.clientX;
        mousePos.y = e.clientY;
        lastActivityTime = Date.now();
        
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        fieldIntensity = Math.max(0, 1 - distance / 400);
    });

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
        // [新增] 平滑过渡配置参数
        CONFIG.rotationSpeed += (TARGET_CONFIG.rotationSpeed - CONFIG.rotationSpeed) * 0.05;
        CONFIG.atomColor = lerpColor(CONFIG.atomColor, TARGET_CONFIG.atomColor, 0.05);
        CONFIG.glowColor = lerpColor(CONFIG.glowColor, TARGET_CONFIG.glowColor, 0.05);

        ctx.clearRect(0, 0, CONFIG.size, CONFIG.size);

        const transformedAtoms = atomPositions.map(pos => {
            let centered = [pos[0] - 0.5, pos[1] - 0.5, pos[2] - 0.5];
            centered = rotateY(centered, angleY);
            centered = rotateX(centered, angleX);
            return project(centered);
        });

        // 绘制键 (带物理深度和温控颜色)
        ctx.lineWidth = CONFIG.bondWidth;
        bonds.forEach(bond => {
            const z1 = transformedAtoms[bond[0]][2];
            const z2 = transformedAtoms[bond[1]][2];
            const avgZ = (z1 + z2) / 2 + 0.5; // 0-1 深度

            ctx.beginPath();
            ctx.moveTo(transformedAtoms[bond[0]][0], transformedAtoms[bond[0]][1]);
            ctx.lineTo(transformedAtoms[bond[1]][0], transformedAtoms[bond[1]][1]);

            // 根据旋转速度和深度调整颜色 (模拟热效应)
            const heatRatio = Math.min(1, CONFIG.rotationSpeed * 60);
            const depthColor = lerpColor('#4488ff', '#ff4444', heatRatio * avgZ);
            
            ctx.strokeStyle = depthColor;
            ctx.globalAlpha = 0.15 + avgZ * 0.35;
            ctx.stroke();
            ctx.globalAlpha = 1;
        });

        // 按深度排序绘制原子
        const sortedAtoms = transformedAtoms.map((pos, index) => ({ pos, index }))
            .sort((a, b) => a.pos[2] - b.pos[2]);

        sortedAtoms.forEach(item => {
            const [x, y, z] = item.pos;
            const index = item.index;
            const depth = (z / CONFIG.cellSize) + 0.5;
            const radius = CONFIG.atomRadius * (0.8 + depth * 0.4);
            const alpha = 0.5 + depth * 0.5;

            // BCC 逻辑：0-7 顶点，8 体心
            const isCorner = index < 8;
            const color = isCorner ? CONFIG.atomColor : CONFIG.secondaryColor;

            // 电子云光晕
            ctx.shadowColor = color;
            ctx.shadowBlur = 10 * depth;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = Math.max(0.3, Math.min(1, alpha));
            ctx.fill();

            // 重置阴影，绘制高光
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
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
            const now = Date.now();
            const inactiveTime = now - lastActivityTime;
            const isIdle = inactiveTime > 30000;

            if (isIdle) {
                fieldIntensity *= 0.95;
                angleX += (0.35 - angleX) * 0.02;
                angleY += CONFIG.rotationSpeed;
            } else {
                const currentSpeed = CONFIG.rotationSpeed * (1 + fieldIntensity * 3);
                angleY += currentSpeed;
                
                const rect = canvas.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                const targetTiltX = (mousePos.y - centerY) * 0.0005;
                
                angleX += (targetTiltX + 0.35 - angleX) * 0.05;
            }
        }
        requestAnimationFrame(draw);
    }

    draw();
})();
