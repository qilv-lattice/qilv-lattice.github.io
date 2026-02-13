/* ===== 雅帖生成逻辑 ===== */
console.log('%c[ShareCard] js/share-card.js 已加载', 'color: green; font-weight: bold;');

window.generateShareCard = function () {
    console.log('%c[ShareCard] generateShareCard 被调用', 'color: blue;');

    // 检查 html2canvas 及其版本
    if (typeof html2canvas === 'undefined') {
        console.error('[ShareCard] html2canvas 未定义！CDN 加载失败？');
        alert('抱歉，绘图组件(html2canvas)加载失败。\n请检查网络连接或刷新页面重试。');
        return;
    } else {
        console.log('[ShareCard] html2canvas 可用');
    }

    // 1. 检查加锁状态
    // currentIndex 和 poems 是 script.js 定义的全局变量
    if (typeof currentIndex === 'undefined' || !window.poems) {
        console.error("[ShareCard] 诗词数据未加载 (poems or currentIndex missing)");
        alert('系统数据尚未就绪，请稍候再试。');
        return;
    }

    const currentPoem = window.poems[currentIndex];
    console.log('[ShareCard] 当前诗词:', currentPoem.title, '加锁状态:', currentPoem.locked);

    // 使用 unlockedPoems 全局变量检查
    if (currentPoem.locked && (!window.unlockedPoems || !window.unlockedPoems.includes(currentPoem.title))) {
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
    // 使用 fixed 定位在视口外，但必须在 DOM 中才能被 html2canvas 捕获
    const cloneContainer = document.createElement('div');
    cloneContainer.id = 'share-card-clone-container';
    cloneContainer.style.position = 'fixed';
    cloneContainer.style.top = '0';
    cloneContainer.style.left = '0';
    // 宽度固定为 480px，模拟手机或标准卡片宽度，保证生成的图片尺寸一致
    cloneContainer.style.width = '480px';
    cloneContainer.style.zIndex = '-9999';
    // 不可见但可渲染
    cloneContainer.style.visibility = 'visible';
    document.body.appendChild(cloneContainer);

    // 克隆卡片
    const clone = originalCard.cloneNode(true);

    // === 清理与样式修正 ===

    // 1. 移除不应出现在图片中的元素（如光标、音频控件等）
    const cursors = clone.querySelectorAll('.cursor-flashing');
    cursors.forEach(el => el.remove());

    const audioControls = clone.querySelectorAll('.audio-controls'); // 如果有
    audioControls.forEach(el => el.remove());

    // 2. 强制样式，确保截图效果统一
    clone.style.margin = '0';
    clone.style.transform = 'none'; // 移除 3D 效果
    clone.style.boxShadow = 'none';
    clone.style.transition = 'none';
    clone.style.border = 'none';
    // 确保高度自适应，且有最小高度
    clone.style.height = 'auto';
    clone.style.minHeight = '750px';

    // 3. 背景处理
    // 原卡片可能有 background-image (纹理)，我们需要保留
    // 确保文字颜色正确
    clone.style.color = getComputedStyle(originalCard).color;

    // 4. 内容边距调整
    // 雅帖通常需要较宽的留白，显得雅致
    if (clone.classList.contains('horizontal-mode')) {
        clone.style.padding = '4rem 2rem 3rem 2rem';
        // 横排模式下，内容居中
        clone.style.display = 'flex';
        clone.style.flexDirection = 'column';
        clone.style.alignItems = 'center';
        clone.style.justifyContent = 'center';
    } else {
        clone.style.padding = '3rem 2rem';
        // 竖排模式
        clone.style.writingMode = 'vertical-rl';
    }

    // 5. 底部添加落款（可选，增加仪式感）
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
    // 延时 300ms 确保 DOM 渲染完成（特别是外部字体和图片）
    setTimeout(() => {
        html2canvas(clone, {
            scale: 2.5, // 2.5倍清晰度
            useCORS: true, // 允许加载跨域图片
            backgroundColor: null, // 透明背景（虽然我们有容器背景）
            logging: true, // 开启日志
            width: 480, // 强制宽度
            windowWidth: 480,
            x: 0,
            y: 0
        }).then(canvas => {
            console.log('[ShareCard] 截图成功');
            // 生成图片 DataURL
            const imgData = canvas.toDataURL('image/png');

            // 创建预览图
            const img = new Image();
            img.src = imgData;
            img.style.maxWidth = '100%';
            img.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
            img.style.borderRadius = '8px';

            // 显示预览
            previewContainer.innerHTML = '';
            previewContainer.appendChild(img);

            // 绑定下载按钮事件
            const downloadBtn = document.getElementById('download-share-btn');
            if (downloadBtn) {
                // 移除旧事件（防止重复绑定）
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

            // 清理临时容器
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
