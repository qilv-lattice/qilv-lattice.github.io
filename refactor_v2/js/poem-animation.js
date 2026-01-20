/**
 * 工业装配式诗句入场动画
 * 基于 GSAP 的 3D 动画效果
 * 仅在桌面端加载
 */

(function () {
    'use strict';

    // 检查 GSAP 是否已加载
    if (typeof gsap === 'undefined') {
        console.log('Loading GSAP...');
        const gsapScript = document.createElement('script');
        gsapScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
        gsapScript.onload = initPoemAnimation;
        document.head.appendChild(gsapScript);
    } else {
        initPoemAnimation();
    }

    function initPoemAnimation() {
        // 等待 DOM 完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupAnimation);
        } else {
            // DOM 已加载，但需要等待诗句渲染
            // 使用 MutationObserver 监听诗句容器变化
            observePoemChanges();
        }
    }

    function observePoemChanges() {
        const poemContent = document.querySelector('.poem-content');
        if (!poemContent) {
            // 如果容器还不存在，稍后重试
            setTimeout(observePoemChanges, 100);
            return;
        }

        // 首次加载标志 - 用于跳过初始渲染的动画
        let isFirstLoad = true;

        // 监听诗句容器变化，每次切换诗词时重新播放动画
        const observer = new MutationObserver((mutations) => {
            // 检查是否有新的诗句行被添加
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    // 首次加载时跳过动画，保持静态显示
                    if (isFirstLoad) {
                        isFirstLoad = false;
                        console.log('First load - skipping animation, static display');
                        return;
                    }
                    // 延迟执行，确保 DOM 完全更新
                    setTimeout(playAssemblyAnimation, 50);
                    break;
                }
            }
        });

        observer.observe(poemContent, {
            childList: true,
            subtree: true
        });

        // 首次加载：完全静态显示，不播放任何动画
        // 印章在 CSS 中默认可见，无需 JS 干预
        // 只有用户点击上下首时才触发动画
        window._poemAnimationInitialized = true;
    }

    function playAssemblyAnimation() {
        // 移动端禁用印章动画和音效（看不到章印却听到声音很违和）
        const isMobile = window.innerWidth <= 768;

        // 获取所有诗句行（竖排模式下是每一列，横排模式下是每一行）
        const poemLines = document.querySelectorAll('.body-text p');
        const stamps = isMobile ? [] : document.querySelectorAll('.stamps-container .seal'); // 移动端不处理印章
        const mainSeal = document.querySelector('.poem-content::before'); // 主印章
        const container = document.querySelector('.poem-content');

        if (!poemLines.length || !container) return;

        // 检查用户设置：是否启用印章特效 (默认为 true)
        const isSealEffectEnabled = localStorage.getItem('sealEffectEnabled') !== 'false';

        // 如果特效关闭，确保大印章静态显示，退出动画逻辑
        if (!isSealEffectEnabled) {
            container.classList.remove('seal-preparing');
            container.classList.remove('seal-landing');

            // 确保存储中印章可见（通过移除可能的隐藏类或重置样式）
            // CSS中默认是大印章可见，小印章不可见
            // 我们需要让小印章也显示出来（如果设计需要）或者保持现状
            // 这里简单处理：让GSAP进场动画只播放文字部分，甚至连文字部分也可以简化
            // 但用户只要求关掉“盖章特效”，所以文字动画保留，只跳过印章部分
        }


        // 重置印章动画类
        container.classList.remove('seal-landing');

        // 只有开启特效时，才添加准备类（隐藏大印章）等待动画
        if (isSealEffectEnabled) {
            container.classList.add('seal-preparing');
        }

        // 为容器添加 3D 透视
        gsap.set(container, {
            perspective: 1000,
            transformStyle: 'preserve-3d'
        });

        // 创建主时间轴
        const tl = gsap.timeline({
            defaults: {
                ease: 'expo.out'
            }
        });

        // ===== 第一阶段：诗句工业装配入场 =====
        poemLines.forEach((line, index) => {
            // 初始状态：随机 3D 位置
            gsap.set(line, {
                opacity: 0,
                z: -800 - Math.random() * 400, // 随机深度
                rotationX: 70 + Math.random() * 40, // 随机倾斜
                rotationY: (Math.random() - 0.5) * 30, // 轻微左右倾斜
                scale: 0.8,
                transformOrigin: 'center center'
            });

            // 飞入动画
            tl.to(line, {
                opacity: 1,
                z: 0,
                rotationX: 0,
                rotationY: 0,
                scale: 1,
                duration: 0.6,
                ease: 'expo.out'
            }, index * 0.12) // stagger 时间
                // 机械咬合：微小缩放反弹
                .to(line, {
                    scale: 1.03,
                    duration: 0.08,
                    ease: 'power2.out'
                }, `>-0.1`)
                .to(line, {
                    scale: 1,
                    duration: 0.15,
                    ease: 'elastic.out(1, 0.5)'
                }, '>');
        });

        // ===== 第二阶段：小印章依次落位 + 音效（接力式） =====
        // 使用标签强制控制顺序：每个印章间隔 800ms
        tl.addLabel('stamps-start');

        if (isSealEffectEnabled) {
            stamps.forEach((stamp, index) => {
                gsap.set(stamp, {
                    opacity: 0,
                    scale: 2.5,
                    rotation: -15 + Math.random() * 30
                });

                // 计算每个印章的开始时间：第0个在标签处，第1个在+0.8s，第2个在+1.6s
                const stampStartTime = `stamps-start+=${index * 0.8}`;

                // 小印章下落动画（800ms）
                tl.to(stamp, {
                    opacity: 1,
                    scale: 1,
                    rotation: 0,
                    duration: 0.8,
                    ease: 'power2.out'
                }, stampStartTime);

                // 音效与下落同时开始
                tl.add(() => {
                    playSealSound(0.35 + index * 0.1, 1500);
                }, stampStartTime);
            });

            // 标记三个小印章全部结束的时间点
            tl.addLabel('stamps-done', `stamps-start+=${stamps.length * 0.8}`);
        } else {
            // 特效关闭：小印章直接显示（无动画，无声音）
            stamps.forEach(stamp => {
                gsap.set(stamp, { opacity: 1, scale: 1, rotation: 0 });
            });
            // 时间轴无缝衔接
            tl.addLabel('stamps-done', 'stamps-start');
        }

        // ===== 第三阶段：主印章重锤落下（仅桌面端） =====
        // 注意：::before 伪元素无法直接用 GSAP 操控
        // 我们通过为容器添加一个动画类来触发
        if (!isMobile && isSealEffectEnabled) {
            tl.add(() => {
                // 移除准备类，添加动画类
                container.classList.remove('seal-preparing');
                container.classList.add('seal-landing');

                // 播放主印章撞击音效（最高音量压轴，2000ms）
                playSealSound(0.95, 2000);

                // 容器抖动效果
                gsap.to(container, {
                    x: 4,
                    yoyo: true,
                    repeat: 6,
                    duration: 0.04,
                    ease: 'power2.inOut',
                    onComplete: () => {
                        gsap.set(container, { x: 0 });
                    }
                });
            }, 'stamps-done+=0.1'); // 三小印章全部结束后 100ms 开始大印章
        }

        console.log('🏭 Industrial assembly animation played');
    }

    /**
     * 播放盖章撞击音效
     * @param {number} volume - 音量 (0-1)，默认 0.7
     * @param {number} duration - 播放时长(ms)，默认 1500
     */
    function playSealSound(volume = 0.7, duration = 1500) {
        try {
            const audio = new Audio('assets/hit-impact-impact-collision-6.mp3');
            audio.volume = Math.min(1, Math.max(0, volume)); // 限制在 0-1 范围
            audio.currentTime = 0;

            // 播放音频
            const playPromise = audio.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    // 指定时间后停止播放
                    setTimeout(() => {
                        audio.pause();
                        audio.currentTime = 0;
                    }, duration);
                }).catch(error => {
                    // 自动播放被浏览器阻止（用户未交互前）
                    // 静默处理，避免刷屏
                });
            }
        } catch (e) {
            console.log('Sound playback error:', e);
        }
    }

    // 暴露到全局，以便手动触发
    window.playPoemAnimation = playAssemblyAnimation;
})();
