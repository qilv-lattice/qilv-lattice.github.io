let poems = [];
let currentIndex = 0;
let wingDisplayMode = localStorage.getItem('wingDisplayMode') || 'sync';
let lastWingIndices = { left: null, right: null };
let lastFireworkAt = 0;
let fireworksState = null;
let wingRandomizeOnNextSync = true;

// 全局关闭雪花特效
window.disableSnow = true;

// 背景图列表（将从 config.json 加载）
let backgrounds = [];

let bgIndex = 0; // 当前背景索引
const cacheBuster = Date.now(); // 时间戳破缓存
let bgMode = 'random'; // 背景模式：random（随机）或 fixed（固定）
let bgIntervalId = null; // 背景切换定时器ID
let fixedBgIndex = 0; // 固定模式下的背景索引

function isTouchDevice() {
    return ('ontouchstart' in window) ||
        (navigator.maxTouchPoints || 0) > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function isDesktopLayout() {
    return window.matchMedia &&
        window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches;
}

// 应用指定索引的背景
function applyBackground(index) {
    const currentBg = backgrounds[index];
    let styleEl = document.getElementById('dynamic-bg');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-bg';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
        body::before {
            background-image:
                linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
                linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px),
                url('${currentBg}?v=${cacheBuster}') !important;
        }
    `;

    // 分析背景亮度并触发主题变更
    analyzeBackground(currentBg);
}

// 缓存背景分析结果，避免重复计算
const bgAnalysisCache = new Map();
// 复用 Canvas 对象，避免频繁创建销毁
let sharedAnalysisCanvas = null;
let sharedAnalysisCtx = null;

// 分析背景图片亮度
function analyzeBackground(url) {
    // 1. 检查缓存
    if (bgAnalysisCache.has(url)) {
        const result = bgAnalysisCache.get(url);
        console.log(`Background (Cached): ${url}, Brightness: ${result.brightness.toFixed(1)}, Mode: ${result.isDark ? 'Dark' : 'Light'}`);
        window.dispatchEvent(new CustomEvent('lattice-theme-change', {
            detail: result
        }));
        return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;

    img.onload = () => {
        // 2. 初始化共享 Canvas (懒加载)
        if (!sharedAnalysisCanvas) {
            sharedAnalysisCanvas = document.createElement('canvas');
            sharedAnalysisCanvas.width = 1;
            sharedAnalysisCanvas.height = 1;
            //以此优化频繁读取操作
            sharedAnalysisCtx = sharedAnalysisCanvas.getContext('2d', { willReadFrequently: true });
        }

        // 3. 绘制并分析
        sharedAnalysisCtx.clearRect(0, 0, 1, 1);
        sharedAnalysisCtx.drawImage(img, 0, 0, 1, 1);
        const p = sharedAnalysisCtx.getImageData(0, 0, 1, 1).data;

        // 计算亮度 (Luminance) Formula: 0.299*R + 0.587*G + 0.114*B
        const brightness = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
        const isDark = brightness < 128;

        // 4. 存入缓存
        const result = { isDark, brightness };
        bgAnalysisCache.set(url, result);

        console.log(`Background: ${url}, Brightness: ${brightness.toFixed(1)}, Mode: ${isDark ? 'Dark' : 'Light'}`);

        // 触发自定义事件
        const event = new CustomEvent('lattice-theme-change', {
            detail: result
        });
        window.dispatchEvent(event);
    };

    img.onerror = () => {
        console.warn('Failed to analyze background:', url);
        // 默认深色模式
        window.dispatchEvent(new CustomEvent('lattice-theme-change', {
            detail: { isDark: true, brightness: 0 }
        }));
    };
}

// 随机切换背景
function changeBackground() {
    if (!backgrounds.length) return;
    if (bgMode === 'fixed') return; // 固定模式不切换
    bgIndex = Math.floor(Math.random() * backgrounds.length);
    applyBackground(bgIndex);
}

// 切换背景模式（随机/固定）
function toggleBgMode() {
    const btn = document.getElementById('bg-btn');
    if (bgMode === 'random') {
        // 切换到固定模式
        bgMode = 'fixed';
        fixedBgIndex = bgIndex; // 固定当前背景
        btn.innerHTML = '固定<br>背景';
        btn.classList.add('active-mode');
    } else {
        // 切换到随机模式
        bgMode = 'random';
        btn.innerHTML = '随机<br>背景';
        btn.classList.remove('active-mode');
        changeBackground(); // 立即切换一次
    }
}

// 选择指定背景并固定
function selectBackground(index) {
    bgMode = 'fixed';
    fixedBgIndex = index;
    bgIndex = index;
    applyBackground(index);
    const btn = document.getElementById('bg-btn');
    btn.innerHTML = '固定<br>背景';
    btn.classList.add('active-mode');
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const applyDeviceClasses = () => {
            document.body.classList.toggle('is-touch', isTouchDevice());
        };

        applyDeviceClasses();
        document.querySelectorAll('.snowflake').forEach(node => node.remove());
        initThreeCardLayout();
        updateWingDisplayButton();
        initViewModeMenu();
        initEntertainmentMenu();

        // 1. 加载配置
        const configResp = await fetch('data/config.json');
        const config = await configResp.json();
        backgrounds = config.backgrounds || [];

        // 2. 初始随机背景
        if (backgrounds.length > 0) {
            bgIndex = Math.floor(Math.random() * backgrounds.length);
            applyBackground(bgIndex);
            bgIntervalId = setInterval(changeBackground, 5 * 60 * 1000);
        }

        // 3. 加载诗词数据 (移到这里确保顺序)
        loadPoems();

    } catch (e) {
        console.error("Failed to load config:", e);
        // Fallback or alert? 可根据需求处理
    }


    // 每5分钟切换一次

    // 绑定背景按钮点击事件 (简化版下拉列表)
    const bgBtn = document.getElementById('bg-btn');
    const bgList = document.getElementById('bg-list');

    if (bgBtn && bgList) {
        // 点击按钮：切换列表显示
        bgBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            bgList.classList.toggle('show');

            // 定位列表
            const rect = bgBtn.getBoundingClientRect();
            bgList.style.top = (rect.bottom + 5) + 'px';
            bgList.style.left = rect.left + 'px';
        });

        // 点击列表项：选择背景
        bgList.addEventListener('click', (e) => {
            const item = e.target.closest('li[data-index]');
            if (item) {
                const index = parseInt(item.dataset.index);
                selectBackground(index);

                // 更新激活状态
                bgList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                item.classList.add('active');

                // 关闭列表
                bgList.classList.remove('show');
            }
        });

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!bgBtn.contains(e.target) && !bgList.contains(e.target)) {
                bgList.classList.remove('show');
            }
        });
    }

    // ===== 音乐分类菜单事件绑定 =====
    const musicControl = document.getElementById('music-control');
    const musicBranchGroup = document.getElementById('music-branch-group');
    const audio = document.getElementById('bg-music');
    const musicCtrl = document.getElementById('music-control');

    if (musicControl && musicBranchGroup) {
        // 1. 点击音乐图标：切换印章组显示状态
        musicControl.addEventListener('click', (e) => {
            e.stopPropagation();
            musicBranchGroup.classList.toggle('show');

            // 重置所有印章的激活状态
            if (musicBranchGroup.classList.contains('show')) {
                musicBranchGroup.querySelectorAll('.branch-item').forEach(item => item.classList.remove('active'));
            }
        });

        // 2. 点击印章按钮或音乐项
        musicBranchGroup.addEventListener('click', (e) => {
            e.stopPropagation();

            // 情况A：点击了印章按钮 (.branch-btn)
            const branchBtn = e.target.closest('.branch-btn');
            if (branchBtn) {
                const item = branchBtn.parentElement;
                const isActive = item.classList.contains('active');

                musicBranchGroup.querySelectorAll('.branch-item').forEach(i => i.classList.remove('active'));

                if (!isActive) {
                    item.classList.add('active');
                }
                return;
            }

            // 情况B：点击了具体音乐项
            const musicItem = e.target.closest('li[data-src]');
            if (musicItem) {
                const src = musicItem.dataset.src;

                // 播放选中的音乐
                if (audio) {
                    audio.src = src;
                    audio.play().then(() => {
                        if (musicCtrl) musicCtrl.classList.add('music-playing');
                    }).catch(err => console.log('音乐播放需要用户交互'));
                }

                // 关闭整个菜单组
                musicBranchGroup.classList.remove('show');

                // 更新激活状态 UI
                musicBranchGroup.querySelectorAll('li[data-src]').forEach(li => li.classList.remove('active'));
                musicItem.classList.add('active');
                return;
            }
        });

        // 3. 点击外部区域关闭音乐菜单
        document.addEventListener('click', (e) => {
            if (!musicControl.contains(e.target) && !musicBranchGroup.contains(e.target)) {
                musicBranchGroup.classList.remove('show');
            }
        });
    }

    // 更新通知信息（从 poems.json 动态读取）
    let updateInfo = {
        date: '',
        latestWorks: [],  // 改为数组，支持多首新作
        modifiedWorks: [] // 修改的作品
    };

    function normalizeTitleText(value) {
        return String(value || '').replace(/[^\u4e00-\u9fff0-9A-Za-z]/g, '');
    }

    function normalizeLatestWorks(list) {
        if (!Array.isArray(list)) return [];
        return list.map(item => {
            if (typeof item === 'string') {
                return { title: item, receivedAt: updateInfo.date || '' };
            }
            if (item && typeof item === 'object') {
                return {
                    title: item.title || '',
                    receivedAt: item.receivedAt || item.date || ''
                };
            }
            return null;
        }).filter(Boolean);
    }

    function findLatestWorkEntry(poemTitle) {
        const cleanTitle = normalizeTitleText(poemTitle);
        const latestEntries = normalizeLatestWorks(updateInfo.latestWorks);
        return latestEntries.find(entry => cleanTitle.includes(normalizeTitleText(entry.title)));
    }


    function getBeijingDateString() {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        return beijingTime.toISOString().split('T')[0];
    }

    // 获取本地日期的字符串（YYYY-MM-DD）
    function getLocalDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 红喇叭隐藏定时器（防止多个定时器叠加）
    let updateNoticeTimer = null;

    // 检查是否显示通知（匹配北京时间 或 本地时间）
    function checkUpdateNotice() {
        const noticeEl = document.getElementById('update-notice');
        const textEl = document.getElementById('notice-text');
        // 如果已被隐藏过，不再重复显示
        if (noticeEl && noticeEl.dataset.dismissed === 'true') {
            return;
        }
        // 使用统一的北京时间判断


        // 宽容模式：允许24小时内的缓冲期（即“今天”和“昨天”都算）
        const latestEntries = normalizeLatestWorks(updateInfo.latestWorks);
        const activeLatest = latestEntries.filter(entry => isWithin24Hours(entry.receivedAt || updateInfo.date));
        const isValid = activeLatest.length > 0;

        if (isValid) {
            // noticeEl.style.display = 'flex'; // 隐藏喇叭
            // 直接显示具体数量
            const count = activeLatest.length;
            textEl.innerHTML = `有新作 ${count} 首上线`;

            // 清除旧定时器，确保只有一个隐藏定时器
            if (updateNoticeTimer) clearTimeout(updateNoticeTimer);
            // 30秒后自动隐藏 (效仿黄喇叭)
            updateNoticeTimer = setTimeout(() => {
                if (noticeEl) {
                    noticeEl.style.display = 'none';
                    noticeEl.dataset.dismissed = 'true';
                }
            }, 30000);
        } else {
            noticeEl.style.display = 'none';
        }
    }

    // 通知状态
    let noticeExpanded = false;

    // 点击红喇叭：直接消失
    function toggleUpdateNotice() {
        const noticeEl = document.getElementById('update-notice');
        if (noticeEl) {
            noticeEl.style.display = 'none';
        }
    }
    window.toggleUpdateNotice = toggleUpdateNotice;



    // 蓝喇叭隐藏定时器（防止多个定时器叠加）
    let modificationNoticeTimer = null;

    // 黄喇叭（公告）显示逻辑
    function showAnnouncementNotice() {
        const noticeEl = document.getElementById('announcement-notice');
        if (!noticeEl) return;

        // 显示公告 (CSS中有 !important，这里不需要额外操作，但为了保险可以写)
        // noticeEl.style.display = 'flex'; 

        // 绑定点击隐藏事件 (覆盖 CSS !important)
        noticeEl.onclick = function () {
            this.style.setProperty('display', 'none', 'important');
        };

        // 30秒后自动隐藏 (覆盖 CSS !important)
        setTimeout(() => {
            if (noticeEl) {
                noticeEl.style.setProperty('display', 'none', 'important');
            }
        }, 30000);
    }


    // 检查是否显示修改通知（蓝喇叭）
    function checkModificationNotice() {
        const noticeEl = document.getElementById('modification-notice');
        const textEl = document.getElementById('mod-notice-text');
        // 如果已被隐藏过，不再重复显示
        if (noticeEl && noticeEl.dataset.dismissed === 'true') {
            return;
        }
        // 如果没有修改作品，或者不在更新时间窗口内，隐藏
        if (!updateInfo.modifiedWorks || updateInfo.modifiedWorks.length === 0) {
            noticeEl.style.display = 'none';
            return;
        }

        // 使用统一的北京时间判断


        // 宽容模式：允许24小时内的缓冲期（即“今天”和“昨天”都算）
        const isValid = isWithin24Hours(updateInfo.date);

        if (isValid) {
            // noticeEl.style.display = 'flex'; // 隐藏喇叭
            // 直接显示修订数量
            const count = updateInfo.modifiedWorks.length;
            textEl.innerHTML = `有 ${count} 首旧作翻新`;


            // 清除旧定时器，确保只有一个隐藏定时器
            if (modificationNoticeTimer) clearTimeout(modificationNoticeTimer);
            // 30秒后自动隐藏 (效仿黄喇叭)
            modificationNoticeTimer = setTimeout(() => {
                if (noticeEl) {
                    noticeEl.style.display = 'none';
                    noticeEl.dataset.dismissed = 'true';
                }
            }, 30000);
        } else {
            noticeEl.style.display = 'none';
        }
    }

    // 辅助函数：判断日期是否在有效期内（今天或昨天）
    // ??????????UTC???????
    function parseBeijingDateTimeToUtcMs(value) {
        if (!value) return null;
        if (typeof value === 'number') return value;

        const str = String(value).trim();
        if (!str) return null;

        // ?? YYYY-MM-DD ? YYYY-MM-DD HH:mm[:ss]
        const match = str.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
        if (!match) return null;

        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const hour = match[4] ? parseInt(match[4], 10) : 0;
        const minute = match[5] ? parseInt(match[5], 10) : 0;
        const second = match[6] ? parseInt(match[6], 10) : 0;

        const beijingOffsetMs = 8 * 3600000;
        return Date.UTC(year, month, day, hour, minute, second) - beijingOffsetMs;
    }

    // ??????????24?????????????????
    function isWithin24Hours(targetDateTime) {
        const targetMs = parseBeijingDateTimeToUtcMs(targetDateTime);
        if (targetMs === null) return false;

        const nowMs = Date.now();
        if (targetMs > nowMs) return true;
        return (nowMs - targetMs) <= 24 * 60 * 60 * 1000;
    }

    // 点击蓝喇叭：直接消失
    function toggleModificationNotice() {
        const noticeEl = document.getElementById('modification-notice');
        if (noticeEl) {
            noticeEl.style.display = 'none';
        }
    }
    window.toggleModificationNotice = toggleModificationNotice;

    async function loadPoems() {
        try {
            // 强制刷新：加上时间戳参数，防止 fetch 缓存 json 数据
            const response = await fetch('data/poems.json?t=' + Date.now());
            const data = await response.json();

            // 读取更新信息
            updateInfo.date = data.lastUpdate || '';
            // 支持新格式 latestWorks 数组，兼容旧格式 latestWork 字符串
            updateInfo.latestWorks = data.latestWorks || (data.latestWork ? [data.latestWork] : []);
            updateInfo.modifiedWorks = data.modifiedWorks || [];

            // 读取诗词数组
            poems = data.poems || data;

            // 检查并显示更新通知（红喇叭）
            checkUpdateNotice();

            // 检查并显示修改通知（蓝喇叭）
            checkModificationNotice();

            // 显示公告通知（黄喇叭，30秒后隐藏）
            showAnnouncementNotice();

            // 设置零点自动隐藏：计算距离下一个北京时间零点的毫秒数
            scheduleMidnightCheck();

            // 渲染名录
            console.log(`Loaded ${poems.length} poems.`);
            renderTOC();

            // 随机开始
            currentIndex = Math.floor(Math.random() * poems.length);
            renderPoem(currentIndex);
            initCharGame();
            const gameOverlay = document.getElementById('char-game-overlay');
            if (gameOverlay && gameOverlay.classList.contains('active')) {
                startCharGame();
            }
        } catch (error) {
            console.error("加载诗词数据失败:", error);
            alert("诗词数据加载失败： " + error.message);
        }
    }

    // 计算距离下一个北京时间零点的毫秒数，并设置定时器
    function scheduleMidnightCheck() {
        const now = new Date();
        // 计算北京时间 (UTC+8)
        const beijingOffsetMs = 8 * 3600000;
        const beijingNow = new Date(now.getTime() + beijingOffsetMs);
        // 计算北京时间明天零点
        const nextBeijingMidnightUtc = Date.UTC(
            beijingNow.getUTCFullYear(),
            beijingNow.getUTCMonth(),
            beijingNow.getUTCDate() + 1,
            0, 0, 0, 0
        ) - beijingOffsetMs;
        // 转换回本地时间计算差值
        let msUntilMidnight = nextBeijingMidnightUtc - now.getTime();
        if (msUntilMidnight < 0) {
            msUntilMidnight += 24 * 3600000;
        }

        console.log(`下次通知检查：${Math.round(msUntilMidnight / 60000)} 分钟后（北京时间零点）`);

        // 设置定时器，在零点重新检查通知
        setTimeout(() => {
            console.log("北京时间零点已到，刷新通知状态...");
            checkUpdateNotice();
            checkModificationNotice();
            renderTOC(); // 刷新目录高亮
            // 递归设置下一个24小时
            scheduleMidnightCheck();
        }, msUntilMidnight + 1000); // 加1秒确保时间已过零点
    }


    function ensureTocTabs() {
        const tocCard = document.querySelector('#toc-overlay .toc-card');
        if (!tocCard) return;

        let tabs = tocCard.querySelector('.toc-tabs');
        if (!tabs) {
            const title = tocCard.querySelector('.toc-title');
            tabs = document.createElement('div');
            tabs.className = 'toc-tabs';
            tabs.innerHTML = `
                <button class="toc-tab active" data-filter="all">全部作品</button>
                <button class="toc-tab" data-filter="new">上线新作</button>
                <button class="toc-tab" data-filter="modified">旧作修改</button>
            `;
            if (title) {
                title.insertAdjacentElement('afterend', tabs);
            } else {
                tocCard.prepend(tabs);
            }
        }

        if (!document.getElementById('toc-tab-style')) {
            const style = document.createElement('style');
            style.id = 'toc-tab-style';
            style.textContent = `
                .toc-tabs{display:flex;gap:6px;margin-bottom:.75rem;width:100%;justify-content:center;flex-wrap:wrap}
                .toc-tab{border:2px solid var(--accent-color);background:rgba(255,255,255,.92);color:var(--accent-color);
                padding:4px 8px;border-radius:6px;font-size:.8rem;font-weight:700;cursor:pointer;line-height:1.2}
                .toc-tab.active{background:var(--accent-color);color:#fff}
            `;
            document.head.appendChild(style);
        }
    }

    function bindTocTabs() {
        const tabs = document.querySelectorAll('.toc-tab');
        tabs.forEach(tab => {
            if (tab.dataset.bound === 'true') return;
            tab.dataset.bound = 'true';
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                currentTocFilter = tab.dataset.filter || 'all';
                setActiveTocTab(currentTocFilter);
                renderTOC(currentTocFilter);
            });
        });
    }

    let currentTocFilter = 'all';

    function setActiveTocTab(filter) {
        const tabs = document.querySelectorAll('.toc-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === filter);
        });
    }

    // 目录分类切换（兼容旧缓存页面）
    ensureTocTabs();
    bindTocTabs();

    function renderTOC(filter = currentTocFilter) {
        const tocList = document.getElementById('toc-list');

        tocList.innerHTML = '';
        const latestEntries = normalizeLatestWorks(updateInfo.latestWorks);
        const activeLatest = latestEntries.filter(entry => isWithin24Hours(entry.receivedAt || updateInfo.date));
        const activeLatestKeys = activeLatest.map(entry => normalizeTitleText(entry.title));

        const activeModifiedKeys = (updateInfo.modifiedWorks || [])
            .filter(() => isWithin24Hours(updateInfo.date))
            .map(title => normalizeTitleText(title));

        const filteredPoems = poems.filter(poem => {
            if (filter === 'all') return true;
            const cleanTitle = normalizeTitleText(poem.title);
            if (filter === 'new') {
                return activeLatestKeys.some(key => cleanTitle.includes(key));
            }
            if (filter === 'modified') {
                return activeModifiedKeys.some(key => cleanTitle.includes(key));
            }
            return true;
        });

        if (filteredPoems.length === 0) {
            const li = document.createElement('li');
            li.innerText = filter === 'new' ? '暂无新作' : '暂无修订';
            tocList.appendChild(li);
            return;
        }

        filteredPoems.forEach((poem, index) => {
            const li = document.createElement('li');
            li.innerText = poem.title;

            const latestEntry = findLatestWorkEntry(poem.title);
            const isNewWork = !!latestEntry;
            const isNewWorkActive = latestEntry && isWithin24Hours(latestEntry.receivedAt || updateInfo.date);

            const cleanTitle = normalizeTitleText(poem.title);

            // 2. ????????? (????)
            const isModifiedWork = updateInfo.modifiedWorks.some(work => {
                return cleanTitle.includes(normalizeTitleText(work));
            });

            const isModifiedWorkActive = isModifiedWork && isWithin24Hours(updateInfo.date);

            if (isNewWorkActive || isModifiedWorkActive) {
                if (isNewWorkActive && isModifiedWorkActive) {
                    li.classList.add('new-modified-highlight');
                    li.innerHTML = `${poem.title} <span style="font-size: 0.8em; opacity: 0.8;">(\u65b0)</span><span style="color: #4A90E2; font-size: 0.8em; opacity: 0.8;">(\u4fee)</span>`;
                } else if (isNewWorkActive) {
                    li.classList.add('new-work-highlight');
                } else if (isModifiedWorkActive) {
                    li.classList.add('modified-work-highlight');
                }
            }


            li.onclick = () => {
                const realIndex = poems.findIndex(p => p.title === poem.title);
                currentIndex = realIndex >= 0 ? realIndex : index;
                renderPoem(currentIndex);
                toggleTOC();
            };
            tocList.appendChild(li);
        });
    }

    function toggleTOC() {
        const overlay = document.getElementById('toc-overlay');
        if (!overlay) return;
        const opening = !overlay.classList.contains('active');
        overlay.classList.toggle('active');
        if (opening) {
            currentTocFilter = 'all';
            setActiveTocTab(currentTocFilter);
            renderTOC(currentTocFilter);
            requestAnimationFrame(() => {
                positionTOC();
            });
        }
    }

    function positionTOC() {
        const overlay = document.getElementById('toc-overlay');
        const tocCard = overlay ? overlay.querySelector('.toc-card') : null;
        const tocBtn = document.getElementById('toc-btn');
        if (!tocCard || !tocBtn) return;

        const rect = tocBtn.getBoundingClientRect();
        const cardRect = tocCard.getBoundingClientRect();
        const padding = 8;
        const gap = 8;

        let left = rect.left + rect.width / 2 - cardRect.width / 2;
        left = Math.max(padding, Math.min(left, window.innerWidth - cardRect.width - padding));

        let top = rect.bottom + gap;
        if (top + cardRect.height > window.innerHeight - padding) {
            const aboveTop = rect.top - cardRect.height - gap;
            if (aboveTop > padding) {
                top = aboveTop;
            } else {
                top = Math.max(padding, window.innerHeight - cardRect.height - padding);
            }
        }

        tocCard.style.left = `${left}px`;
        tocCard.style.top = `${top}px`;
        tocCard.style.transform = 'none';
    }

    window.addEventListener('resize', () => {
        const overlay = document.getElementById('toc-overlay');
        if (overlay && overlay.classList.contains('active')) {
            positionTOC();
        }
    });

    // 切换作品注释弹窗
    function toggleNotes() {
        const overlay = document.getElementById('notes-overlay');
        const notesContent = document.getElementById('notes-content');
        const noteBtn = document.getElementById('note-btn');
        if (!overlay || !notesContent) return;

        // 如果弹窗将要打开，先填充内容
        if (!overlay.classList.contains('active')) {
            const poem = poems[currentIndex];
            const notes = poem.notes || [];

            if (notes.length > 0) {
                // 有注释：逐条显示
                notesContent.innerHTML = notes.map(note => `<p>${note}</p>`).join('');
                // 点击查看后移除高亮
                if (noteBtn) noteBtn.classList.remove('has-notes');
            } else {
                // 无注释
                notesContent.innerHTML = '<p>暂无注释</p>';
            }
        }

        overlay.classList.toggle('active');
    }

    // ===== 文字游戏 =====
    const charGameState = {
        active: false,
        pool: [],
        targets: [],
        fillOrder: [],
        fillIndex: 0,
        remainingCells: [],
        falling: [],
        spawnTimer: null,
        rafId: null,
        lastFrame: 0,
        startedAt: 0,
        maxDurationMs: 5 * 60 * 1000,
        maxFalling: 40,
        maxDrops: 0,
        totalSpawned: 0,
        maxFill: 10,
        spawnArea: null,
        finished: false,
        retryTimer: null
    };

    function stripPunctuation(text) {
        return String(text || '')
            .replace(/[，。！？；：、,.!?;:\s]/g, '')
            .replace(/[《》「」『』“”‘’（）()]/g, '');
    }

    function getCharGamePoems() {
        if (!poems.length) return [];
        const index = Math.floor(Math.random() * poems.length);
        return [poems[index]];
    }

    function buildTargetLines(poem) {
        const lines = (poem.content || []).slice(0, 4);
        return lines.map(line => {
            const text = stripPunctuation(line);
            const left = text.slice(0, 7);
            const right = text.slice(7, 14);
            return `${left}，${right}。`;
        });
    }

    function buildCharPool(list) {
        const pool = [];
        list.forEach(poem => {
            (poem.content || []).slice(0, 4).forEach(line => {
                const text = stripPunctuation(line);
                Array.from(text).forEach(ch => pool.push(ch));
            });
        });
        return pool;
    }

    function buildGameGrid() {
        const grid = document.getElementById('char-game-grid');
        if (!grid) return;
        grid.innerHTML = '';
        charGameState.fillOrder = [];
        charGameState.fillIndex = 0;

        for (let row = 0; row < 4; row += 1) {
            for (let col = 0; col < 16; col += 1) {
                const cell = document.createElement('div');
                cell.className = 'char-game-cell';
                cell.dataset.row = String(row);
                cell.dataset.col = String(col);

                if (col === 7) {
                    cell.textContent = '，';
                    cell.classList.add('punct');
                } else if (col === 15) {
                    cell.textContent = '。';
                    cell.classList.add('punct');
                } else {
                    cell.textContent = '';
                    charGameState.fillOrder.push(cell);
                }

                grid.appendChild(cell);
            }
        }
    }

    function shuffleArray(list) {
        for (let i = list.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    function buildCharListFromLines(lines) {
        const chars = [];
        lines.forEach(line => {
            const clean = String(line || '').replace(/[，。！？；：、\s]/g, '');
            Array.from(clean).forEach(ch => chars.push(ch));
        });
        return chars;
    }

    function removeOnce(list, value) {
        const idx = list.indexOf(value);
        if (idx >= 0) list.splice(idx, 1);
    }

    function prefillGrid(targetLines) {
        const grid = document.getElementById('char-game-grid');
        if (!grid) return;

        const entries = [];
        for (let row = 0; row < 4; row += 1) {
            const line = targetLines[row] || '';
            for (let col = 0; col < 16; col += 1) {
                if (col === 7 || col === 15) continue;
                const cell = grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                if (!cell) continue;
                const char = line[col] || '';
                cell.textContent = '';
                cell.classList.remove('filled', 'prefilled');
                entries.push({ cell, char, row, col });
            }
        }

        const total = entries.length;
        const prefillCount = Math.max(0, total - charGameState.maxFill);
        const indices = shuffleArray(Array.from({ length: total }, (_, idx) => idx));
        const prefillSet = new Set(indices.slice(0, prefillCount));
        const prefilled = entries.filter((_, idx) => prefillSet.has(idx));
        const remaining = entries.filter((_, idx) => !prefillSet.has(idx));

        prefilled.forEach(entry => {
            entry.cell.textContent = entry.char;
            entry.cell.classList.add('filled', 'prefilled');
        });

        charGameState.remainingCells = remaining;
        const remainingChars = remaining.map(entry => entry.char);
        const allChars = buildCharListFromLines(targetLines);
        const decoyCandidates = allChars.slice();
        remainingChars.forEach(ch => removeOnce(decoyCandidates, ch));

        let decoys = [];
        if (decoyCandidates.length >= remainingChars.length) {
            decoys = shuffleArray(decoyCandidates).slice(0, remainingChars.length);
        } else {
            decoys = decoyCandidates.slice();
            while (decoys.length < remainingChars.length) {
                const pick = allChars[Math.floor(Math.random() * allChars.length)];
                decoys.push(pick);
            }
        }

        const pool = shuffleArray(remainingChars.concat(decoys));
        charGameState.pool = pool;
        charGameState.fillIndex = 0;
    }

    function renderCharGameNav() {
        const nav = document.getElementById('char-game-nav');
        const cells = document.getElementById('char-game-nav-cells');
        const header = document.querySelector('header');
        if (!nav || !cells) return;
        cells.innerHTML = '';
        charGameState.remainingCells.forEach(entry => {
            const cell = document.createElement('div');
            cell.className = 'char-game-nav-cell';
            cell.textContent = entry.char;
            cells.appendChild(cell);
        });
        nav.classList.add('active');
        if (header) header.classList.add('char-game-active');
    }

    function hideCharGameNav() {
        const nav = document.getElementById('char-game-nav');
        const cells = document.getElementById('char-game-nav-cells');
        const header = document.querySelector('header');
        if (cells) cells.innerHTML = '';
        if (nav) nav.classList.remove('active');
        if (header) header.classList.remove('char-game-active');
    }

    function showCharGameDialog() {
        const dialog = document.getElementById('char-game-dialog');
        if (dialog) dialog.classList.add('active');
    }

    function hideCharGameDialog() {
        const dialog = document.getElementById('char-game-dialog');
        if (dialog) dialog.classList.remove('active');
    }

    function positionCharGamePanel() {
        const panel = document.querySelector('.char-game-panel');
        const overlay = document.getElementById('char-game-overlay');
        const layer = document.getElementById('char-fall-layer');
        if (!panel || !overlay) return;

        const card = getMainCard();
        if (!card) {
            panel.style.top = '50%';
            panel.style.left = '50%';
            panel.style.transform = 'translate(-50%, -50%)';
            if (layer) {
                layer.style.top = panel.style.top;
                layer.style.left = panel.style.left;
                layer.style.width = panel.offsetWidth + 'px';
                layer.style.height = panel.offsetHeight + 'px';
                layer.style.transform = panel.style.transform;
            }
            return;
        }

        const cardRect = card.getBoundingClientRect();
        const headerEl = document.querySelector('header');
        const headerRect = headerEl ? headerEl.getBoundingClientRect() : null;
        const panelRect = panel.getBoundingClientRect();
        let top = cardRect.bottom - 40;
        let left = cardRect.left + (cardRect.width - panelRect.width) / 2;

        left = Math.max(12, Math.min(left, window.innerWidth - panelRect.width - 12));
        top = Math.max(12, Math.min(top, window.innerHeight - panelRect.height - 12));

        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.transform = 'none';

        const channelTop = headerRect ? headerRect.bottom : cardRect.bottom;
        const channelHeight = Math.max(120, window.innerHeight - channelTop);
        charGameState.spawnArea = {
            left,
            top: channelTop,
            width: panelRect.width,
            height: channelHeight
        };

        if (layer) {
            layer.style.position = 'absolute';
            layer.style.top = `${charGameState.spawnArea.top}px`;
            layer.style.left = `${charGameState.spawnArea.left}px`;
            layer.style.width = `${charGameState.spawnArea.width}px`;
            layer.style.height = `${charGameState.spawnArea.height}px`;
            layer.style.transform = 'none';
        }
    }

    function placeNextChar(char) {
        if (!charGameState.remainingCells.length) return;
        const hint = document.querySelector('.char-game-hint');
        const nextEntry = charGameState.remainingCells[0];
        if (!nextEntry || nextEntry.char !== char) {
            if (hint) hint.textContent = '请按顺序点击正确汉字。';
            return;
        }
        nextEntry.cell.textContent = char;
        nextEntry.cell.classList.add('filled');
        nextEntry.cell.classList.remove('hit');
        void nextEntry.cell.offsetWidth;
        nextEntry.cell.classList.add('hit');
        setTimeout(() => {
            nextEntry.cell.classList.remove('hit');
        }, 240);
        charGameState.remainingCells.shift();
        renderCharGameNav();
        checkGameCompletion();
    }

    function getGridLines() {
        const grid = document.getElementById('char-game-grid');
        if (!grid) return [];
        const lines = [];
        for (let row = 0; row < 4; row += 1) {
            let line = '';
            for (let col = 0; col < 16; col += 1) {
                const cell = grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                line += cell ? cell.textContent : '';
            }
            lines.push(line);
        }
        return lines;
    }

    function checkGameCompletion() {
        if (charGameState.remainingCells.length > 0) return;
        if (charGameState.finished) return;

        const hint = document.querySelector('.char-game-hint');

        charGameState.finished = true;
        if (hint) hint.textContent = `已填满 ${charGameState.maxFill} 字，测试结束。`;
        triggerFireworks();
        stopCharGameFall();
        hideCharGameNav();
        showCharGameDialog();
    }

    function removeFallItem(item) {
        if (!item) return;
        if (item.el && item.el.parentNode) {
            item.el.parentNode.removeChild(item.el);
        }
        const idx = charGameState.falling.indexOf(item);
        if (idx >= 0) charGameState.falling.splice(idx, 1);
    }

    function spawnFallItem() {
        if (!charGameState.active) return;
        if (!charGameState.pool.length) return;
        if (charGameState.falling.length >= charGameState.maxFalling) return;
        if (charGameState.maxDrops > 0 && charGameState.totalSpawned >= charGameState.maxDrops) return;

        const overlay = document.getElementById('char-game-overlay');
        if (!overlay) return;
        if (!charGameState.spawnArea) positionCharGamePanel();
        if (!charGameState.spawnArea) return;

        const char = charGameState.pool[Math.floor(Math.random() * charGameState.pool.length)];
        const el = document.createElement('div');
        el.className = 'char-fall-item';
        el.textContent = char;

        const slotWidth = charGameState.spawnArea.width / 16;
        const size = Math.max(22, Math.min(32, slotWidth * 0.9));
        const col = Math.floor(Math.random() * 16);
        const x = charGameState.spawnArea.left + col * slotWidth + (slotWidth - size) / 2;
        const y = charGameState.spawnArea.top;
        const speed = 30 + Math.random() * 40;
        const drift = 0;

        el.style.fontSize = `${size * 0.7}px`;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.transform = `translate(${x}px, ${y}px)`;

        const item = { el, x, y, speed, drift };
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            placeNextChar(char);
            removeFallItem(item);
        });

        overlay.appendChild(el);
        charGameState.falling.push(item);
        charGameState.totalSpawned += 1;
    }

    function updateFallItems(timestamp) {
        if (!charGameState.active) return;
        if (!charGameState.lastFrame) charGameState.lastFrame = timestamp;
        const delta = (timestamp - charGameState.lastFrame) / 1000;
        charGameState.lastFrame = timestamp;

        const area = charGameState.spawnArea || { top: 0, height: window.innerHeight };

        charGameState.falling.slice().forEach(item => {
            item.y += item.speed * delta;
            item.x += item.drift * delta;
            if (item.el) {
                item.el.style.transform = `translate(${item.x}px, ${item.y}px)`;
            }
            if (item.y > area.top + area.height + 40) {
                removeFallItem(item);
            }
        });

        charGameState.rafId = requestAnimationFrame(updateFallItems);
    }

    function stopCharGameFall() {
        if (charGameState.spawnTimer) {
            clearInterval(charGameState.spawnTimer);
            charGameState.spawnTimer = null;
        }
        if (charGameState.rafId) {
            cancelAnimationFrame(charGameState.rafId);
            charGameState.rafId = null;
        }
        charGameState.lastFrame = 0;
        charGameState.falling.slice().forEach(item => removeFallItem(item));
        const overlay = document.getElementById('char-game-overlay');
        if (overlay) {
            overlay.querySelectorAll('.char-fall-item').forEach(node => node.remove());
        }
        charGameState.falling = [];
    }

    function startCharGame() {
        const overlay = document.getElementById('char-game-overlay');
        const hint = document.querySelector('.char-game-hint');
        if (!overlay) return;

        const selectedPoems = getCharGamePoems();
        if (!selectedPoems.length) {
            if (hint) hint.textContent = '诗词数据加载中，稍候自动重试…';
            if (!charGameState.retryTimer) {
                charGameState.retryTimer = setTimeout(() => {
                    charGameState.retryTimer = null;
                    if (overlay.classList.contains('active')) {
                        startCharGame();
                    }
                }, 800);
            }
            return;
        }

        charGameState.active = true;
        charGameState.finished = false;
        charGameState.targets = selectedPoems.map(buildTargetLines);
        charGameState.pool = buildCharPool(selectedPoems);
        charGameState.startedAt = Date.now();
        charGameState.totalSpawned = 0;
        if (hint) hint.textContent = `随机选诗：已预填 ${56 - charGameState.maxFill} 字，补齐剩余 ${charGameState.maxFill} 字`;

        buildGameGrid();
        prefillGrid(charGameState.targets[0] || []);
        renderCharGameNav();
        hideCharGameDialog();
        requestAnimationFrame(positionCharGamePanel);
        stopCharGameFall();
        charGameState.spawnTimer = setInterval(spawnFallItem, 320);
        charGameState.rafId = requestAnimationFrame(updateFallItems);
    }

    function stopCharGame() {
        charGameState.active = false;
        stopCharGameFall();
        charGameState.pool = [];
        charGameState.targets = [];
        charGameState.fillOrder = [];
        charGameState.fillIndex = 0;
        charGameState.remainingCells = [];
        charGameState.finished = false;
        if (charGameState.retryTimer) {
            clearTimeout(charGameState.retryTimer);
            charGameState.retryTimer = null;
        }
        hideCharGameNav();
        hideCharGameDialog();
    }

    function toggleCharGame(force) {
        const overlay = document.getElementById('char-game-overlay');
        if (!overlay) return;
        const shouldOpen = typeof force === 'boolean' ? force : !overlay.classList.contains('active');
        if (shouldOpen) {
            overlay.classList.add('active');
            startCharGame();
        } else {
            overlay.classList.remove('active');
            stopCharGame();
        }
    }

    function initCharGame() {
        const btn = document.getElementById('char-game-btn');
        if (!btn) return;
    }

    window.addEventListener('resize', () => {
        const overlay = document.getElementById('char-game-overlay');
        if (overlay && overlay.classList.contains('active')) {
            positionCharGamePanel();
        }
    });

    function getMainCard() {
        return document.querySelector('.poem-content.main-card');
    }



    function measureVerticalCardHeight(card) {
        const clone = card.cloneNode(true);
        clone.classList.remove('horizontal-mode');
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.pointerEvents = 'none';
        clone.style.left = '-9999px';
        clone.style.top = '0';
        clone.style.height = 'auto';
        clone.style.minHeight = '0';
        document.body.appendChild(clone);
        const height = clone.getBoundingClientRect().height;
        clone.remove();
        return height;
    }

    function lockMobileCardHeight() {
        if (window.innerWidth > 1023) return;
        const card = getMainCard();
        if (!card) return;
        const height = measureVerticalCardHeight(card);
        if (height > 0) {
            card.dataset.verticalHeight = String(height);
            card.style.minHeight = `${height}px`;
        }
    }

    function updateWingDisplayButton() {
        const group = document.getElementById('viewmode-branch-group');
        if (!group) return;
        group.querySelectorAll('.branch-item').forEach(item => {
            item.classList.toggle('active', item.dataset.mode === wingDisplayMode);
        });
    }

    function setWingDisplayMode(mode, options = {}) {
        const { persist = true } = options;
        wingDisplayMode = mode === 'random' ? 'random' : 'sync';
        if (wingDisplayMode === 'random') {
            wingRandomizeOnNextSync = true;
        }
        if (persist) localStorage.setItem('wingDisplayMode', wingDisplayMode);
        updateWingDisplayButton();
        lockMobileCardHeight();
        syncWingCards();
    }

    let viewModeMenuTimer = null;
    let entertainmentMenuTimer = null;

    function openViewModeMenu() {
        const group = document.getElementById('viewmode-branch-group');
        if (!group) return;
        group.classList.add('show');
        clearTimeout(viewModeMenuTimer);
        viewModeMenuTimer = setTimeout(() => {
            if (!group.classList.contains('show')) return;
            setWingDisplayMode('random');
            closeViewModeMenu();
        }, 5000);
    }

    function closeViewModeMenu() {
        const group = document.getElementById('viewmode-branch-group');
        if (!group) return;
        group.classList.remove('show');
        clearTimeout(viewModeMenuTimer);
    }

    function initViewModeMenu() {
        const group = document.getElementById('viewmode-branch-group');
        if (!group) return;
        group.querySelectorAll('.branch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const mode = btn.dataset.mode || 'random';
                setWingDisplayMode(mode);
                closeViewModeMenu();
            });
        });
    }

    function openEntertainmentMenu() {
        const group = document.getElementById('entertainment-branch-group');
        if (!group) return;
        group.classList.add('show');
        clearTimeout(entertainmentMenuTimer);
        entertainmentMenuTimer = setTimeout(() => {
            closeEntertainmentMenu();
        }, 5000);
    }

    function closeEntertainmentMenu() {
        const group = document.getElementById('entertainment-branch-group');
        if (!group) return;
        group.classList.remove('show');
        clearTimeout(entertainmentMenuTimer);
    }

    function toggleEntertainmentMenu() {
        const group = document.getElementById('entertainment-branch-group');
        if (!group) return;
        if (group.classList.contains('show')) {
            closeEntertainmentMenu();
        } else {
            openEntertainmentMenu();
        }
    }

    function initEntertainmentMenu() {
        const group = document.getElementById('entertainment-branch-group');
        if (!group) return;
        group.querySelectorAll('.branch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'char-game') {
                    if (window.toggleCharGame) window.toggleCharGame(true);
                }
                if (action === 'fireworks') {
                    console.log("Click: Fireworks button pressed.");
                    if (typeof window.triggerFireworks === 'function') {
                        window.triggerFireworks();
                    } else {
                        console.error("Error: window.triggerFireworks is not defined!");
                        alert("烟花组件尚未加载完成，请稍后再试。");
                    }
                }
                closeEntertainmentMenu();
            });
        });
    }

    function selectRandomWingIndices() {
        if (!poems.length) return { left: null, right: null };
        return {
            left: Math.floor(Math.random() * poems.length),
            right: Math.floor(Math.random() * poems.length)
        };
    }

    function renderPoemIntoCard(card, poem) {
        if (!card || !poem) return;
        const titleEl = card.querySelector('#poem-title');
        const bodyDiv = card.querySelector('#poem-body');
        if (titleEl) {
            let displayTitle = poem.title;
            const tongYunRegex = /[\(（]通韵[\)）]/;
            if (tongYunRegex.test(displayTitle)) {
                displayTitle = displayTitle.replace(tongYunRegex, "");
            }
            titleEl.innerText = displayTitle;
        }
        if (bodyDiv) {
            bodyDiv.innerHTML = '';
            poem.content.forEach(line => {
                const p = document.createElement('p');
                p.innerText = line;
                bodyDiv.appendChild(p);
            });
        }
        const techRomanceTag = card.querySelector('#tech-romance-tag');
        if (techRomanceTag) {
            const tagText = poem.techRomance ? '专属理工极致浪漫' : '专属斯人心灵浪漫';
            techRomanceTag.innerHTML = tagText;
        }

        // 五星装饰显示逻辑
        const fiveStars = card.querySelector('.five-stars-row');
        if (fiveStars) {
            fiveStars.classList.add('show-stars'); // 默认始终显示
            if (['七律·逆风', '《七律·逆风》'].some(t => poem.title.includes(t)) || poem.title.includes('逆风')) {
                fiveStars.style.color = '#DE2910'; // China Red
            } else if (['七律·灵犀', '《七律·灵犀》'].some(t => poem.title.includes(t)) || poem.title.includes('灵犀')) {
                fiveStars.style.color = '#1E90FF'; // Dodger Blue
            } else {
                fiveStars.style.color = '#CCCCCC'; // Default Gray
            }
        }
    }

    // Old fireworks implementation removed to avoid conflict with js/fireworks.js

    // Making it a no-op that delegates to the global one if possible, 
    // but since we are modifying the source, let's just remove the function body 
    // and let the global one from fireworks.js take over. 
    // However, if script.js defines `function triggerFireworks() {}` at top level, it might override window.triggerFireworks.
    // Let's check if script.js is wrapped. 
    // Looking at the view_file output, it seems to be inside `document.addEventListener('DOMContentLoaded', ...)` or similar?
    // Actually, looking at line 1 in previous turns, script.js seems to be a big file.
    // If it's a function declaration `function triggerFireworks()`, it hoists.
    // If I delete it, the call sites `triggerFireworks()` will look for the global one.
    // So DELETING it or Commenting it out is the right move.

    // To be safe and clean, I will comment it out by wrapping it in /* */ 
    // AND I will check if there are other references that need update.
    // wait, `maybeTriggerFireworks` calls `triggerFireworks()`.
    // If I comment out the local definition, `triggerFireworks()` will resolve to `window.triggerFireworks`.

    /* 
    function triggerFireworks() {
      // Disabled in favor of js/fireworks.js
    } 
    */
    function maybeTriggerFireworks() {
        if (wingDisplayMode !== 'random') return;
        if (!isDesktopLayout()) return;
        if (document.body.classList.contains('view-mode-single')) return;
        if (lastWingIndices.left === null || lastWingIndices.right === null) return;
        if (lastWingIndices.left === currentIndex && lastWingIndices.right === currentIndex) {
            triggerFireworks();
        }
    }

    function syncWingCards() {
        const mainCard = getMainCard();
        const wingCards = document.querySelectorAll('.poem-content.wing');

        if (!mainCard || wingCards.length === 0) return;

        let randomIndices = null;
        let didRandomize = false;
        if (wingDisplayMode === 'random' && poems.length > 0) {
            const needsRandom = wingRandomizeOnNextSync || lastWingIndices.left === null || lastWingIndices.right === null;
            if (needsRandom) {
                randomIndices = selectRandomWingIndices();
                didRandomize = true;
                wingRandomizeOnNextSync = false;
            } else {
                randomIndices = lastWingIndices;
            }
        }

        wingCards.forEach((wing, idx) => {
            const clone = mainCard.cloneNode(true);

            wing.className = '';
            mainCard.classList.forEach(cls => {
                if (cls !== 'main-card') wing.classList.add(cls);
            });
            wing.classList.add('wing');
            wing.style.cssText = mainCard.style.cssText;
            wing.innerHTML = clone.innerHTML;

            if (randomIndices) {
                const useIndex = idx === 0 ? randomIndices.left : randomIndices.right;
                const poem = poems[useIndex];
                renderPoemIntoCard(wing, poem);
            }
        });

        if (randomIndices) {
            lastWingIndices = randomIndices;
        } else {
            lastWingIndices = { left: null, right: null };
        }
        if (didRandomize) {
            maybeTriggerFireworks();
        }
    }

    function initThreeCardLayout() {
        if (!isDesktopLayout()) return;

        const mainCard = getMainCard();
        if (!mainCard) return;

        if (mainCard.closest('.screen-grid')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'screen-wrapper';

        const grid = document.createElement('div');
        grid.className = 'screen-grid';

        const left = document.createElement('div');
        left.className = 'poem-content wing';
        left.setAttribute('aria-hidden', 'true');

        const right = document.createElement('div');
        right.className = 'poem-content wing';
        right.setAttribute('aria-hidden', 'true');

        const parent = mainCard.parentElement;
        const nextSibling = mainCard.nextSibling;

        grid.appendChild(left);
        grid.appendChild(mainCard);
        grid.appendChild(right);
        wrapper.appendChild(grid);

        parent.insertBefore(wrapper, nextSibling);
    }

    function renderPoem(index) {
        if (poems.length === 0) return;
        const poem = poems[index];
        const mainCard = getMainCard();
        if (!mainCard) return;
        const textContainer = mainCard.querySelector('#poem-text-container');
        const bodyDiv = mainCard.querySelector('#poem-body');
        if (!textContainer || !bodyDiv) return;

        // 3D 翻页淡出动画
        textContainer.classList.remove('page-flip-in');
        textContainer.classList.add('page-flip-out');

        setTimeout(() => {
            // 处理标题（如果标题里有通韵标注则移除，备注通过弹窗显示）
            let displayTitle = poem.title;
            const tongYunRegex = /[\(（]通韵[\)）]/;
            if (tongYunRegex.test(displayTitle)) {
                displayTitle = displayTitle.replace(tongYunRegex, "");
            }

            const titleEl = mainCard.querySelector('#poem-title');
            if (titleEl) titleEl.innerText = displayTitle;

            // 渲染正文（不渲染备注，备注通过弹窗单独显示）
            bodyDiv.innerHTML = '';
            poem.content.forEach(line => {
                const p = document.createElement('p');
                p.innerText = line;
                bodyDiv.appendChild(p);
            });

            // 检测是否有备注，高亮注释按钮
            const noteBtn = document.getElementById('note-btn');
            const hasNotes = poem.notes && poem.notes.length > 0;

            if (noteBtn) {
                if (hasNotes) {
                    noteBtn.classList.add('has-notes');
                } else {
                    noteBtn.classList.remove('has-notes');
                }
            }

            // 理工浪漫标签显示逻辑
            const techRomanceTag = mainCard.querySelector('#tech-romance-tag');
            if (techRomanceTag) {
                techRomanceTag.style.display = 'block';
                const tagText = poem.techRomance ? '专属理工极致浪漫' : '专属斯人心灵浪漫';
                techRomanceTag.innerHTML = tagText;
            }

            // 五星装饰显示逻辑 ("逆风"红星，"灵犀"蓝星，其他默认灰星)
            const fiveStars = mainCard.querySelector('.five-stars-row');
            if (fiveStars) {
                fiveStars.classList.add('show-stars'); // 默认始终显示
                if (poem.title.includes('逆风')) {
                    fiveStars.style.color = '#DE2910'; // China Red
                } else if (poem.title.includes('灵犀')) {
                    fiveStars.style.color = '#1E90FF'; // Dodger Blue
                } else {
                    fiveStars.style.color = '#CCCCCC'; // Default Gray
                }
            }

            // 智能注释提醒逻辑已移除


            // 3D 翻页淡入动画
            textContainer.classList.remove('page-flip-out');
            textContainer.classList.add('page-flip-in');

            lockMobileCardHeight();
            wingRandomizeOnNextSync = true;
            syncWingCards();
        }, 400);
    }

    function nextPoem() {
        currentIndex = (currentIndex + 1) % poems.length;
        renderPoem(currentIndex);
    }

    function prevPoem() {
        // 逻辑：(当前索引 - 1 + 总长度) % 总长度，确保处理负数
        currentIndex = (currentIndex - 1 + poems.length) % poems.length;
        renderPoem(currentIndex);
    }

    // 切换横竖排版
    function toggleMode() {
        const card = getMainCard();
        if (!card) return;
        const btn = document.getElementById('mode-btn');
        const tocBtn = document.getElementById('toc-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const musicLabel = document.querySelector('.music-label');
        const themeBtn = document.getElementById('theme-btn');
        const playmodeBtn = document.getElementById('playmode-btn');
        const bgBtn = document.getElementById('bg-btn');
        const viewModeBtn = document.getElementById('viewmode-btn');
        const headerEl = document.querySelector('header');
        const footerEl = document.querySelector('.site-footer');

        // 切换 class
        card.classList.toggle('horizontal-mode');

        // 联动颜色切换：所有按钮一起变色
        btn.classList.toggle('blue-mode');
        tocBtn.classList.toggle('blue-mode');
        prevBtn.classList.toggle('blue-mode');
        nextBtn.classList.toggle('blue-mode');
        if (musicLabel) musicLabel.classList.toggle('blue-mode');
        if (themeBtn) themeBtn.classList.toggle('blue-mode');
        if (playmodeBtn) playmodeBtn.classList.toggle('blue-mode');
        if (bgBtn) bgBtn.classList.toggle('blue-mode');
        if (viewModeBtn) viewModeBtn.classList.toggle('blue-mode');

        // 新增：遗漏的按钮颜色切换
        const voiceBtn = document.getElementById('voice-btn');
        const noteBtn = document.getElementById('note-btn');
        const musicControl = document.getElementById('music-control');
        const sealBtn = document.getElementById('seal-btn');
        const viewModeGroup = document.getElementById('viewmode-branch-group');
        const entertainmentGroup = document.getElementById('entertainment-branch-group');
        const entertainmentBtn = document.getElementById('entertainment-btn');

        if (voiceBtn) voiceBtn.classList.toggle('blue-mode');
        if (noteBtn) noteBtn.classList.toggle('blue-mode');
        if (musicControl) musicControl.classList.toggle('blue-mode');
        if (sealBtn) sealBtn.classList.toggle('blue-mode');
        if (viewModeGroup) viewModeGroup.classList.toggle('blue-mode');
        if (entertainmentGroup) entertainmentGroup.classList.toggle('blue-mode');
        if (entertainmentBtn) entertainmentBtn.classList.toggle('blue-mode');

        // 联动宽度：header/footer 与诗词卡片对齐
        if (headerEl) headerEl.classList.toggle('horizontal-width');
        if (footerEl) footerEl.classList.toggle('horizontal-width');

        // 修改按钮文字（显示当前状态）
        if (card.classList.contains('horizontal-mode')) {
            btn.innerHTML = "横排<br>观赏"; // 当前是横排
        } else {
            btn.innerHTML = "竖排<br>观赏"; // 当前是竖排
        }

        lockMobileCardHeight();
        syncWingCards();
    }

    // 三卡/单卡展示切换
    let viewMode = localStorage.getItem('viewMode') || 'triple';

    function applyViewMode(mode) {
        const btn = document.getElementById('viewmode-btn');
        const viewModeGroup = document.getElementById('viewmode-branch-group');
        const viewModeWrapper = document.querySelector('.viewmode-btn-wrapper');
        const isSingle = mode === 'single';

        if (!isDesktopLayout()) {
            document.body.classList.remove('view-mode-single');
            if (btn) btn.style.display = 'none';
            if (viewModeGroup) viewModeGroup.style.display = 'none';
            if (viewModeWrapper) viewModeWrapper.style.display = 'none';
            return;
        }

        if (btn) btn.style.display = '';
        if (viewModeGroup) viewModeGroup.style.display = '';
        if (viewModeWrapper) viewModeWrapper.style.display = '';
        initThreeCardLayout();
        document.body.classList.toggle('view-mode-single', isSingle);

        if (btn) {
            btn.innerHTML = isSingle ? '单卡<br>展示' : '三卡<br>展示';
        }

        localStorage.setItem('viewMode', mode);
        syncWingCards();
    }

    function toggleViewMode() {
        viewMode = viewMode === 'triple' ? 'single' : 'triple';
        applyViewMode(viewMode);
        if (viewMode === 'triple') {
            openViewModeMenu();
        } else {
            closeViewModeMenu();
        }
    }

    // 随机/同步展示切换（保留兼容）
    function toggleVoice() {
        const nextMode = wingDisplayMode === 'random' ? 'sync' : 'random';
        setWingDisplayMode(nextMode);
    }

    // 音乐控制逻辑
    function initMusic() {
        const musicCtrl = document.getElementById('music-control');
        const audio = document.getElementById('bg-music');
        if (!musicCtrl || !audio) return;
        const playlistItems = document.querySelectorAll('.music-list li');
        let isPlaying = false;

        // 默认加载第一首
        if (playlistItems.length > 0) {
            audio.src = playlistItems[0].dataset.src;
        }

        // 播放/暂停 切换函数
        const togglePlay = () => {
            if (audio.paused) {
                audio.play().then(() => {
                    musicCtrl.classList.add('music-playing');
                    isPlaying = true;
                }).catch(e => console.log("播放被拦截:", e));
            } else {
                audio.pause();
                musicCtrl.classList.remove('music-playing');
                isPlaying = false;
            }
        };

        // 图标点击事件：播放/暂停
        musicCtrl.addEventListener('click', togglePlay);

        // 歌单点击切歌事件
        playlistItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();

                const newSrc = item.dataset.src;
                // 切换高亮
                playlistItems.forEach(li => li.classList.remove('active'));
                item.classList.add('active');

                // 关闭歌单列表
                const musicList = item.closest('.music-list');
                if (musicList) {
                    musicList.classList.add('force-hide');
                    musicList.addEventListener('mouseleave', function handler() {
                        musicList.classList.remove('force-hide');
                        musicList.removeEventListener('mouseleave', handler);
                    });
                }

                // 切歌并播放
                if (audio.getAttribute('src') !== newSrc) {
                    audio.src = newSrc;
                    audio.play().then(() => {
                        musicCtrl.classList.add('music-playing');
                        isPlaying = true;
                    }).catch(e => { });
                } else {
                    togglePlay();
                }
            });
        });
    }

    // ===== 云笺模式切换（下拉列表） =====
    function selectTheme(mode) {
        const card = getMainCard();
        if (!card) return;
        const list = document.getElementById('theme-list');

        if (mode === 'default') {
            // 宣纸模式：移除特殊类
            card.classList.remove('yunjian-mode', 'mask-mode');
            card.style.removeProperty('--yunjian-bg');
            localStorage.setItem('noteMode', 'default');
        } else if (mode === 'mask') {
            // 遮光罩模式：玻璃磨砂效果
            card.classList.remove('yunjian-mode');
            card.classList.add('mask-mode');
            card.style.removeProperty('--yunjian-bg');
            localStorage.setItem('noteMode', 'mask');
        } else {
            // 花笺模式：添加云笺类并设置对应背景图
            card.classList.remove('mask-mode');
            card.classList.add('yunjian-mode');
            // card06 使用 webp 格式，其他使用 jpg
            const ext = mode === 'card06' ? 'webp' : 'jpg';
            card.style.setProperty('--yunjian-bg', `url('../assets/${mode}.${ext}')`);
            localStorage.setItem('noteMode', mode);
        }

        // 更新列表激活状态
        if (list) {
            list.querySelectorAll('li').forEach(li => {
                li.classList.remove('active');
                if (li.dataset.value === mode) li.classList.add('active');
            });
        }

        syncWingCards();
    }

    // 初始化云笺模式交互
    function initTheme() {
        const savedMode = localStorage.getItem('noteMode') || 'default';
        selectTheme(savedMode);

        // 绑定下拉列表事件
        const btn = document.getElementById('theme-btn');
        const list = document.getElementById('theme-list');

        if (btn && list) {
            // 点击按钮显示/隐藏列表
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // 动态定位
                const rect = btn.getBoundingClientRect();
                list.style.top = (rect.bottom + 5) + 'px';
                list.style.left = rect.left + 'px';
                list.classList.toggle('show');
            });

            // 点击列表项
            list.querySelectorAll('li').forEach(item => {
                item.addEventListener('click', (e) => {
                    const mode = e.target.dataset.value;
                    selectTheme(mode);
                    list.classList.remove('show');
                });
            });

            // 点击外部关闭
            document.addEventListener('click', (e) => {
                if (!btn.contains(e.target) && !list.contains(e.target)) {
                    list.classList.remove('show');
                }
            });
        }
    }

    // ===== 音乐播放模式 =====
    let playMode = 'loop'; // 'loop' = 单曲循环, 'shuffle' = 随机播放

    function togglePlayMode() {
        const btn = document.getElementById('playmode-btn');
        const audio = document.getElementById('bg-music');

        if (playMode === 'loop') {
            playMode = 'shuffle';
            audio.loop = false;
            btn.innerHTML = '随机<br>播放';
            btn.classList.remove('active-mode');
        } else {
            playMode = 'loop';
            audio.loop = true;
            btn.innerHTML = '单曲<br>循环';
            btn.classList.add('active-mode');
        }
        localStorage.setItem('playMode', playMode);
    }

    // 初始化播放模式
    function initPlayMode() {
        // 默认随机播放，除非用户手动选择了歌曲
        const savedMode = localStorage.getItem('playMode') || 'shuffle';
        const btn = document.getElementById('playmode-btn');
        const audio = document.getElementById('bg-music');

        playMode = savedMode;
        if (playMode === 'shuffle') {
            audio.loop = false;
            btn.innerHTML = '随机<br>播放';
            btn.classList.remove('active-mode');
        } else {
            audio.loop = true;
            btn.innerHTML = '单曲<br>循环';
            btn.classList.add('active-mode');
        }

        // 监听播放结束事件（用于随机播放）
        audio.addEventListener('ended', () => {
            if (playMode === 'shuffle') {
                playRandomSong();
            }
        });
    }

    // 随机播放下一首
    function playRandomSong() {
        const playlistItems = document.querySelectorAll('.music-list li');
        const audio = document.getElementById('bg-music');
        const musicCtrl = document.getElementById('music-control');

        // 获取当前播放的索引
        let currentIdx = -1;
        playlistItems.forEach((item, idx) => {
            if (item.classList.contains('active')) currentIdx = idx;
        });

        // 随机选择一个不同的索引
        let newIdx;
        do {
            newIdx = Math.floor(Math.random() * playlistItems.length);
        } while (newIdx === currentIdx && playlistItems.length > 1);

        // 切换高亮和播放
        playlistItems.forEach(li => li.classList.remove('active'));
        playlistItems[newIdx].classList.add('active');
        audio.src = playlistItems[newIdx].dataset.src;
        audio.play().then(() => {
            musicCtrl.classList.add('music-playing');
        }).catch(e => { });
    }

    // 初始化 (直接调用，不再嵌套 DOMContentLoaded)
    // loadPoems(); -> 已移动到 DOMContentLoaded

    // 初始化主题
    initTheme();

    // 初始化三卡/单卡展示状态
    applyViewMode(viewMode);

    // 初始化音乐（先设置音频源）
    initMusic();

    // 初始化播放模式（后设置loop属性）
    initPlayMode();

    // ===== 印章特效控制 =====
    function initSealEffect() {
        // 默认开启 ('true' or null -> true)
        const isEnabled = localStorage.getItem('sealEffectEnabled') !== 'false';
        updateSealBtnState(isEnabled);
    }

    function toggleSealEffect() {
        const isEnabled = localStorage.getItem('sealEffectEnabled') !== 'false';
        const newState = !isEnabled;
        localStorage.setItem('sealEffectEnabled', newState);
        updateSealBtnState(newState);

        // 如果关闭了特效，立即重置大印章状态（如果正在显示）
        if (!newState) {
            const container = getMainCard();
            if (container) {
                container.classList.remove('seal-preparing', 'seal-landing');
            }
        }

        syncWingCards();
    }

    function updateSealBtnState(isEnabled) {
        const btn = document.getElementById('seal-btn');
        if (btn) {
            if (isEnabled) {
                btn.classList.add('active');
                btn.innerHTML = '印章<br>特效'; // 开启状态
                btn.style.fontWeight = 'bold';
                btn.style.removeProperty('color'); // 移除行内样式，让CSS类控制颜色(红/蓝)
            } else {
                btn.classList.remove('active');
                btn.innerHTML = '特效<br>关闭'; // 关闭状态
                btn.style.color = '#999'; // 关闭状态保持灰色
                btn.style.fontWeight = 'normal';
            }
        }
    }

    // 初始化印章特效设置
    initSealEffect();

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        // 如果焦点在输入框则不处理
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case 'ArrowLeft':
                prevPoem();
                break;
            case 'ArrowRight':
                nextPoem();
                break;
            case ' ':
                // 空格：播放/暂停音乐
                e.preventDefault();
                const audio = document.getElementById('bg-music');
                const musicCtrl = document.getElementById('music-control');
                if (audio && musicCtrl) {
                    if (audio.paused) {
                        audio.play().then(() => {
                            musicCtrl.classList.add('music-playing');
                        }).catch(() => { });
                    } else {
                        audio.pause();
                        musicCtrl.classList.remove('music-playing');
                    }
                }
                break;
        }
    });

    // 触摸滑动切换诗词（移动端）
    let touchStartX = 0;
    let touchEndX = 0;
    const poemCard = document.getElementById('poem-card');

    if (poemCard) {
        poemCard.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        poemCard.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;

            // 滑动距离超过50px才触发
            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    // 左滑：下一首
                    nextPoem();
                } else {
                    // 右滑：上一首
                    prevPoem();
                }
            }
        }, { passive: true });
    }

    // ===== 秘密功能：点击标题5次查看访客统计 =====
    // 动态加载不蒜子统计
    function loadBusuanzi() {
        if (!document.getElementById('busuanzi-script')) {
            const script = document.createElement('script');
            script.id = 'busuanzi-script';
            script.async = true;
            script.src = '//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
            document.body.appendChild(script);
        }
    }

    // 普通访客：自动加载统计
    // 管理员：不自动加载（避免刷PV），仅在手动查看时加载
    const isAdmin = localStorage.getItem('qilv_admin');
    if (!isAdmin) {
        loadBusuanzi();
    }

    const title = document.querySelector('.site-title');
    // 仅桌面端启用秘密入口（宽度>768px），移动端不可用以降低被发现风险
    const isDesktop = window.innerWidth > 768;
    if (title && isDesktop) {
        let clickCount = 0;
        let lastClickTime = 0;

        title.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();

            // 如果两次点击间隔超过1秒，重置计数
            if (currentTime - lastClickTime > 1000) {
                clickCount = 0;
            }

            clickCount++;
            lastClickTime = currentTime;

            // 连续点击7次触发
            if (clickCount === 7) {
                clickCount = 0; // 重置

                // 标记为管理员
                localStorage.setItem('qilv_admin', 'true');

                // 强制加载脚本以获取数据（如果未加载）
                loadBusuanzi();

                // 获取不蒜子统计数据
                const uvSpan = document.getElementById('busuanzi_value_site_uv');
                const pvSpan = document.getElementById('busuanzi_value_site_pv');

                // 简单的轮询等待数据加载
                setTimeout(() => {
                    const uv = (uvSpan && uvSpan.innerText) ? uvSpan.innerText : '统计中...';
                    const pv = (pvSpan && pvSpan.innerText) ? pvSpan.innerText : '统计中...';

                    alert(`㊙️ 秘密数据 (管理员模式已激活)\n\n👤 总访客数 (UV): ${uv}\n👁️ 总访问量 (PV): ${pv}\n\n⚠️ 注：您的访问今后将不再计入统计。`);
                }, 500); // 延迟500ms等待脚本初始化
            }
        });

        // 鼠标手型提示
        title.style.cursor = 'pointer';
        title.style.userSelect = 'none';
    }

    // ===== 暴露函数到全局作用域，供 HTML onclick 使用 =====
    window.toggleTOC = toggleTOC;
    window.toggleNotes = toggleNotes;
    window.toggleCharGame = toggleCharGame;
    window.charGameRetry = () => {
        hideCharGameDialog();
        startCharGame();
    };
    window.charGameExit = () => {
        hideCharGameDialog();
        toggleCharGame(false);
    };
    window.toggleMode = toggleMode;
    window.toggleVoice = toggleVoice;
    window.toggleViewMode = toggleViewMode;
    window.toggleEntertainmentMenu = toggleEntertainmentMenu;
    window.togglePlayMode = togglePlayMode;
    window.toggleSealEffect = toggleSealEffect;
    window.prevPoem = prevPoem;
    window.nextPoem = nextPoem;
    window.toggleUpdateNotice = toggleUpdateNotice;
    window.toggleModificationNotice = toggleModificationNotice;
});

// ===== 按钮折叠菜单（全平台生效） =====
let menuCollapsed = true;
let collapseTimer = null;

// 初始化折叠菜单
function initCollapseMenu() {
    const wrapper = document.querySelector('.music-wrapper');
    const settingsBtn = document.getElementById('settings-btn');

    if (!wrapper || !settingsBtn) return;

    // 默认折叠状态
    wrapper.classList.add('collapsed');

    // 为整个容器添加鼠标交互监听（针对桌面端犹豫操作）
    // 鼠标移入：清除倒计时，保持展开
    wrapper.addEventListener('mouseenter', () => {
        if (!menuCollapsed) {
            clearTimeout(collapseTimer);
        }
    });

    // 鼠标移出：重新开始5秒倒计时
    wrapper.addEventListener('mouseleave', () => {
        if (!menuCollapsed) {
            resetCollapseTimer();
        }
    });

    // 所有子按钮和下拉列表交互后重置计时器（针对移动端及点击操作）
    wrapper.querySelectorAll('.widget-btn, #mode-btn, .music-control, #theme-list, #music-list, #bg-list, #theme-list li, #music-list li, #bg-list li, #viewmode-branch-group, #viewmode-branch-group .branch-btn, #entertainment-branch-group, #entertainment-branch-group .branch-btn').forEach(el => {
        el.addEventListener('click', resetCollapseTimer);
        // 触屏设备的长按/滑动也重置计时器
        el.addEventListener('touchstart', resetCollapseTimer);
    });
}

// 切换展开/折叠
function toggleSettingsMenu() {
    const wrapper = document.querySelector('.music-wrapper');
    const settingsBtn = document.getElementById('settings-btn');

    menuCollapsed = !menuCollapsed;

    if (menuCollapsed) {
        wrapper.classList.remove('expanded');
        wrapper.classList.add('collapsed');
        // 展开过一次后，设置按钮变为白底红字
        settingsBtn.classList.add('settings-used');
        clearTimeout(collapseTimer);
        // 播放收回音效（短促版本）
        playCollapseSound();
    } else {
        wrapper.classList.remove('collapsed');
        wrapper.classList.add('expanded');
        // 播放发牌音效（仅前800ms）
        playShuffleSound();
        resetCollapseTimer();
    }
}

// 预加载发牌音效（全局共享，解决移动端限制）
let shuffleAudio = null;
let shuffleTimeout = null;

function getShuffleAudio() {
    if (!shuffleAudio) {
        shuffleAudio = new Audio('assets/the-shuffling-of-a-deck-of-playing-cards.mp3');
        shuffleAudio.volume = 0.5;
    }
    return shuffleAudio;
}

// 发牌音效（仅播放前800ms）
function playShuffleSound() {
    // 移动端/平板禁用音效，避免抢占背景音乐焦点
    if (window.innerWidth <= 1024) return;

    const audio = getShuffleAudio();
    clearTimeout(shuffleTimeout);
    audio.currentTime = 0;
    audio.play().catch(() => { });
    shuffleTimeout = setTimeout(() => {
        audio.pause();
    }, 800);
}

// 收回音效（复用同一音频，播放600ms）
function playCollapseSound() {
    // 移动端/平板禁用音效，避免抢占背景音乐焦点
    if (window.innerWidth <= 1024) return;

    const audio = getShuffleAudio();
    clearTimeout(shuffleTimeout);
    audio.currentTime = 0;
    audio.play().catch(() => { });
    shuffleTimeout = setTimeout(() => {
        audio.pause();
    }, 600);
}

// 10秒无操作自动收起（延长以减少打断感）
function resetCollapseTimer() {
    clearTimeout(collapseTimer);
    if (!menuCollapsed) {
        collapseTimer = setTimeout(() => {
            const wrapper = document.querySelector('.music-wrapper');
            const settingsBtn = document.getElementById('settings-btn');
            const overlayActive = document.querySelector('.toc-overlay.active, #char-game-overlay.active');

            if (overlayActive) {
                resetCollapseTimer();
                return;
            }
            // 双重检查：如果鼠标此时还在 wrapper 内（防止边缘case），则不收起 (仅限桌面端)
            if (window.matchMedia('(hover: hover)').matches && wrapper.matches(':hover')) {
                return;
            }

            menuCollapsed = true;
            wrapper.classList.remove('expanded');
            wrapper.classList.add('collapsed');
            // 自动收起后，设置按钮变为白底红字
            if (settingsBtn) settingsBtn.classList.add('settings-used');
            // 播放收回音效
            playCollapseSound();
        }, 10000); // 10秒
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initCollapseMenu();
    // 强制隐藏公告小喇叭 (Fix: 确保缓存更新前也能隐藏)
    const notice = document.getElementById('announcement-notice');
    if (notice) notice.style.display = 'none';
});

// 窗口大小变化时重新初始化
window.addEventListener('resize', () => {
    const wrapper = document.querySelector('.music-wrapper');
    // 如果没有任何状态类，重新初始化（防止resize导致状态丢失）
    if (wrapper && !wrapper.classList.contains('collapsed') && !wrapper.classList.contains('expanded')) {
        initCollapseMenu();
    }
});
