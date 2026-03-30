const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

let particlesArray;

// 设置画布大小
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// 处理窗口大小调整
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init();
});

// 鼠标交互对象
const mouse = {
    x: null,
    y: null,
    radius: 180 // 鼠标影响半径 (稍微调大增强排斥感)
}

window.addEventListener('mousemove', (event) => {
    mouse.x = event.x;
    mouse.y = event.y;
});

// 触摸设备支持
window.addEventListener('touchmove', (event) => {
    if (event.touches.length > 0) {
        mouse.x = event.touches[0].clientX;
        mouse.y = event.touches[0].clientY;
    }
});
window.addEventListener('touchend', () => {
    mouse.x = null;
    mouse.y = null;
});

window.addEventListener('mouseout', () => {
    mouse.x = null;
    mouse.y = null;
});

// 粒子类 (现在作为晶格节点)
class Particle {
    constructor(x, y, size, color) {
        // 初始位置，也是节点受引力回归锁定的目标位置（平衡态）
        this.baseX = x;
        this.baseY = y;

        // 当前位置
        this.x = x;
        this.y = y;

        // 速度
        this.vx = 0;
        this.vy = 0;

        this.size = size;
        this.baseSize = size;
        this.color = color;
        this.angle = Math.random() * Math.PI * 2;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }

    update() {
        // 呼吸效果：让晶格点显得有一点生命力
        this.angle += 0.03;
        this.size = this.baseSize + Math.sin(this.angle) * 0.5;

        // --- 物理计算模型 ---

        // 1. 计算鼠标排斥力 (反比于距离的力)
        let dxMouse = mouse.x - this.x;
        let dyMouse = mouse.y - this.y;
        let distanceMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);

        if (mouse.x != null && distanceMouse < mouse.radius) {
            // 计算排斥力系数 (距离越近，力越大)
            let forceDirectionX = dxMouse / distanceMouse;
            let forceDirectionY = dyMouse / distanceMouse;
            let force = (mouse.radius - distanceMouse) / mouse.radius;
            // 节点加速度
            let maxSpeed = 10;
            let ax = forceDirectionX * force * maxSpeed;
            let ay = forceDirectionY * force * maxSpeed;

            // 施加相反方向的加速度 (排斥)
            this.vx -= ax;
            this.vy -= ay;
        }

        // 2. 弹簧恢复力 (Hooke's Law: F = -k * x)
        // 计算节点偏离初始位置的距离
        let dxBase = this.baseX - this.x;
        let dyBase = this.baseY - this.y;

        // 弹簧弹性系数 (控制拉回的紧实度，0.1 左右比较适合弹性)
        let springFactor = 0.08;

        // 3. 阻尼/摩擦力 (让节点最终能平稳停下来，不会永远振荡下去)
        let friction = 0.85;

        // 综合速度： 弹簧拉回的加速度 + 历史速度的阻尼衰减
        this.vx = (this.vx + dxBase * springFactor) * friction;
        this.vy = (this.vy + dyBase * springFactor) * friction;

        // 应用速度更新位置
        this.x += this.vx;
        this.y += this.vy;

        this.draw();
    }
}

// 初始化晶格点阵
function init() {
    particlesArray = [];

    // 晶格间距参数
    const spacing = Math.min(window.innerWidth, window.innerHeight) / 10;

    // 计算可以容纳几行几列 (多铺一点到屏幕外以防缩放边缘问题)
    const cols = Math.floor(canvas.width / spacing) + 2;
    const rows = Math.floor(canvas.height / spacing) + 2;

    const offsetX = (canvas.width - cols * spacing) / 2;
    const offsetY = (canvas.height - rows * spacing) / 2;

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            // 生成规则坐标
            let x = i * spacing + offsetX;
            let y = j * spacing + offsetY;

            // 可以给晶格加一点点固定的错位 (Hexagonal 样式)
            if (j % 2 === 1) {
                x += spacing / 2;
            }

            let size = 1.5; // 晶格点大小
            let color = 'rgba(255, 255, 255, 0.7)';

            particlesArray.push(new Particle(x, y, size, color));
        }
    }
}

// 连线逻辑 (画出晶格的 Bond)
function connect() {
    for (let a = 0; a < particlesArray.length; a++) {
        // 只遍历之后的节点，避免重复画线
        for (let b = a + 1; b < particlesArray.length; b++) {
            let dx = particlesArray[a].x - particlesArray[b].x;
            let dy = particlesArray[a].y - particlesArray[b].y;
            let distance = dx * dx + dy * dy;

            // 设定连线的最大阈值距离 (应该略大于晶格间距, 以便斜向或者相连的节点能连上)
            let maxDistance = (Math.min(window.innerWidth, window.innerHeight) / 10) * 1.5;
            maxDistance = maxDistance * maxDistance;

            if (distance < maxDistance) {
                // 距离越近，网格线越清晰; 在受扰动拉伸时线条会变淡
                let opacityValue = 1 - (distance / maxDistance);

                ctx.strokeStyle = `rgba(255, 255, 255, ${opacityValue * 0.4})`; // 稍微增亮线条
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                ctx.stroke();
            }
        }
    }
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
    }
    connect();
}

// 启动
init();
animate();

// [新增] 狂欢喷泉粒子类
class FountainParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = -Math.random() * 15 - 5;
        this.gravity = 0.4;
        this.radius = Math.random() * 4 + 2;
        const colors = ['#ff3b3b', '#ffa200', '#ffe100', '#4cd964', '#3b82f6', '#8b5cf6', '#E8E8E8', '#d48888'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.opacity = 1;
        this.life = 1;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
    update() {
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.opacity -= 0.01;
        this.life -= 0.01;
        this.draw();
    }
}

let fountainParticles = [];
function triggerFountain(x, y) {
    for (let i = 0; i < 60; i++) {
        fountainParticles.push(new FountainParticle(x, y));
    }
}

// 劫持原有 animate 函数，加入喷泉粒子更新逻辑
const originalAnimate = animate;
animate = function() {
    requestAnimationFrame(animate);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
    }
    for (let i = 0; i < fountainParticles.length; i++) {
        fountainParticles[i].update();
        if (fountainParticles[i].life <= 0) {
            fountainParticles.splice(i, 1);
            i--;
        }
    }
    connect();
};