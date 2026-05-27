/* ===== 雅帖生成逻辑 ===== */

const _H2C_CDNS = [
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

let _html2canvasLoadPromise = null;

function _loadScript(src, index) {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(`html2canvas-script-${index}`);
        if (existing) existing.remove();

        const script = document.createElement('script');
        const timer = setTimeout(() => {
            script.remove();
            reject(new Error('html2canvas 加载超时'));
        }, 12000);

        script.id = `html2canvas-script-${index}`;
        script.src = src;
        script.async = true;
        script.onload = () => {
            clearTimeout(timer);
            if (typeof window.html2canvas === 'function') {
                resolve();
            } else {
                script.remove();
                reject(new Error('html2canvas 加载异常'));
            }
        };
        script.onerror = () => {
            clearTimeout(timer);
            script.remove();
            reject(new Error('html2canvas 加载失败'));
        };
        document.head.appendChild(script);
    });
}

async function _loadHtml2Canvas() {
    if (typeof window.html2canvas === 'function') return;
    if (_html2canvasLoadPromise) return _html2canvasLoadPromise;

    _html2canvasLoadPromise = (async () => {
        let lastError = null;
        for (let i = 0; i < _H2C_CDNS.length; i += 1) {
            try {
                await _loadScript(_H2C_CDNS[i], i);
                return;
            } catch (err) {
                lastError = err;
                console.warn('[ShareCard] 绘图组件加载源不可用:', _H2C_CDNS[i], err);
            }
        }
        throw lastError || new Error('html2canvas 加载失败');
    })();

    try {
        await _html2canvasLoadPromise;
    } catch (err) {
        _html2canvasLoadPromise = null;
        throw err;
    }
}

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function _waitForShareAssets(root) {
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready.catch(() => {});
    }

    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 3000);
        });
    }));

    await _sleep(150);
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
    } catch (err) {
        console.error('[ShareCard] 绘图组件加载失败:', err);
        previewContainer.innerHTML = '<div class="share-loading" style="color:#e74c3c">绘图组件加载失败，请检查网络后重试</div>';
        return;
    }

    previewContainer.innerHTML = '<div class="share-loading">正在绘制雅帖，请稍候...</div>';

    const originalCard = document.querySelector('.poem-content.main-card');
    if (!originalCard) {
        previewContainer.innerHTML = '无法找到诗词卡片';
        return;
    }

    const rect = originalCard.getBoundingClientRect();
    const cardWidth = Math.ceil(rect.width || originalCard.offsetWidth);
    const cardHeight = Math.ceil(rect.height || originalCard.offsetHeight);
    const viewportWidth = window.innerWidth;

    if (!cardWidth || !cardHeight) {
        previewContainer.innerHTML = '<div class="share-loading" style="color:#e74c3c">卡片尺寸异常，请切换作品后重试</div>';
        return;
    }

    const cloneContainer = document.createElement('div');
    cloneContainer.id = 'share-card-clone-container';
    cloneContainer.style.cssText = [
        'position:fixed',
        'top:0',
        'left:-10000px',
        `width:${cardWidth}px`,
        'z-index:2147483647',
        'visibility:visible',
        'opacity:1',
        'pointer-events:none'
    ].join(';');
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
    clone.style.width = cardWidth + 'px';
    clone.style.maxWidth = cardWidth + 'px';
    clone.style.minWidth = cardWidth + 'px';

    cloneContainer.appendChild(clone);

    try {
        await _waitForShareAssets(clone);

        const canvas = await window.html2canvas(clone, {
            scale: 2.5,
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false,
            width: cardWidth,
            height: cardHeight,
            windowWidth: viewportWidth,
            x: 0,
            y: 0
        });

        const imgData = canvas.toDataURL('image/png');

        const img = new Image();
        img.src = imgData;
        img.style.maxWidth = '100%';
        img.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
        img.style.borderRadius = '8px';

        previewContainer.innerHTML = '';
        previewContainer.appendChild(img);

        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        const downloadBtn = document.getElementById('download-share-btn');
        if (downloadBtn) {
            if (isMobile) {
                downloadBtn.style.display = 'none';
                const tip = document.createElement('div');
                tip.style.cssText = 'text-align:center; padding:0.8rem 0 0.2rem; color:#888; font-size:0.85rem;';
                tip.textContent = '长按上方图片即可保存到相册';
                previewContainer.appendChild(tip);
            } else {
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
    } catch (err) {
        console.error('[ShareCard] 生成出错:', err);
        previewContainer.innerHTML = '<div class="share-loading" style="color:#e74c3c">生成失败，请重试</div>';
    } finally {
        if (document.body.contains(cloneContainer)) {
            document.body.removeChild(cloneContainer);
        }
    }
};

window.closeShareCard = function () {
    const overlay = document.getElementById('share-card-overlay');
    if (overlay) overlay.classList.remove('active');
};
