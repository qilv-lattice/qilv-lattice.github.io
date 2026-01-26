/**
 * 雪花特效脚本
 * 使用 Emoji ❄️ 作为雪花粒子
 */

if (window && window.disableSnow) {
    // 关闭雪花特效（全局开关）
} else {
class Snowflake {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 0;
        this.alpha = 0;
        this.element = document.createElement('div');
        this.element.className = 'snowflake';
        this.element.innerHTML = '❄️';

        // 随机属性初始化
        this.reset();

        // 初始位置随机分布在屏幕顶部上方
        this.y = Math.random() * -window.innerHeight;

        document.body.appendChild(this.element);
    }

    reset() {
        this.x = Math.random() * window.innerWidth;
        this.y = Math.random() * -100; // 重置到顶部上方
        this.vx = (Math.random() - 0.5) * 1; // 左右轻微飘动
        this.vy = 0.5 + Math.random() * 1.5; // 下落速度 0.5 - 2.0
        this.radius = 10 + Math.random() * 15; // 大小 10px - 25px
        this.alpha = 0.3 + Math.random() * 0.5; // 透明度 0.3 - 0.8
        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 2;

        this.updateStyle();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;

        // 简单的风力模拟（正弦波）
        this.vx += Math.sin(this.y * 0.01) * 0.01;

        // 边界检查
        if (this.y > window.innerHeight) {
            this.reset();
        }
        if (this.x > window.innerWidth) {
            this.x = 0;
        } else if (this.x < 0) {
            this.x = window.innerWidth;
        }

        this.updateStyle();
    }

    updateStyle() {
        this.element.style.transform = `translate(${this.x}px, ${this.y}px) rotate(${this.rotation}deg)`;
        this.element.style.opacity = this.alpha;
        this.element.style.fontSize = `${this.radius}px`;
    }
}

class SnowEffect {
    constructor(count = 50) {
        this.snowflakes = [];
        this.count = count;
        this.running = false;

        // 根据屏幕宽度调整数量
        if (window.innerWidth < 768) {
            this.count = 30; // 移动端减少数量
        }
    }

    init() {
        for (let i = 0; i < this.count; i++) {
            this.snowflakes.push(new Snowflake());
        }
        this.start();
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.loop();
    }

    stop() {
        this.running = false;
    }

    loop() {
        if (!this.running) return;

        for (const snowflake of this.snowflakes) {
            snowflake.update();
        }

        requestAnimationFrame(() => this.loop());
    }
}

// 自动启动
document.addEventListener('DOMContentLoaded', () => {
    const snow = new SnowEffect();
    snow.init();
});
}
