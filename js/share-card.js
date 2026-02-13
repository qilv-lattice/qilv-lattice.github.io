/* ===== 雅帖生成逻辑 ===== */

// 接收 poems 和 currentIndex 作为参数，避免作用域问题
window.generateShareCard = function (poems, currentIndex) {

    if (typeof html2canvas === 'undefined') {
        alert('抱歉，绘图组件(html2canvas)加载失败。\n请检查网络连接或刷新页面重试。');
        return;
    }

    if (typeof currentIndex === 'undefined' || !poems) {
        alert('系统数据尚未就绪，请稍候再试。');
        return;
    }

    if (currentIndex < 0 || currentIndex >= poems.length) return;

    const currentPoem = poems[currentIndex];

    // 检查加锁逻辑
    let isUnlocked = !currentPoem.locked;
    if (!isUnlocked) {
        if (typeof window.isPoemUnlocked === 'function') {
            isUnlocked = window.isPoemUnlocked(currentPoem.title);
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

    const isHorizontal = originalCard.classList.contains('horizontal-mode');

    // 创建离屏容器
    const cloneContainer = document.createElement('div');
    cloneContainer.id = 'share-card-clone-container';
    cloneContainer.style.cssText = 'position:fixed; top:0; left:0; width:480px; z-index:-9999; visibility:visible;';
    document.body.appendChild(cloneContainer);

    const clone = originalCard.cloneNode(true);

    // === 最小限度的视觉清理 ===
    // 仅移除不适合出现在静态图片中的元素
    clone.querySelectorAll('.cursor-flashing').forEach(el => el.remove());
    clone.querySelectorAll('.audio-controls').forEach(el => el.remove());

    // 仅重置视觉干扰属性，不触碰布局属性（display/flex/writing-mode）
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.boxShadow = 'none';
    clone.style.transition = 'none';
    clone.style.border = 'none';
    clone.style.width = '480px';
    clone.style.maxWidth = '480px';
    clone.style.backgroundSize = 'cover';
    clone.style.backgroundPosition = 'center';

    // 仅横排模式需要额外的布局调整
    if (isHorizontal) {
        clone.style.padding = '4rem 2rem 3rem 2rem';
        clone.style.display = 'flex';
        clone.style.flexDirection = 'column';
        clone.style.alignItems = 'center';
        clone.style.justifyContent = 'center';
        clone.style.minHeight = '800px';
    }
    // 竖排模式：完全不覆盖布局属性！
    // 原始 CSS 中 #poem-text-container 已经设置好了 writing-mode/flex/居中
    // 只需确保克隆节点在 480px 容器中正常渲染即可

    // 落款（使用绝对定位，不干扰原有文档流）
    const footerMark = document.createElement('div');
    footerMark.innerHTML = '七律空间 · 雅藏';
    footerMark.style.cssText = [
        'position: absolute',
        'font-size: 0.85rem',
        'opacity: 0.6',
        'font-family: "Ma Shan Zheng", cursive',
        'pointer-events: none'
    ].join(';');

    if (isHorizontal) {
        // 横排：底部居中
        footerMark.style.bottom = '1.5rem';
        footerMark.style.left = '50%';
        footerMark.style.transform = 'translateX(-50%)';
        footerMark.style.textAlign = 'center';
    } else {
        // 竖排：左下角，竖排文字
        footerMark.style.writingMode = 'vertical-rl';
        footerMark.style.bottom = '2rem';
        footerMark.style.left = '1.5rem';
    }

    // clone 已经有 position: relative（来自原始 CSS），所以绝对定位可以工作
    clone.appendChild(footerMark);

    cloneContainer.appendChild(clone);

    // 延时确保渲染完成
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
    }, 500);
};

window.closeShareCard = function () {
    const overlay = document.getElementById('share-card-overlay');
    if (overlay) overlay.classList.remove('active');
};
