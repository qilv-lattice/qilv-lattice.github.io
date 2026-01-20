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
    radius: 150 // 鼠标影响半径
}

window.addEventListener('mousemove', (event) => {
    mouse.x = event.x;
    mouse.y = event.y;
});

// 粒子类
class Particle {
    constructor(x, y, directionX, directionY, size, color) {
        this.x = x;
        this.y = y;
        this.directionX = directionX;
        this.directionY = directionY;
        this.baseSize = size; // 记录基础大小
        this.size = size;
        this.color = color;
        this.angle = Math.random() * 6.2; // 随机初始相位
    }

    // 绘制单个粒子
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; // 稍微透明一点，更有层次感
        ctx.fill();
    }

    // 更新粒子位置
    update() {
        // 呼吸效果：根据正弦函数动态调整粒子大小
        this.angle += 0.02;
        this.size = this.baseSize + Math.sin(this.angle) * 0.8;

        // 边界检查（反弹）
        if (this.x > canvas.width || this.x < 0) {
            this.directionX = -this.directionX;
        }
        if (this.y > canvas.height || this.y < 0) {
            this.directionY = -this.directionY;
        }

        // 鼠标排斥/吸引逻辑
        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx*dx + dy*dy);

        if (distance < mouse.radius + this.size) {
            if (mouse.x < this.x && this.x < canvas.width - this.size * 10) {
                this.x += 2; // 稍微躲避鼠标
            }
            if (mouse.x > this.x && this.x > this.size * 10) {
                this.x -= 2;
            }
            if (mouse.y < this.y && this.y < canvas.height - this.size * 10) {
                this.y += 2;
            }
            if (mouse.y > this.y && this.y > this.size * 10) {
                this.y -= 2;
            }
        }

        // 正常移动
        this.x += this.directionX;
        this.y += this.directionY;

        this.draw();
    }
}

// 初始化粒子群
function init() {
    particlesArray = [];
    // 粒子数量：根据屏幕面积动态计算，避免太密或太疏
    let numberOfParticles = (canvas.height * canvas.width) / 15000; 
    
    for (let i = 0; i < numberOfParticles; i++) {
        let size = (Math.random() * 2) + 1; // 粒子大小 1-3px
        let x = (Math.random() * ((innerWidth - size * 2) - (size * 2)) + size * 2);
        let y = (Math.random() * ((innerHeight - size * 2) - (size * 2)) + size * 2);
        let directionX = (Math.random() * 0.4) - 0.2; // 速度极慢
        let directionY = (Math.random() * 0.4) - 0.2;
        let color = '#ffffff';

        particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
    }
}

// 连线逻辑
function connect() {
    let opacityValue = 1;
    for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a; b < particlesArray.length; b++) {
            let distance = ((particlesArray[a].x - particlesArray[b].x) * (particlesArray[a].x - particlesArray[b].x))
            + ((particlesArray[a].y - particlesArray[b].y) * (particlesArray[a].y - particlesArray[b].y));
            
            // 如果距离小于阈值（比如 120px），就连线
            if (distance < (canvas.width/7) * (canvas.height/7)) {
                opacityValue = 1 - (distance/25000); // 稍微调大分母，让线更亮一点点
                ctx.strokeStyle = 'rgba(255, 255, 255,' + opacityValue * 0.35 + ')'; // 透明度从 0.2 升到 0.35
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

// 鼠标移出窗口时清除坐标
window.addEventListener('mouseout', () => {
    mouse.x = undefined;
    mouse.y = undefined;
});