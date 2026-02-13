/* ===== 雅帖生成逻辑 ===== */
console.log('%c[ShareCard] js/share-card.js 已加载', 'color: green; font-weight: bold;');

// 接收 poems 和 currentIndex 作为参数，避免作用域问题
window.generateShareCard = function (poems, currentIndex) {
    console.log('%c[ShareCard] generateShareCard 被调用', 'color: blue;', { poemsLength: poems ? poems.length : 0, currentIndex });

    // 检查 html2canvas 及其版本
    if (typeof html2canvas === 'undefined') {
        console.error('[ShareCard] html2canvas 未定义！CDN 加载失败？');
        alert('抱歉，绘图组件(html2canvas)加载失败。\n请检查网络连接或刷新页面重试。');
        return;
    } else {
        console.log('[ShareCard] html2canvas 可用');
    }

    // 1. 检查加锁状态
    if (typeof currentIndex === 'undefined' || !poems) {
        console.error("[ShareCard] 诗词数据未传入 (poems or currentIndex missing)");
        alert('系统数据尚未就绪，请稍候再试。');
        return;
    }

    // 确保索引有效
    if (currentIndex < 0 || currentIndex >= poems.length) {
        console.error("[ShareCard] 索引越界", currentIndex);
        return;
    }

    const currentPoem = poems[currentIndex];
    console.log('[ShareCard] 当前诗词:', currentPoem.title, '加锁状态:', currentPoem.locked);

    // 检查加锁逻辑
    // share-card.js 无法直接访问 unlockedPoems 局部变量
    // 但可以使用全局帮助函数 isPoemUnlocked (如果 script.js 暴露了它)
    // 或者我们依赖 script.js 在传入 poems 之前已经处理了解锁状态
    // 其实 poems 中的 locked 属性是静态的
    // 我们再次检查 unlockedPoems 全局变量（如果有）或者尝试调用 window.isPoemUnlocked

    let isUnlocked = false;
    if (!currentPoem.locked) {
        isUnlocked = true;
    } else {
        // 尝试调用全局判断函数
        if (typeof window.isPoemUnlocked === 'function') {
            isUnlocked = window.isPoemUnlocked(currentPoem.title);
        } else if (window.unlockedPoems && window.unlockedPoems.includes(currentPoem.title)) {
            // 兼容旧逻辑
            isUnlocked = true;
        }
    }

    if (currentPoem.locked && !isUnlocked) {
        console.warn('[ShareCard] 诗词已加锁且未解锁');
        alert('抱歉，该作品隐藏深意，解锁后方可生成雅帖。');
        return;
    }

    // 2. 显示预览弹窗（Loading）
    const overlay = document.getElementById('share-card-overlay');
    const previewContainer = document.getElementById('share-card-preview-container');
    if (!overlay || !previewContainer) {
        console.error('[ShareCard] 找不到弹窗 DOM 元素 #share-card-overlay 或 #share-card-preview-container');
        return;
    }

    overlay.classList.add('active');
    previewContainer.innerHTML = '<div class="share-loading">正在绘制雅帖，请稍候...</div>';

    // 3. 准备克隆节点
    // 必须获取 .poem-content.main-card
    const originalCard = document.querySelector('.poem-content.main-card');
    if (!originalCard) {
        console.error('[ShareCard] 找不到 .poem-content.main-card');
        previewContainer.innerHTML = '无法找到诗词卡片';
        return;
    }

    console.log('[ShareCard] 开始克隆节点...');

    // 创建隐藏容器，用于放置克隆节点进行截图
    const cloneContainer = document.createElement('div');
    cloneContainer.id = 'share-card-clone-container';
    cloneContainer.style.position = 'fixed';
    cloneContainer.style.top = '0';
    cloneContainer.style.left = '0';
    cloneContainer.style.width = '480px';
    cloneContainer.style.zIndex = '-9999';
    cloneContainer.style.visibility = 'visible';
    document.body.appendChild(cloneContainer);

    // 克隆卡片
    const clone = originalCard.cloneNode(true);

    // === 清理与样式修正 ===
    const cursors = clone.querySelectorAll('.cursor-flashing');
    cursors.forEach(el => el.remove());

    const audioControls = clone.querySelectorAll('.audio-controls'); // 如果有
    audioControls.forEach(el => el.remove());

    clone.style.margin = '0';
    clone.style.transform = 'none'; // 移除 3D 效果
    clone.style.boxShadow = 'none';
    clone.style.transition = 'none';
    clone.style.border = 'none';
    clone.style.height = 'auto';
    clone.style.minHeight = '750px';
    clone.style.color = getComputedStyle(originalCard).color;

    if (clone.classList.contains('horizontal-mode')) {
        clone.style.padding = '4rem 2rem 3rem 2rem';
        clone.style.display = 'flex';
        clone.style.flexDirection = 'column';
        clone.style.alignItems = 'center';
        clone.style.justifyContent = 'center';
    } else {
        clone.style.padding = '3rem 2rem';
        clone.style.writingMode = 'vertical-rl';
    }

    const footerMark = document.createElement('div');
    footerMark.style.marginTop = '2rem';
    footerMark.style.fontSize = '0.8rem';
    footerMark.style.opacity = '0.6';
    footerMark.style.fontFamily = '"Ma Shan Zheng", cursive';
    footerMark.style.textAlign = 'center';
    footerMark.style.width = '100%';
    if (!clone.classList.contains('horizontal-mode')) {
        footerMark.style.marginTop = '0';
        footerMark.style.marginRight = '1rem';
        footerMark.style.writingMode = 'vertical-rl';
    }
    footerMark.innerHTML = '七律空间 · 雅藏';
    clone.appendChild(footerMark);

    cloneContainer.appendChild(clone);

    console.log('[ShareCard] 开始截图 (html2canvas)...');

    // 4. 执行截图
    setTimeout(() => {
        html2canvas(clone, {
            scale: 2.5,
            useCORS: true,
            backgroundColor: null,
            logging: true,
            width: 480,
            windowWidth: 480,
            x: 0,
            y: 0
        }).then(canvas => {
            console.log('[ShareCard] 截图成功');
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
                    console.log('[ShareCard] 用户点击下载');
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
            console.error('[ShareCard] 雅帖截图生成出错:', err);
            previewContainer.innerHTML = '<div class="share-loading" style="color:#e74c3c">抱歉，生成失败<br>请检查控制台详情</div>';
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
