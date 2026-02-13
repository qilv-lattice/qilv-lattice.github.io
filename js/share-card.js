/* ===== 雅帖生成逻辑 ===== */
console.log('%c[ShareCard] js/share-card.js 已加载', 'color: green; font-weight: bold;');

// 接收 poems 和 currentIndex 作为参数，避免作用域问题
window.generateShareCard = function (poems, currentIndex) {
    console.log('%c[ShareCard] generateShareCard 被调用', 'color: blue;', { poemsLength: poems ? poems.length : 0, currentIndex });

    if (typeof html2canvas === 'undefined') {
        console.error('[ShareCard] html2canvas 未定义！CDN 加载失败？');
        alert('抱歉，绘图组件(html2canvas)加载失败。\n请检查网络连接或刷新页面重试。');
        return;
    }

    if (typeof currentIndex === 'undefined' || !poems) {
        console.error("[ShareCard] 诗词数据未传入");
        alert('系统数据尚未就绪，请稍候再试。');
        return;
    }

    if (currentIndex < 0 || currentIndex >= poems.length) {
        console.error("[ShareCard] 索引越界", currentIndex);
        return;
    }

    const currentPoem = poems[currentIndex];

    // 检查加锁逻辑
    let isUnlocked = false;
    if (!currentPoem.locked) {
        isUnlocked = true;
    } else {
        if (typeof window.isPoemUnlocked === 'function') {
            isUnlocked = window.isPoemUnlocked(currentPoem.title);
        } else if (window.unlockedPoems && window.unlockedPoems.includes(currentPoem.title)) {
            isUnlocked = true;
        }
    }

    if (currentPoem.locked && !isUnlocked) {
        alert('抱歉，该作品隐藏深意，解锁后方可生成雅帖。');
        return;
    }

    const overlay = document.getElementById('share-card-overlay');
    const previewContainer = document.getElementById('share-card-preview-container');
    if (!overlay || !previewContainer) return;

    overlay.classList.add('active');
    previewContainer.innerHTML = '<div class="share-loading">正在绘制雅帖，请稍候...</div>';

    const originalCard = document.querySelector('.poem-content.main-card');
    if (!originalCard) {
        previewContainer.innerHTML = '无法找到诗词卡片';
        return;
    }

    // 创建隐藏容器
    const cloneContainer = document.createElement('div');
    cloneContainer.id = 'share-card-clone-container';
    cloneContainer.style.position = 'fixed';
    cloneContainer.style.top = '0';
    cloneContainer.style.left = '0';
    cloneContainer.style.width = '480px';
    cloneContainer.style.zIndex = '-9999';
    cloneContainer.style.visibility = 'visible';
    document.body.appendChild(cloneContainer);

    const clone = originalCard.cloneNode(true);

    // 清理
    const cursors = clone.querySelectorAll('.cursor-flashing');
    cursors.forEach(el => el.remove());
    const audioControls = clone.querySelectorAll('.audio-controls');
    audioControls.forEach(el => el.remove());

    // 基础样式
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.boxShadow = 'none';
    clone.style.transition = 'none';
    clone.style.border = 'none';
    clone.style.height = 'auto';
    clone.style.minHeight = '800px'; // 稍微增加高度以适应长屏
    clone.style.color = getComputedStyle(originalCard).color;
    // 强制背景样式（以防 computed style 丢失）
    clone.style.backgroundSize = 'cover';
    clone.style.backgroundPosition = 'center';

    if (clone.classList.contains('horizontal-mode')) {
        // 横排模式布局
        clone.style.padding = '4rem 2rem 3rem 2rem';
        clone.style.display = 'flex';
        clone.style.flexDirection = 'column';
        clone.style.alignItems = 'center';
        clone.style.justifyContent = 'center';
    } else {
        // 竖排模式布局优化
        clone.style.writingMode = 'vertical-rl';
        clone.style.padding = '2rem'; // 减少内边距，让 centering 发挥作用

        // 使用 Flexbox 居中
        clone.style.display = 'flex';
        // 在 vertical-rl 中，row 是垂直堆叠（坏），column 是水平堆叠（好）
        // 这里的 'column' 方向实际上是 Right-to-Left (Block Axis)
        clone.style.flexDirection = 'column';

        // 垂直居中 (Cross Axis) - 若喜欢顶部对齐可改为 flex-start
        clone.style.alignItems = 'center';

        // 水平居中 (Main Axis)
        clone.style.justifyContent = 'center';

        // 确保高度填满容器以便垂直居中生效
        // 但 cloneContainer 是 auto height，所以 minHeight 800px 起作用
    }

    // 落款
    const footerMark = document.createElement('div');
    footerMark.style.fontSize = '0.9rem'; // 稍微放大
    footerMark.style.opacity = '0.7';
    footerMark.style.fontFamily = '"Ma Shan Zheng", cursive';
    footerMark.style.textAlign = 'center';

    if (clone.classList.contains('horizontal-mode')) {
        footerMark.style.marginTop = '2rem';
        footerMark.style.width = '100%';
    } else {
        // 竖排落款样式
        footerMark.style.writingMode = 'vertical-rl';
        // 在 flex column (Right-to-Left) 中，这是最左边一列
        // 垂直对齐到底部 (Cross Axis End)
        footerMark.style.alignSelf = 'flex-end';
        footerMark.style.marginTop = '0'; // Top is Right
        footerMark.style.marginLeft = '1rem'; // Left spacing
        footerMark.style.marginBottom = '2rem'; // Bottom spacing
        footerMark.style.marginRight = '0.5rem';
    }
    footerMark.innerHTML = '七律空间 · 雅藏';
    clone.appendChild(footerMark);

    cloneContainer.appendChild(clone);

    setTimeout(() => {
        html2canvas(clone, {
            scale: 2.5,
            useCORS: true,
            backgroundColor: null,
            logging: false,
            width: 480,
            windowWidth: 480,
            x: 0,
            y: 0
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');

            const img = new Image();
            img.src = imgData;
            img.style.maxWidth = '100%';
            img.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
            img.style.borderRadius = '8px';

            previewContainer.innerHTML = '';
            previewContainer.appendChild(img);

            const downloadBtn = document.getElementById('download-share-btn');
            if (downloadBtn) {
                const newBtn = downloadBtn.cloneNode(true);
                downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

                newBtn.onclick = () => {
                    const link = document.createElement('a');
                    link.download = `七律空间_${currentPoem.title}_雅帖.png`;
                    link.href = imgData;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                };
            }

            document.body.removeChild(cloneContainer);
        }).catch(err => {
            console.error('[ShareCard] 生成出错:', err);
            previewContainer.innerHTML = '<div class="share-loading" style="color:#e74c3c">生成失败，请重试</div>';
            if (document.body.contains(cloneContainer)) {
                document.body.removeChild(cloneContainer);
            }
        });
    }, 300);
};

window.closeShareCard = function () {
    const overlay = document.getElementById('share-card-overlay');
    if (overlay) overlay.classList.remove('active');
};
