/**
 * 烟花特效模块 (Fireworks Module) - v1.3 Color Upgrade
 * 
 * 核心特性：
 * 1. 物理引擎：重力 + 空气阻力。
 * 2. 形状系统：圆形 (Circle)、心形 (Heart)、土星环 (Ring)。
 * 3. 连发模式：持续 5 秒的烟花秀。
 * 4. 色彩系统：全彩霓虹 (HSL)、渐变拖尾、闪烁效果。
 */

(function () {
    // === 物理参数配置 ===
    const PHYSICS = {
        gravity: 0.08,       // 重力加速度 (向下)
        drag: 0.96,          // 空气阻力
        explosionForce: 5,   // 爆炸初始力度
        fadeSpeed: 0.012     // 粒子消失速度 (稍微调慢一点，让拖尾更长)
    };

    // === 内部状态 ===
    let canvas = null;
    let ctx = null;
    let width = 0;
    let height = 0;
    let particles = [];     // 活跃的爆炸粒子
    let rockets = [];       // 正在上升的烟花弹
    let rafId = null;       // 动画循环ID

    /**
     * 粒子类 (Particle)
     * 代表爆炸后的火花
     */
    class Particle {
        constructor(x, y, hue, type) {
            this.x = x;
            this.y = y;
            this.hue = hue;
            this.type = type; // 'heart', 'ring', 'circle', 'star'

            // 随机爆炸方向
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * PHYSICS.explosionForce + 2;

            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;

            this.alpha = 1.0;
            // 粒子尺寸增大 (原 2+1 -> 3+1.5)
            this.size = Math.random() * 3 + 1.5;
            this.decay = Math.random() * 0.015 + 0.01;

            // 闪烁效果 (随机)
            this.flicker = Math.random() > 0.5;
        }

        update() {
            // 1. 应用空气阻力
            this.vx *= PHYSICS.drag;
            this.vy *= PHYSICS.drag;

            // 2. 应用重力
            this.vy += PHYSICS.gravity;

            // 3. 更新位置
            this.x += this.vx;
            this.y += this.vy;

            // 4. 慢慢消失
            this.alpha -= this.decay;

            // 5. 颜色变换 (让颜色“活”起来，产生渐变)
            if (this.type !== 'ring') {
                this.hue += 0.5;
            }
        }

        draw(ctx) {
            ctx.save();

            let alpha = this.alpha;
            // 闪烁逻辑
            if (this.flicker && Math.random() > 0.7) {
                alpha = alpha * 0.3;
            }

            ctx.globalAlpha = Math.max(0, alpha);

            // 使用 HSL (饱和度拉满，亮度适中)
            ctx.fillStyle = `hsl(${this.hue}, 100%, 65%)`;

            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        isAlive() {
            return this.alpha > 0;
        }
    }

    /**
     * 烟花弹类 (Rocket)
     */
    class Rocket {
        constructor(startX, targetY) {
            this.x = startX;
            this.y = height;
            this.targetY = targetY;
            this.hue = Math.random() * 360;

            this.vy = -12 - Math.random() * 4;
            this.vx = (Math.random() - 0.5) * 2;
            this.trail = [];
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += PHYSICS.gravity * 0.5;
            if (Math.random() > 0.5) {
                this.trail.push({ x: this.x, y: this.y, alpha: 0.8 });
            }
        }

        draw(ctx) {
            ctx.fillStyle = `hsl(${this.hue}, 100%, 60%)`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
            ctx.fill();

            // 拖尾
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            for (let i = this.trail.length - 1; i >= 0; i--) {
                const t = this.trail[i];
                t.alpha -= 0.08;
                if (t.alpha > 0) {
                    ctx.globalAlpha = t.alpha;
                    ctx.fillRect(t.x, t.y, 2, 2);
                } else {
                    this.trail.splice(i, 1);
                }
            }
            ctx.globalAlpha = 1;
        }

        shouldExplode() {
            return this.y <= this.targetY || this.vy >= -1;
        }
    }

    // === 主逻辑 ===

    function initCanvas() {
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100vw';
            canvas.style.height = '100vh';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '9999';
            document.body.appendChild(canvas);
            ctx = canvas.getContext('2d');
            window.addEventListener('resize', resize);
            resize();
        }
    }

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        if (canvas) {
            canvas.width = width;
            canvas.height = height;
        }
    }

    // === 形状生成器 ===
    function getHeartPoint(t) {
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        return { x: x * 0.8, y: y * 0.8 };
    }

    // 爆炸生成粒子 (多模式 + 专属配色)
    function createExplosion(x, y, rocketHue, type = 'circle') {
        // 粒子数量翻倍 (原 120/100/80 -> 250/200/180)
        const particleCount = type === 'heart' ? 250 : (type === 'ring' ? 200 : 180);

        // 确定基础色
        let baseHue = rocketHue;
        if (type === 'heart') {
            baseHue = Math.random() * 60 + 320; // 320~380 (红/粉/紫)
        } else if (type === 'ring') {
            baseHue = 45; // 金色
        }

        for (let i = 0; i < particleCount; i++) {
            let p = new Particle(x, y, baseHue, type);

            if (type === 'heart') {
                const t = (Math.PI * 2 * i) / particleCount;
                const pos = getHeartPoint(t);
                const speed = 0.12 + Math.random() * 0.05;
                p.vx = pos.x * speed;
                p.vy = pos.y * speed;
                p.size = 2.8;
                p.decay = 0.01 + Math.random() * 0.01;
            } else if (type === 'ring') {
                const angle = (Math.PI * 2 * i) / particleCount;
                const rx = Math.cos(angle);
                const ry = Math.sin(angle) * 0.4;
                const speed = 4 + Math.random() * 1;
                p.vx = rx * speed;
                p.vy = ry * speed;
                p.size = 1.8;
                p.hue = 45 + Math.random() * 10;
            } else {
                // Circle: 随机偏移 Hue
                p.hue = baseHue + (Math.random() - 0.5) * 40;
            }
            particles.push(p);
        }

        // 土星环中心加个小白星
        if (type === 'ring') {
            for (let k = 0; k < 15; k++) {
                let s = new Particle(x, y, 60, 'circle');
                s.vx *= 0.2; s.vy *= 0.2; // 慢速中心
                // 白/黄色
                s.hue = 60;
                particles.push(s);
            }
        }
    }

    // 动画循环
    function loop() {
        if (!ctx) return;

        // 1. 拖尾
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'lighter';

        // 2. 更新火箭
        for (let i = rockets.length - 1; i >= 0; i--) {
            let r = rockets[i];
            r.update();
            r.draw(ctx);
            if (r.shouldExplode()) {
                const shapes = ['circle', 'circle', 'heart', 'ring'];
                const shape = shapes[Math.floor(Math.random() * shapes.length)];
                createExplosion(r.x, r.y, r.hue, shape);
                rockets.splice(i, 1);
            }
        }

        // 3. 更新粒子
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.update();
            p.draw(ctx);
            if (!p.isAlive()) {
                particles.splice(i, 1);
            }
        }

        // 4. 循环控制
        if (rockets.length > 0 || particles.length > 0) {
            rafId = requestAnimationFrame(loop);
        } else {
            ctx.clearRect(0, 0, width, height);
            rafId = null;
        }
    }

    // === 全局暴露接口 ===

    // 内部发射函数
    function launchRocket() {
        let launchX = width / 2;
        if (window.visualViewport) {
            launchX = window.visualViewport.width / 2 + window.visualViewport.offsetLeft;
        }
        // 随机偏移
        launchX += (Math.random() - 0.5) * 500;

        // 目标高度
        let targetY = height * (0.15 + Math.random() * 0.2);

        rockets.push(new Rocket(launchX, targetY));
    }

    // === 音效管理 ===
    const fwSound = new Audio('assets/festive-fireworks-with-the-whistle-of-rockets.mp3');
    fwSound.loop = true;

    // 移动端音频解锁：用户第一次点击任何地方时，静音播放一下，解锁 AudioContext
    let audioUnlocked = false;
    function unlockAudio() {
        if (audioUnlocked) return;
        fwSound.play().then(() => {
            fwSound.pause();
            fwSound.currentTime = 0;
            audioUnlocked = true;
        }).catch(() => { });
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
    }
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    // 移除 7s 强制循环，允许播放到 7840ms
    // kwSound.addEventListener('timeupdate', ...);

    window.triggerFireworks = function () {
        initCanvas();

        // 用户要求：去除物理延迟，直接播放，测试声音是否正常
        // 直接播放是浏览器兼容性最好的方式
        try {
            fwSound.volume = 0.6;
            fwSound.currentTime = 0;
            const playPromise = fwSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error("Audio play failed:", error);
                });
            }
        } catch (e) {
            console.error(e);
        }

        // 修复：【立即】发射第一枚，防止loop因队列为空而直接停止
        launchRocket();

        // 后续2枚延迟发射，形成连发感
        for (let i = 1; i < 3; i++) {
            setTimeout(() => launchRocket(), i * 200);
        }

        if (!rafId) {
            loop();
        }

        // 视觉时长：24秒 (用户修正：实际时长应为24s)
        const duration = 24000;
        const interval = 400;
        const endTime = Date.now() + duration;

        // 音频截止时间：25810ms (25.81s，用户指定最佳截断点)
        const audioCutoff = 25810;
        setTimeout(() => {
            fwSound.pause();
            fwSound.currentTime = 0;
        }, audioCutoff);

        const timer = setInterval(() => {
            if (Date.now() > endTime) {
                clearInterval(timer);
                // 视觉结束，音频继续直到 7840ms
            } else {
                // 每次随机发射 1-2 枚
                const count = Math.random() > 0.5 ? 2 : 1;
                for (let k = 0; k < count; k++) {
                    launchRocket();
                }
            }
        }, interval);
    };

    console.log("Fireworks Module v1.3 (Color Upgrade) Loaded");
})();
