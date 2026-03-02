/**
 * HCP 晶格动画（旋转晶胞）
 * 密排六方 (Hexagonal Close-Packed) 晶体结构可视化
 * 位置：左侧中下部 (Top 55%)
 */

(function () {
    'use strict';

    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'hcp-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // 配置参数
    // 配置参数
    const CONFIG = {
        size: 170,          // 适中尺寸
        cellSize: 35,       // 六边形边长
        heightScale: 1.633, // c/a 轴比，理想比值 1.633
        atomRadius: 6,
        rotationSpeed: 0.007,
        opacity: 0.8,
        atomColor: '#FFD700', // 默认金色 (深色模式)
        secondaryColor: '#FFFFFF', // 默认白色 (深色模式)
        bondColor: 'rgba(255, 255, 255, 0.2)',
        bondWidth: 1.2,
        glowColor: 'rgba(68, 136, 255, 0.4)'
    };

    // 辅助函数：颜色插值
    function lerpColor(a, b, amount) {
        const ah = parseInt(a.replace(/#/g, ''), 16),
            ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
            bh = parseInt(b.replace(/#/g, ''), 16),
            br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
            rr = ar + amount * (br - ar),
            rg = ag + amount * (bg - ag),
            rb = ab + amount * (bb - ab);
        return `rgb(${Math.round(rr)}, ${Math.round(rg)}, ${Math.round(rb)})`;
    }

    // 监听背景主题变化 (反向变色龙)
    window.addEventListener('lattice-theme-change', (e) => {
        const isDark = e.detail.isDark;
        if (isDark) {
            CONFIG.atomColor = '#FFD700';
            CONFIG.secondaryColor = '#FFFFFF';
            CONFIG.bondColor = 'rgba(255, 255, 255, 0.2)';
        } else {
            CONFIG.atomColor = '#00008B';
            CONFIG.secondaryColor = '#333333';
            CONFIG.bondColor = 'rgba(0, 0, 0, 0.15)';
        }
    });

    // 设置 Canvas 样式
    canvas.width = CONFIG.size;
    canvas.height = CONFIG.size;
    canvas.style.position = 'fixed';
    // 设置 Canvas 样式
    canvas.width = CONFIG.size;
    canvas.height = CONFIG.size;
    canvas.style.position = 'fixed';
    canvas.style.top = '55%';   // 位于 BCC 下方，FCC 上方
    canvas.style.left = '25px'; // 左侧对齐
    canvas.style.zIndex = '50';
    canvas.style.pointerEvents = 'auto'; // 允许交互
    canvas.style.cursor = 'grab';
    canvas.style.opacity = CONFIG.opacity;

    // HCP 晶胞生成逻辑
    // 调整：Y轴为高度轴 (c-axis)，六边形在 XZ 平面
    // 这样六边形就在“上下”位置，晶胞直立
    const atomPositions = [];

    // 辅助函数：生成 XZ 平面上的六边形顶点
    // y 为高度层
    function hexVertex(angleDeg, y) {
        const rad = angleDeg * Math.PI / 180;
        // x = cos, z = sin
        return [Math.cos(rad), y, Math.sin(rad)];
    }

    // 高度定义 (中心化，上下对称)
    const hHalf = (CONFIG.heightScale * 1.0) / 2;

    // 1. 底面 (y = hHalf) - 7个原子 (注意 Canvas Y 向下，所以底面可能是正值)
    // 我们让 Y轴向上为负? 或者不管，反正 rotateX 会处理翻转
    // 定义 y = hHalf 为“底”， y = -hHalf 为“顶”
    const yBottom = hHalf;
    const yTop = -hHalf;

    // 底面原子
    atomPositions.push([0, yBottom, 0]); // 中心
    for (let i = 0; i < 6; i++) {
        atomPositions.push(hexVertex(i * 60, yBottom));
    }

    // 顶面原子
    atomPositions.push([0, yTop, 0]); // 中心
    for (let i = 0; i < 6; i++) {
        atomPositions.push(hexVertex(i * 60, yTop));
    }

    // 3. 中间层 (y = 0)
    // 投影位置在 XZ 平面的三角形重心
    const midR = 0.577;
    atomPositions.push([midR * Math.cos(30 * Math.PI / 180), 0, midR * Math.sin(30 * Math.PI / 180)]);
    atomPositions.push([midR * Math.cos(150 * Math.PI / 180), 0, midR * Math.sin(150 * Math.PI / 180)]);
    atomPositions.push([midR * Math.cos(270 * Math.PI / 180), 0, midR * Math.sin(270 * Math.PI / 180)]);


    // 键连接 (索引顺序未变，逻辑通用)
    const bonds = [];

    // 底面连接 (0-6)
    for (let i = 1; i <= 6; i++) {
        bonds.push([0, i]);
        bonds.push([i, i === 6 ? 1 : i + 1]);
    }

    // 顶面连接 (7-13)
    for (let i = 8; i <= 13; i++) {
        bonds.push([7, i]);
        bonds.push([i, i === 13 ? 8 : i + 1]);
    }

    // 垂直棱 (1-6 连 8-13)
    // 索引对应关系：1->8 (0度), 2->9 (60度)...
    for (let i = 1; i <= 6; i++) {
        bonds.push([i, i + 7]);
    }

    let angleY = 0;
    let angleX = 0.25; // 改为 let

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

    // 绕 Y 轴旋转 (现在 Y 是中心轴，所以就是自转)
    function rotateY(point, angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        // 绕 Y 轴：旋转 X 和 Z
        return [point[0] * cos - point[2] * sin, point[1], point[0] * sin + point[2] * cos];
    }

    // 绕 X 轴旋转 (倾斜视图)
    function rotateX(point, angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        // 绕 X 轴：旋转 Y 和 Z
        return [point[0], point[1] * cos - point[2] * sin, point[1] * sin + point[2] * cos];
    }

    function project(point) {
        return [
            point[0] * CONFIG.cellSize + CONFIG.size / 2,
            point[1] * CONFIG.cellSize + CONFIG.size / 2,
            point[2] * CONFIG.cellSize
        ];
    }

    function draw() {
        ctx.clearRect(0, 0, CONFIG.size, CONFIG.size);

        const transformedAtoms = atomPositions.map(pos => {
            // 已在生成时中心化，直接旋转
            let p = [...pos];
            p = rotateY(p, angleY);
            p = rotateX(p, angleX);
            return project(p);
        });

        // 绘制键 (带物理深度和温控颜色)
        ctx.lineWidth = CONFIG.bondWidth;
        bonds.forEach(bond => {
            const z1 = transformedAtoms[bond[0]][2];
            const z2 = transformedAtoms[bond[1]][2];
            const avgZ = (z1 + z2) / (CONFIG.cellSize * 4) + 0.5;

            ctx.beginPath();
            ctx.moveTo(transformedAtoms[bond[0]][0], transformedAtoms[bond[0]][1]);
            ctx.lineTo(transformedAtoms[bond[1]][0], transformedAtoms[bond[1]][1]);

            // 根据旋转模拟热力颜色
            const heatRatio = Math.min(1, CONFIG.rotationSpeed * 65);
            const depthColor = lerpColor('#4488ff', '#ff4444', heatRatio * avgZ);
            
            ctx.strokeStyle = depthColor;
            ctx.globalAlpha = 0.15 + avgZ * 0.35;
            ctx.stroke();
            ctx.globalAlpha = 1;
        });

        // 按深度排序绘制原子 (Z轴作为深度)
        const sortedAtoms = transformedAtoms.map((pos, index) => ({ pos, index }))
            .sort((a, b) => a.pos[2] - b.pos[2]);

        sortedAtoms.forEach(item => {
            const [x, y, z] = item.pos;
            const index = item.index;
            const depth = (z / (CONFIG.cellSize * 2)) + 0.5;
            const radius = CONFIG.atomRadius * (0.8 + depth * 0.4);
            const alpha = 0.4 + depth * 0.6;

            // HCP 逻辑：顶点=金色，中心/内层=白色
            const isFrameVertex = (index >= 1 && index <= 6) || (index >= 8 && index <= 13);
            const color = isFrameVertex ? CONFIG.atomColor : CONFIG.secondaryColor;

            // 电子云光晕
            ctx.shadowColor = color;
            ctx.shadowBlur = 12 * depth;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = Math.max(0.3, Math.min(1, alpha));
            ctx.fill();

            // 重置阴影，绘制高光
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
        });

        ctx.globalAlpha = 1;

        // 标题 (白色高亮 + 阴影增强可读性)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.font = '11px "Noto Serif SC", serif';
        ctx.textAlign = 'center';
        ctx.fillText('HCP (Interactive)', CONFIG.size / 2, CONFIG.size - 8);
        // 重置阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        if (!isDragging && !autoRotateTimeout) {
            const now = Date.now();
            const inactiveTime = now - lastActivityTime;
            const isIdle = inactiveTime > 30000;

            if (isIdle) {
                fieldIntensity *= 0.95;
                angleX += (0.25 - angleX) * 0.02; // HCP 初始 X 为 0.25
                angleY += CONFIG.rotationSpeed;
            } else {
                const currentSpeed = CONFIG.rotationSpeed * (1 + fieldIntensity * 3);
                angleY += currentSpeed;
                
                const rect = canvas.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                const targetTiltX = (mousePos.y - centerY) * 0.0005;
                
                angleX += (targetTiltX + 0.25 - angleX) * 0.05;
            }
        }
        requestAnimationFrame(draw);
    }

    draw();
})();
