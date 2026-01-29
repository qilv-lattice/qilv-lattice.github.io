let poems = [];
let currentIndex = 0;
let wingDisplayMode = localStorage.getItem('wingDisplayMode') || 'sync';
let viewMode = localStorage.getItem('viewMode') || 'triple';
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

const bgCatalog = {
    macro: [
        { title: '千里江山', index: 0 },
        { title: '残阳如血', index: 2 },
        { title: '妩媚青山', index: 3 },
        { title: '梅花山水', index: 4 },
        { title: '珠峰银月', index: 7 },
        { title: '星空垂野', index: 9 },
        { title: '光影森林', index: 10 },
        { title: '峰青雪白', index: 12 },
        { title: '蓝色冰湖', index: 14 },
        { title: '浪漫星空', index: 16 }
    ],
    micro: [
        { title: '蓝星一角', index: 6 },
        { title: '五彩斑斓', index: 8 }
    ],
    human: [
        { title: '观音大士', index: 1 },
        { title: '庄生蝴蝶', index: 5 },
        { title: '荷花探戈', index: 11 },
        { title: '风吹蔷薇', index: 13 },
        { title: '中国航母', index: 15 }
    ]
};

let currentBgFilter = 'macro';

function isTouchDevice() {
    return ('ontouchstart' in window) ||
        (navigator.maxTouchPoints || 0) > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function isDesktopLayout() {
    return window.matchMedia &&
        window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches;
}

function swapMobileEntertainmentAndModeButtons() {
    if (window.innerWidth > 1023) return;
    const wrapper = document.querySelector('.music-wrapper');
    const entertainment = wrapper ? wrapper.querySelector('.entertainment-btn-wrapper') : null;
    const modeBtn = document.getElementById('mode-btn');
    if (!wrapper || !entertainment || !modeBtn) return;
    if (wrapper.dataset.mobileSwap === 'true') return;

    const modeNext = modeBtn.nextSibling;
    const entNext = entertainment.nextSibling;

    if (entNext === modeBtn) {
        wrapper.insertBefore(modeBtn, entertainment);
    } else {
        wrapper.insertBefore(modeBtn, entertainment);
        wrapper.insertBefore(entertainment, modeNext);
    }
    wrapper.dataset.mobileSwap = 'true';
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
    updateBgMenuActive();
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

function setActiveBgTab(filter) {
    const tabs = document.querySelectorAll('.bg-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });
}

function renderBgMenu(filter = currentBgFilter) {
    const list = document.getElementById('bg-list');
    if (!list) return;
    list.innerHTML = '';
    const items = bgCatalog[filter] || [];
    if (!items.length) {
        const li = document.createElement('li');
        li.innerText = '暂无背景';
        list.appendChild(li);
        return;
    }
    items.forEach(item => {
        const li = document.createElement('li');
        li.innerText = item.title;
        li.dataset.index = String(item.index);
        if (item.index === bgIndex) li.classList.add('active');
        list.appendChild(li);
    });
}

function updateBgMenuActive() {
    const list = document.getElementById('bg-list');
    if (!list) return;
    list.querySelectorAll('li[data-index]').forEach(li => {
        li.classList.toggle('active', Number(li.dataset.index) === bgIndex);
    });
}

function toggleBgMenu() {
    const menu = document.getElementById('bg-menu');
    if (!menu) return;
    if (menu.classList.contains('show')) {
        menu.classList.remove('show');
    } else {
        menu.classList.add('show');
        setActiveBgTab(currentBgFilter);
        renderBgMenu(currentBgFilter);
    }
}

function initBgMenu() {
    const btn = document.getElementById('bg-btn');
    const menu = document.getElementById('bg-menu');
    const list = document.getElementById('bg-list');
    if (!btn || !menu || !list) return;

    if (btn.dataset.bound !== 'true') {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBgMenu();
        });
    }

    const tabs = document.querySelectorAll('.bg-tab');
    tabs.forEach(tab => {
        if (tab.dataset.bound === 'true') return;
        tab.dataset.bound = 'true';
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            currentBgFilter = tab.dataset.filter || 'macro';
            setActiveBgTab(currentBgFilter);
            renderBgMenu(currentBgFilter);
        });
    });

    if (list.dataset.bound !== 'true') {
        list.dataset.bound = 'true';
        list.addEventListener('click', (e) => {
            const item = e.target.closest('li[data-index]');
            if (!item) return;
            const index = parseInt(item.dataset.index, 10);
            selectBackground(index);
            updateBgMenuActive();
            menu.classList.remove('show');
        });
    }

    if (menu.dataset.outsideBound !== 'true') {
        menu.dataset.outsideBound = 'true';
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.remove('show');
            }
        });
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
    updateBgMenuActive();
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const applyDeviceClasses = () => {
            document.body.classList.toggle('is-touch', isTouchDevice());
        };

        applyDeviceClasses();
        document.querySelectorAll('.snowflake').forEach(node => node.remove());
        swapMobileEntertainmentAndModeButtons();
        initThreeCardLayout();
        updateWingDisplayButton();
        initViewModeMenu();
        initEntertainmentMenu();
        initMusicCatalog();

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

    initBgMenu();

    // ===== 音乐名录（作品名录风格） =====
    const musicCatalog = {
        guqin: [
            { title: '阳关三叠', src: 'assets/music01-阳关三叠.mp3' },
            { title: '高山流水', src: 'assets/music11-高山流水.mp3' },
            { title: '半山听雨', src: 'assets/music10-半山听雨.mp3' }
        ],
        guzheng: [
            { title: '梁祝', src: 'assets/music02-梁祝.mp3' },
            { title: '琵琶语', src: 'assets/music03-琵琶语.mp3' },
            { title: '渔歌唱晚', src: 'assets/music04-渔歌唱晚.mp3' },
            { title: '神话', src: 'assets/music07-神话.mp3' },
            { title: '青城山下白素贞', src: 'assets/music09-青城山下白素贞.mp3' },
            { title: '烟雨唱扬州', src: 'assets/music12-烟雨唱扬州.mp3' }
        ],
        piano: [
            { title: '致艾丽丝', src: 'assets/music05-致艾丽丝.mp3' },
            { title: '悲怆奏鸣曲', src: 'assets/music06-悲怆奏鸣曲.mp3' },
            { title: '克罗地亚狂想曲', src: 'assets/music08-克罗地亚狂想曲.mp3' }
        ],
        song: []
    };

    let currentMusicFilter = 'guqin';

    function setActiveMusicTab(filter) {
        const tabs = document.querySelectorAll('.music-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === filter);
        });
    }

    function renderMusicCatalog(filter = currentMusicFilter) {
        const list = document.getElementById('music-catalog-list');
        if (!list) return;
        list.innerHTML = '';
        const items = musicCatalog[filter] || [];
        if (!items.length) {
            const li = document.createElement('li');
            li.innerText = '暂无曲目';
            list.appendChild(li);
            return;
        }
        items.forEach(item => {
            const li = document.createElement('li');
            li.innerText = item.title;
            li.dataset.src = item.src;
            list.appendChild(li);
        });
    }

    function playMusicBySrc(src) {
        const audio = document.getElementById('bg-music');
        const musicCtrl = document.getElementById('music-control');
        if (!audio || !src) return;
        if (audio.getAttribute('src') !== src) {
            audio.src = src;
        }
        audio.play().then(() => {
            if (musicCtrl) musicCtrl.classList.add('music-playing');
        }).catch(() => { });

        const playlistItems = document.querySelectorAll('.music-list li');
        playlistItems.forEach(li => {
            li.classList.toggle('active', li.dataset.src === src);
        });
    }

    function bindMusicTabs() {
        const tabs = document.querySelectorAll('.music-tab');
        tabs.forEach(tab => {
            if (tab.dataset.bound === 'true') return;
            tab.dataset.bound = 'true';
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                currentMusicFilter = tab.dataset.filter || 'guqin';
                setActiveMusicTab(currentMusicFilter);
                renderMusicCatalog(currentMusicFilter);
            });
        });
    }

    function bindMusicCatalogList() {
        const list = document.getElementById('music-catalog-list');
        if (!list || list.dataset.bound === 'true') return;
        list.dataset.bound = 'true';
        list.addEventListener('click', (e) => {
            const item = e.target.closest('li[data-src]');
            if (!item) return;
            e.stopPropagation();
            playMusicBySrc(item.dataset.src);
            list.querySelectorAll('li').forEach(li => li.classList.remove('active'));
            item.classList.add('active');
            closeMusicMenu();
        });
    }

    function toggleMusicMenu() {
        const menu = document.getElementById('music-menu');
        if (!menu) return;
        if (menu.classList.contains('show')) {
            closeMusicMenu();
        } else {
            openMusicMenu();
        }
    }
    window.toggleMusicMenu = toggleMusicMenu;

    function openMusicMenu() {
        const menu = document.getElementById('music-menu');
        if (!menu) return;
        menu.classList.add('show');
        setActiveMusicTab(currentMusicFilter);
        renderMusicCatalog(currentMusicFilter);
    }

    function closeMusicMenu() {
        const menu = document.getElementById('music-menu');
        if (!menu) return;
        menu.classList.remove('show');
    }

    function initMusicCatalog() {
        bindMusicTabs();
        bindMusicCatalogList();
        const musicControl = document.getElementById('music-control');
        const menu = document.getElementById('music-menu');
        if (musicControl && musicControl.dataset.menuBound !== 'true') {
            musicControl.dataset.menuBound = 'true';
            musicControl.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMusicMenu();
            });
        }
        if (menu && menu.dataset.outsideBound !== 'true') {
            menu.dataset.outsideBound = 'true';
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && (!musicControl || !musicControl.contains(e.target))) {
                    closeMusicMenu();
                }
            });
        }
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

    function formatPoemTitleForList(value) {
        const raw = String(value || '').trim();
        let title = raw.replace(/[《》]/g, '').replace(/\s+/g, '');
        if (/^七律[·•・\.]/.test(title)) {
            title = title.replace(/^七律[·•・\.]/, '七律•');
        }
        return title || raw;
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

    function normalizeModifiedWorks(list) {
        if (!Array.isArray(list)) return [];
        return list.map(item => {
            if (typeof item === 'string') {
                return { title: item, modifiedAt: updateInfo.date || '' };
            }
            if (item && typeof item === 'object') {
                return {
                    title: item.title || '',
                    modifiedAt: item.modifiedAt || item.receivedAt || item.date || ''
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

    function findModifiedWorkEntry(poemTitle, entries) {
        const cleanTitle = normalizeTitleText(poemTitle);
        return entries.find(entry => cleanTitle.includes(normalizeTitleText(entry.title)));
    }

    const MODIFIED_TIME_STORE_KEY = 'qilv_modified_first_times';

    function loadModifiedTimeStore() {
        try {
            const raw = localStorage.getItem(MODIFIED_TIME_STORE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveModifiedTimeStore(store) {
        try {
            localStorage.setItem(MODIFIED_TIME_STORE_KEY, JSON.stringify(store));
        } catch (e) {
            // ignore storage errors
        }
    }

    function applyStickyModifiedTimes(entries) {
        if (!entries.length) return entries;
        const store = loadModifiedTimeStore();
        const nowMs = Date.now();
        let changed = false;

        const result = entries.map(entry => {
            const key = normalizeTitleText(entry.title);
            const entryMs = parseBeijingDateTimeToUtcMs(entry.modifiedAt || updateInfo.date);
            const storedMs = key ? store[key] : null;
            let effectiveMs = entryMs;

            if (storedMs && (nowMs - storedMs) <= 24 * 60 * 60 * 1000) {
                if (!effectiveMs || effectiveMs > storedMs) {
                    effectiveMs = storedMs;
                }
            }

            if (effectiveMs && (!storedMs || (nowMs - storedMs) > 24 * 60 * 60 * 1000 || effectiveMs < storedMs)) {
                store[key] = effectiveMs;
                changed = true;
            }

            return { ...entry, effectiveAt: effectiveMs };
        });

        if (changed) saveModifiedTimeStore(store);
        return result;
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
        const modifiedEntries = applyStickyModifiedTimes(normalizeModifiedWorks(updateInfo.modifiedWorks));

        // 如果没有修改作品，或者不在更新时间窗口内，隐藏
        if (!modifiedEntries.length) {
            noticeEl.style.display = 'none';
            return;
        }

        // 使用统一的北京时间判断


        // 宽容模式：允许24小时内的缓冲期（即“今天”和“昨天”都算）
        const activeModified = modifiedEntries.filter(entry => isWithin24Hours(entry.effectiveAt || entry.modifiedAt || updateInfo.date));
        const isValid = activeModified.length > 0;

        if (isValid) {
            // noticeEl.style.display = 'flex'; // 隐藏喇叭
            // 直接显示修订数量
            const count = activeModified.length;
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
    wrapper.querySelectorAll('.widget-btn, #mode-btn, .music-control, #theme-menu, #theme-list, #music-list, #bg-menu, #bg-list, #theme-list li, #music-list li, #bg-list li, .bg-tab, #music-menu, #music-catalog-list, #music-catalog-list li, .music-tab, #entertainment-menu, #entertainment-menu-list, #entertainment-menu-list li, #viewmode-menu, #viewmode-list, #viewmode-list li').forEach(el => {
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

    // 节日彩蛋：2026年春节(1.29) 交互式烟花
    // 用户请求：关闭自动播放，改由小喇叭引导用户点击燃放 (解决音频限制)
});

// 窗口大小变化时重新初始化
window.addEventListener('resize', () => {
    const wrapper = document.querySelector('.music-wrapper');
    // 如果没有任何状态类，重新初始化（防止resize导致状态丢失）
    if (wrapper && !wrapper.classList.contains('collapsed') && !wrapper.classList.contains('expanded')) {
        initCollapseMenu();
    }
});
