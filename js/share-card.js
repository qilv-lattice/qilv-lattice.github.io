/* ===== 雅帖生成逻辑 ===== */

const _H2C_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

function _loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
        if (typeof html2canvas !== 'undefined') { resolve(); return; }
        if (document.getElementById('html2canvas-script')) {
            const t = setInterval(() => {
                if (typeof html2canvas !== 'undefined') { clearInterval(t); resolve(); }
            }, 100);
            return;
        }
        const s = document.createElement('script');
        s.id = 'html2canvas-script';
        s.src = _H2C_CDN;
        s.onload = resolve;
        s.onerror = () => reject(new Error('html2canvas 加载失败'));
        document.head.appendChild(s);
    });
}

// 接收 poems 和 currentIndex 作为参数
window.generateShareCard = async function (poems, currentIndex) {

    if (typeof currentIndex === 'undefined' || !poems) {
        alert('系统数据尚未就绪，请稍候再试。');
        return;
    }

    if (currentIndex < 0 || currentIndex >= poems.length) return;

    const currentPoem = poems[currentIndex];

    // 检查加锁逻辑
    let isUnlocked = !currentPoem.locked;
    if (!isUnlocked && typeof window.isPoemUnlocked === 'function') {
        isUnlocked = window.isPoemUnlocked(currentPoem.title);
    }
    if (currentPoem.locked && !isUnlocked) {
        alert('抱歉，该作品隐藏深意，解锁后方可生成雅帖。');
        return;
    }

    const overlay = document.getElementById('share-card-overlay');
    const previewContainer = document.getElementById('share-card-preview-container');
    if (!overlay || !previewContainer) return;

    overlay.classList.add('active');
    previewContainer.innerHTML = '<div class="share-loading">正在加载绘图组件...</div>';

    try {
        await _loadHtml2Canvas();
    } catch {
        previewContainer.innerHTML = '<div class="share-loading" style="color:#e74c3c">绘图组件加载失败，请检查网络后重试</div>';
        return;
    }

    previewContainer.innerHTML = '<div class="share-loading">正在绘制雅帖，请稍候...</div>';

    const originalCard = document.querySelector('.poem-content.main-card');
    if (!originalCard) {
        previewContainer.innerHTML = '无法找到诗词卡片';
        return;
    }

    // 获取原始卡片的实际渲染尺寸（而非硬编码）
    const cardWidth = originalCard.offsetWidth;
    // 获取用户实际视口宽度（desktop.css 的媒体查询需要 1024px+）
    const viewportWidth = window.innerWidth;

    // 创建离屏容器，宽度与原始卡片一致
    const cloneContainer = document.createElement('div');
    cloneContainer.id = 'share-card-clone-container';
    cloneContainer.style.cssText = `position:fixed; top:0; left:0; width:${cardWidth}px; z-index:-9999; visibility:visible;`;
    document.body.appendChild(cloneContainer);

    const clone = originalCard.cloneNode(true);

    // === 最小限度的视觉清理 ===
    clone.querySelectorAll('.cursor-flashing').forEach(el => el.remove());
    clone.querySelectorAll('.audio-controls').forEach(el => el.remove());

    // 仅重置视觉干扰属性，不触碰布局属性
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.boxShadow = 'none';
    clone.style.transition = 'none';
    clone.style.border = 'none';
    clone.style.backgroundSize = 'cover';
    clone.style.backgroundPosition = 'center';
    // 宽度保持与原始卡片一致（不再强制覆盖）
    clone.style.width = cardWidth + 'px';
    clone.style.maxWidth = cardWidth + 'px';

    cloneContainer.appendChild(clone);

    // 延时确保渲染完成
    setTimeout(() => {
        html2canvas(clone, {
            scale: 2.5,
            useCORS: true,
            backgroundColor: null,
            logging: false,
            // 关键修复：使用原始卡片宽度，而非硬编码 480px
            width: cardWidth,
            // 关键修复：使用真实视口宽度，确保 desktop.css 媒体查询生效
            // 这样 @media (min-width: 1024px) 中的 ::before 章印样式才会被应用
            windowWidth: viewportWidth,
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

            // 判断是否为移动端
            const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

            const downloadBtn = document.getElementById('download-share-btn');
            if (downloadBtn) {
                if (isMobile) {
                    // 移动端：隐藏下载按钮，长按图片即可保存
                    downloadBtn.style.display = 'none';
                    const tip = document.createElement('div');
                    tip.style.cssText = 'text-align:center; padding:0.8rem 0 0.2rem; color:#888; font-size:0.85rem;';
                    tip.textContent = '长按上方图片即可保存到相册';
                    previewContainer.appendChild(tip);
                } else {
                    // 桌面端：直接使用 data URL 下载
                    downloadBtn.style.display = '';
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
