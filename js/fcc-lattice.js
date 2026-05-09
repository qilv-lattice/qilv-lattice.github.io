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
    const CONFIG = {
        size: 180,
        cellSize: 55,
        atomRadius: 7,
        rotationSpeed: 0.024,
        opacity: 0.85,
        atomColor: '#FFD700', // 默认金色 (深色模式)
        bondColor: 'rgba(255, 255, 255, 0.35)',
        bondWidth: 1.2,
        glowColor: 'rgba(68, 255, 136, 0.4)' // 电子云光晕颜色
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

    // [新增] 记录当前星级颜色，防止被背景主题变更覆盖
    let CURRENT_STAR_COLOR = null;

    // [更新] 监听诗词情感变化 (加速版 + 星级联动)
    window.addEventListener('poem-emotion-change', (e) => {
        const emotion = e.detail.emotion;
        const starColor = e.detail.starColor; // [新增] 获取星级映射颜色
        const isDark = !document.body.classList.contains('light-theme');
        
        // 1. 设置目标颜色并记录状态
        if (starColor) {
            CURRENT_STAR_COLOR = starColor; // 锁定当前星级色
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

    // 监听背景主题变化
    window.addEventListener('lattice-theme-change', (e) => {
        const isDark = e.detail.isDark;
        // 无论如何先更新键的颜色 (保持可见度)
        CONFIG.bondColor = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';

        // 关键修复：如果当前有星级颜色锁定，则背景变更不准覆盖原子颜色
        if (CURRENT_STAR_COLOR) {
            return; // 保持现状
        }

        // 仅在无星级锁定状态下同步默认颜色
        if (isDark) {
            TARGET_CONFIG.atomColor = '#FFD700';
            TARGET_CONFIG.glowColor = 'rgba(68, 255, 136, 0.4)';
        } else {
            TARGET_CONFIG.atomColor = '#00008B';
            TARGET_CONFIG.glowColor = 'rgba(68, 200, 100, 0.2)';
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

    // 量子场交互变量
    let mousePos = { x: 0, y: 0 };
    let fieldIntensity = 0;
    let lastActivityTime = Date.now(); // 记录最后一次活动时间

    // 监听全局鼠标移动以计算场效应
    window.addEventListener('mousemove', (e) => {
        mousePos.x = e.clientX;
        mousePos.y = e.clientY;
        lastActivityTime = Date.now(); // 更新活动时间
        
        // 计算鼠标与 Canvas 中心的距离
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 场强：400像素内开始产生感应，越近越强
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

        // 暂停自动旋转
        if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
        autoRotateTimeout = null;
    }

    function drag(e) {
        if (!isDragging) return;
        lastActivityTime = Date.now(); // 拖拽也视为活动

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

        // 绘制键 (带深度感和热力颜色)
        ctx.lineWidth = CONFIG.bondWidth;
        bonds.forEach(bond => {
            const z1 = transformedAtoms[bond[0]][2];
            const z2 = transformedAtoms[bond[1]][2];
            const avgZ = (z1 + z2) / 2 + 0.5; // 0-1 归一化深度
            
            ctx.beginPath();
            ctx.moveTo(transformedAtoms[bond[0]][0], transformedAtoms[bond[0]][1]);
            ctx.lineTo(transformedAtoms[bond[1]][0], transformedAtoms[bond[1]][1]);
            
            // 物理感：越近的键越亮，颜色偏向热力红 (仅在自动旋转时动态模拟热量)
            const heatRatio = Math.min(1, CONFIG.rotationSpeed * 50); // 速度越快越红
            const depthColor = lerpColor('#4488ff', '#ff4444', heatRatio * avgZ);
            
            ctx.strokeStyle = depthColor;
            ctx.globalAlpha = 0.2 + avgZ * 0.4; // 深度影响透明度
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        });

        // 按深度排序绘制原子
        const sortedAtoms = transformedAtoms
            .map((atom, index) => ({ atom, index }))
            .sort((a, b) => a.atom[2] - b.atom[2]);

        sortedAtoms.forEach(({ atom, index }) => {
            const depth = (atom[2] + 0.5); // 0-1
            const radius = CONFIG.atomRadius * (0.8 + depth * 0.4); // 深度决定大小
            const alpha = 0.4 + depth * 0.6;
            const isCorner = index < 8;

            // 电子云光晕 (Glow Effect)
            ctx.shadowColor = isCorner ? CONFIG.atomColor : '#FFFFFF';
            ctx.shadowBlur = 12 * depth; 
            
            ctx.beginPath();
            ctx.arc(atom[0], atom[1], radius, 0, Math.PI * 2);
            ctx.fillStyle = isCorner ? CONFIG.atomColor : '#FFFFFF';
            ctx.globalAlpha = alpha;
            ctx.fill();
            ctx.globalAlpha = 1;

            // 重置阴影，绘制高光
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(atom[0] - radius * 0.3, atom[1] - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
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
            const now = Date.now();
            const inactiveTime = now - lastActivityTime;
            const isIdle = inactiveTime > 30000; // 30秒无操作

            if (isIdle) {
                // 处于空闲状态：能量衰减，姿态复位
                fieldIntensity *= 0.95; // 快速衰减场强
                angleX += (0.35 - angleX) * 0.02; // 平滑转回初始倾角
                angleY += CONFIG.rotationSpeed; // 恢复基础转速
            } else {
                // 处于活跃状态：执行量子场加速和倾斜
                const currentSpeed = CONFIG.rotationSpeed * (1 + fieldIntensity * 3);
                angleY += currentSpeed;
                
                const rect = canvas.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                const targetTiltX = (mousePos.y - centerY) * 0.0005;
                
                angleX += (targetTiltX + 0.35 - angleX) * 0.05;
                // 移除 angleY 的锁定逻辑，允许自由旋转
            }
        }

        requestAnimationFrame(draw);
    }

    draw();
    console.log('FCC Unit Cell Animation initialized');
})();
