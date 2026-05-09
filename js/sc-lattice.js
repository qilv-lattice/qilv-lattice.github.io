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
        rotationSpeed: 0.021,
        opacity: 0.8,
        atomColor: '#FFD700', // 默认金色 (深色模式)
        bondColor: 'rgba(255, 255, 255, 0.25)',
        bondWidth: 1.5,
        glowColor: 'rgba(68, 136, 255, 0.4)'
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
        CONFIG.bondColor = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)';

        // 关键修复：星级锁定判断
        if (CURRENT_STAR_COLOR) {
            return;
        }

        if (isDark) {
            TARGET_CONFIG.atomColor = '#FFD700';
        } else {
            TARGET_CONFIG.atomColor = '#00008B';
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
        // [新增] 平滑过渡配置参数
        CONFIG.rotationSpeed += (TARGET_CONFIG.rotationSpeed - CONFIG.rotationSpeed) * 0.05;
        CONFIG.atomColor = lerpColor(CONFIG.atomColor, TARGET_CONFIG.atomColor, 0.05);
        CONFIG.glowColor = lerpColor(CONFIG.glowColor, TARGET_CONFIG.glowColor, 0.05);

        ctx.clearRect(0, 0, CONFIG.size, CONFIG.size);

        // 计算所有原子的投影位置
        const projectedAtoms = atomPositions.map(pos =>
            project(pos[0], pos[1], pos[2], angleY, angleX)
        );

        // 按 z 排序绘制键 (带热力颜色)
        const sortedBonds = [...bonds].sort((a, b) => {
            const zA = (projectedAtoms[a[0]].z + projectedAtoms[a[1]].z) / 2;
            const zB = (projectedAtoms[b[0]].z + projectedAtoms[b[1]].z) / 2;
            return zA - zB;
        });

        sortedBonds.forEach(bond => {
            const atom1 = projectedAtoms[bond[0]];
            const atom2 = projectedAtoms[bond[1]];
            const avgZ = (atom1.z + atom2.z) / (CONFIG.cellSize * 2) + 0.5;

            ctx.beginPath();
            ctx.moveTo(atom1.x, atom1.y);
            ctx.lineTo(atom2.x, atom2.y);
            
            // 热力颜色插值
            const heatRatio = Math.min(1, CONFIG.rotationSpeed * 70);
            const depthColor = lerpColor('#4488ff', '#ff4444', heatRatio * avgZ);
            
            ctx.strokeStyle = depthColor;
            ctx.lineWidth = CONFIG.bondWidth * Math.min(atom1.scale, atom2.scale);
            ctx.globalAlpha = 0.2 + avgZ * 0.4;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        });

        // 按 z 排序绘制原子
        const sortedAtoms = projectedAtoms
            .map((proj, i) => ({ proj, i }))
            .sort((a, b) => a.proj.z - b.proj.z);

        sortedAtoms.forEach(({ proj }) => {
            const radius = CONFIG.atomRadius * proj.scale;
            const depth = (proj.z / CONFIG.cellSize) + 0.5;

            // 电子云光晕
            ctx.shadowColor = CONFIG.atomColor;
            ctx.shadowBlur = 12 * depth;

            ctx.beginPath();
            ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = CONFIG.atomColor;
            ctx.globalAlpha = 0.4 + depth * 0.6;
            ctx.fill();

            // 重置阴影，绘制高光
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(proj.x - radius * 0.3, proj.y - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
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
        ctx.fillText('SC (Interactive)', CONFIG.size / 2, CONFIG.size - 8);
        // 重置阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        if (!isDragging && !autoRotateTimeout) {
            const now = Date.now();
            const inactiveTime = now - lastActivityTime;
            const isIdle = inactiveTime > 30000;

            if (isIdle) {
                fieldIntensity *= 0.95;
                angleX += (0 - angleX) * 0.02; // SC 初始 X 为 0
                angleY += CONFIG.rotationSpeed;
            } else {
                const currentSpeed = CONFIG.rotationSpeed * (1 + fieldIntensity * 3);
                angleY += currentSpeed;
                
                const rect = canvas.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                const targetTiltX = (mousePos.y - centerY) * 0.0005;
                
                angleX += (targetTiltX - angleX) * 0.05;
            }
        }
        requestAnimationFrame(draw);
    }

    draw();
    console.log('SC Unit Cell Animation initialized');
})();
