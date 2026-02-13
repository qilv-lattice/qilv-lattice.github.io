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
    clone.style.minHeight = '850px'; // 增加高度以确保竖排有足够空间展示落款
    clone.style.color = getComputedStyle(originalCard).color;
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
        clone.style.padding = '3rem 2rem'; // 恢复适度内边距

        // 使用 Flexbox 布局
        clone.style.display = 'flex';
        // vertical-rl 下 column 方向是从右向左排列 (符合阅读顺序)
        clone.style.flexDirection = 'column';

        // 关键修正：垂直方向（Cross Axis）改为顶部对齐，避免标题悬浮在中间
        clone.style.alignItems = 'flex-start';

        // 水平方向（Main Axis）居中
        clone.style.justifyContent = 'center';
    }

    // 落款
    const footerMark = document.createElement('div');
    footerMark.style.fontSize = '0.9rem';
    footerMark.style.opacity = '0.7';
    footerMark.style.fontFamily = '"Ma Shan Zheng", cursive';
    footerMark.style.textAlign = 'center';

    if (clone.classList.contains('horizontal-mode')) {
        footerMark.style.marginTop = '2rem';
        footerMark.style.width = '100%';
    } else {
        // 竖排落款样式
        footerMark.style.writingMode = 'vertical-rl';

        // 在 flex column (Right-to-Left) 中
        // Cross Axis 是垂直方向 (Top-Bottom)
        // 我们希望落款文字底对齐 -> align-self: flex-end (Bottom)
        footerMark.style.alignSelf = 'flex-end';

        // 文字内容也要底对齐（如果 div 本身高度被拉伸）
        footerMark.style.textAlign = 'right'; // vertical mode 下 right = bottom

        footerMark.style.marginTop = '0';
        footerMark.style.marginLeft = '1.5rem'; // 左侧留白，与正文隔开
        footerMark.style.marginBottom = '3rem'; // 底部留白 (物理底部)
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
