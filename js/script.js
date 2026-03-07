// ===== 诗词加锁/解锁系统 =====
const UNLOCKED_POEMS_KEY = 'unlockedPoemsPersistent';
const LEGACY_UNLOCKED_POEMS_KEY = 'unlockedPoems';
const LEGACY_SESSION_UNLOCKED_POEMS_KEY = 'unlockedPoemsSession';
const GLOBAL_UNLOCK_KEY = 'lockedPoemsKeyV1';

function getUnlockToken(title) {
    const source = String(title || '');
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < source.length; i++) {
        const code = source.charCodeAt(i);
        h1 ^= code;
        h1 = Math.imul(h1, 16777619);
        h2 ^= (code + i) & 0xffff;
        h2 = Math.imul(h2, 2246822519);
    }
    const a = (h1 >>> 0).toString(16).padStart(8, '0');
    const b = (h2 >>> 0).toString(16).padStart(8, '0');
    return `u_${a}${b}`;
}

function getUnlockedMap() {
    try {
        return JSON.parse(localStorage.getItem(UNLOCKED_POEMS_KEY) || '{}');
    } catch { return {}; }
}

function migrateLegacyUnlockMap() {
    const map = getUnlockedMap();
    const keys = Object.keys(map);
    if (!keys.length) return;

    let changed = false;
    const nextMap = {};
    keys.forEach(key => {
        if (!map[key]) return;
        if (key.startsWith('u_')) {
            nextMap[key] = true;
            return;
        }
        nextMap[getUnlockToken(key)] = true;
        changed = true;
    });

    if (changed) {
        localStorage.setItem(UNLOCKED_POEMS_KEY, JSON.stringify(nextMap));
    }
}

function isPoemUnlocked(title) {
    const map = getUnlockedMap();
    const token = getUnlockToken(title);
    return !!map[token] || !!map[title];
}

// 仅 情感珍藏 系列诗词：在目录中整体隐藏（聚合显示）
function isLockedPoemHidden(poem) {
    return !!(poem && poem.locked && !isPoemUnlocked(poem.title) && poem.title && poem.title.includes('情感珍藏'));
}

// 所有加锁诗词：内容需要密码才能查看
function isContentLocked(poem) {
    return !!(poem && poem.locked && !isPoemUnlocked(poem.title));
}

function markPoemUnlocked(title) {
    const map = getUnlockedMap();
    map[getUnlockToken(title)] = true;
    localStorage.setItem(UNLOCKED_POEMS_KEY, JSON.stringify(map));
}

function bytesToBase64(bytes) {
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
}

function base64ToBytes(base64) {
    try {
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    } catch {
        return null;
    }
}

function storeGlobalUnlockKey(keyBytes) {
    localStorage.setItem(GLOBAL_UNLOCK_KEY, bytesToBase64(keyBytes));
}

function getGlobalUnlockKey() {
    const base64 = localStorage.getItem(GLOBAL_UNLOCK_KEY);
    if (!base64) return null;
    return base64ToBytes(base64);
}

function clearGlobalUnlockData() {
    localStorage.removeItem(GLOBAL_UNLOCK_KEY);
    localStorage.removeItem(UNLOCKED_POEMS_KEY);
}

function applyPoemContentFixes(poem) {
    if (!poem || !Array.isArray(poem.content)) return;
    const title = String(poem.title || '');
    if (title.includes('观世')) {
        poem.content = poem.content.map(line => {
            let fixed = line;
            if (fixed.includes('宇宙将军名现世')) {
                fixed = fixed.replace('宇宙将军名现世', '宇宙将军人现世');
            }
            if (fixed.includes('得车有赖秦王病')) {
                fixed = fixed.replace('得车有赖秦王病', '车多有赖秦王病');
            }
            return fixed;
        });
    }
}

// PBKDF2 密钥派生（安全）：25万次迭代 + 固定盐
const PBKDF2_SALT = new Uint8Array([113, 105, 108, 118, 45, 108, 97, 116, 116, 105, 99, 101, 45, 107, 100, 102]);
const PBKDF2_ITERATIONS = 250000;

async function derivePasswordKey(password) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: PBKDF2_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial, 256
    );
    return new Uint8Array(derived);
}

// Legacy SHA-256 派生（仅用于兼容现有加密数据，待全部诗词重新加密后移除）
async function derivePasswordKeyLegacy(password) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    return new Uint8Array(keyMaterial);
}

async function decryptPoemContentWithKey(encryptedBase64, keyBytes) {
    const raw = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const nonce = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted));
}

async function decryptPoemContent(encryptedBase64, password) {
    // 先尝试 legacy SHA-256（兼容现有加密数据），再尝试 PBKDF2（未来新数据）
    // 返回 { payload, keyBytes }，让调用方知道实际使用的密钥
    try {
        const legacyKey = await derivePasswordKeyLegacy(password);
        const payload = await decryptPoemContentWithKey(encryptedBase64, legacyKey);
        return { payload, keyBytes: legacyKey };
    } catch {
        const pbkdf2Key = await derivePasswordKey(password);
        const payload = await decryptPoemContentWithKey(encryptedBase64, pbkdf2Key);
        return { payload, keyBytes: pbkdf2Key };
    }
}

// 自动解密已解锁诗词：支持同浏览器持久免二次输入
async function autoDecryptPoems() {
    // 清理历史版本的解锁数据格式
    if (localStorage.getItem(LEGACY_UNLOCKED_POEMS_KEY)) {
        localStorage.removeItem(LEGACY_UNLOCKED_POEMS_KEY);
    }
    if (sessionStorage.getItem(LEGACY_SESSION_UNLOCKED_POEMS_KEY)) {
        sessionStorage.removeItem(LEGACY_SESSION_UNLOCKED_POEMS_KEY);
    }
    migrateLegacyUnlockMap();

    const keyBytes = getGlobalUnlockKey();
    if (!keyBytes) return;

    let successCount = 0;
    let failedCount = 0;
    for (const poem of poems) {
        if (!(poem.locked && poem.encryptedContent)) continue;
        try {
            // 先用存储的密钥尝试，若失败则尝试另一种派生方式
            let payload;
            try {
                payload = await decryptPoemContentWithKey(poem.encryptedContent, keyBytes);
            } catch {
                // 存储密钥失败，可能是混合加密（部分 legacy/部分 PBKDF2）
                // 此时无法自动解锁该诗词，标记跳过
                failedCount++;
                continue;
            }
            const originalTitle = poem.title;
            if (payload.realTitle) {
                poem.title = payload.realTitle;
                markPoemUnlocked(payload.realTitle);
            }
            markPoemUnlocked(originalTitle);
            poem.content = payload.content || payload;
            poem.notes = payload.notes || [];
            applyPoemContentFixes(poem);
            successCount++;
        } catch {
            failedCount++;
        }
    }

    // 若存储密钥已失效（如你更换了锁密码），自动清空并回退到手动输入
    // 但若部分成功部分失败（混合加密），保留密钥，仅失败的诗词需手动输入
    if (failedCount > 0 && successCount === 0) {
        clearGlobalUnlockData();
    }
}

let poems = [];
let currentIndex = 0;
let wingDisplayMode = localStorage.getItem('wingDisplayMode') || 'sync';
let viewMode = localStorage.getItem('viewMode') || 'triple';
let lastWingIndices = { left: null, right: null };
let lastFireworkAt = 0;
let fireworksState = null;
let wingRandomizeOnNextSync = true;
let autoFireworksReady = false;

// 全局关闭雪花特效
window.disableSnow = true;

// 背景图列表（将从 config.json 加载）
let backgrounds = [];

let bgIndex = 0; // 当前背景索引
const cacheBuster = Date.now(); // 时间戳破缓存
let bgMode = 'random'; // 背景模式：random（随机）或 fixed（固定）
let bgIntervalId = null; // 背景切换定时器ID
let fixedBgIndex = 0; // 固定模式下的背景索引
const BG_MODE_STORAGE_KEY = 'bgMode';
const BG_INDEX_STORAGE_KEY = 'bgIndex';

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
        { title: '浪漫星空', index: 16 },
        { title: '背景十八', index: 17 }
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

function updateBgButtonState() {
    const btn = document.getElementById('bg-btn');
    if (!btn) return;
    if (bgMode === 'fixed') {
        btn.innerHTML = '固定<br>背景';
        btn.classList.add('active-mode');
    } else {
        btn.innerHTML = '随机<br>背景';
        btn.classList.remove('active-mode');
    }
}

function persistBgState() {
    localStorage.setItem(BG_MODE_STORAGE_KEY, bgMode);
    localStorage.setItem(BG_INDEX_STORAGE_KEY, String(bgIndex));
}

function restartBgInterval() {
    if (bgIntervalId) {
        clearInterval(bgIntervalId);
        bgIntervalId = null;
    }
    if (bgMode === 'random') {
        bgIntervalId = setInterval(changeBackground, 2 * 60 * 1000);
    }
}

// 星星样式映射表 (数据驱动，starStyle 字段在 poems.json 中)
const STAR_STYLES = {
    red: { color: '#DE2910' },
    blue: { color: '#1E90FF' },
    rainbow: { className: 'rainbow-stars' }
};

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
    let nextIndex = Math.floor(Math.random() * backgrounds.length);
    if (backgrounds.length > 1 && nextIndex === bgIndex) {
        nextIndex = (nextIndex + 1) % backgrounds.length;
    }
    bgIndex = nextIndex;
    applyBackground(bgIndex);
    persistBgState();
    updateBgMenuActive();
}

// 切换背景模式（随机/固定）
function toggleBgMode() {
    if (bgMode === 'random') {
        // 切换到固定模式
        bgMode = 'fixed';
        fixedBgIndex = bgIndex; // 固定当前背景
        updateBgButtonState();
        restartBgInterval();
        persistBgState();
    } else {
        // 切换到随机模式
        bgMode = 'random';
        updateBgButtonState();
        changeBackground(); // 立即切换一次
        restartBgInterval();
        persistBgState();
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

    // 添加“恢复随机”选项
    const randomLi = document.createElement('li');
    randomLi.innerHTML = '🔀 恢复随机';
    randomLi.classList.add('special-option');
    if (bgMode === 'random') randomLi.classList.add('active');
    randomLi.addEventListener('click', (e) => {
        e.stopPropagation();
        bgMode = 'random';
        updateBgButtonState();
        changeBackground(); // 立即随机切换一次
        restartBgInterval();
        persistBgState();
        const menu = document.getElementById('bg-menu');
        if (menu) menu.classList.remove('show');
    });
    list.appendChild(randomLi);

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
        if (bgMode === 'fixed' && item.index === bgIndex) li.classList.add('active');

        // 绑定点击事件：选择特定背景
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            selectBackground(item.index);
            const menu = document.getElementById('bg-menu');
            if (menu) menu.classList.remove('show');
        });

        list.appendChild(li);
    });
}


function updateBgMenuActive() {
    const list = document.getElementById('bg-list');
    if (!list) return;

    // 更新普通背景项
    list.querySelectorAll('li[data-index]').forEach(li => {
        // 如果是固定模式且索引匹配，则高亮
        li.classList.toggle('active', bgMode === 'fixed' && Number(li.dataset.index) === bgIndex);
    });

    // 更新“恢复随机”选项
    const randomLi = list.querySelector('.special-option');
    if (randomLi) {
        randomLi.classList.toggle('active', bgMode === 'random');
    }
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
    if (!backgrounds.length) return;
    if (index < 0 || index >= backgrounds.length) return;
    bgMode = 'fixed';
    fixedBgIndex = index;
    bgIndex = index;
    applyBackground(index);
    updateBgButtonState();
    restartBgInterval();
    persistBgState();
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

        // 2. 初始背景：随机
        if (backgrounds.length > 0) {
            bgMode = 'random';
            bgIndex = Math.floor(Math.random() * backgrounds.length);
            applyBackground(bgIndex);
            updateBgButtonState();
            restartBgInterval();
            persistBgState();
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

    function entryMatchesVisiblePoems(entry, visibleTitleKeys) {
        const key = normalizeTitleText(entry.title);
        if (!key) return false;
        for (const visibleKey of visibleTitleKeys) {
            if (visibleKey.includes(key) || key.includes(visibleKey)) return true;
        }
        return false;
    }

    function sanitizeUpdateInfoForLockedPoems() {
        const visibleTitleKeys = new Set(
            poems
                .filter(poem => !isLockedPoemHidden(poem))
                .map(poem => normalizeTitleText(poem.title))
                .filter(Boolean)
        );

        updateInfo.latestWorks = normalizeLatestWorks(updateInfo.latestWorks)
            .filter(entry => entryMatchesVisiblePoems(entry, visibleTitleKeys));
        updateInfo.modifiedWorks = normalizeModifiedWorks(updateInfo.modifiedWorks)
            .filter(entry => entryMatchesVisiblePoems(entry, visibleTitleKeys));
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
            textEl.textContent = `有新作 ${count} 首上线`;

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

        // 设置公告内容
        const textEl = document.getElementById('announcement-text');
        if (textEl && updateInfo.announcement) {
            // 安全渲染公告：仅允许 <br> 换行标签，其余 HTML 转义
            const safeHtml = updateInfo.announcement
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/&lt;br&gt;/gi, '<br>').replace(/&lt;br\s*\/&gt;/gi, '<br>');
            textEl.innerHTML = safeHtml;
            noticeEl.style.display = 'flex';
        } else if (!updateInfo.announcement) {
            // 没有公告则隐藏
            noticeEl.style.setProperty('display', 'none', 'important');
            return;
        }

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
            textEl.textContent = `有 ${count} 首旧作翻新`;


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
            updateInfo.announcement = data.announcement || '';

            // 读取诗词数组
            poems = data.poems || data;
            poems.forEach(applyPoemContentFixes);

            // 自动解密已解锁的加锁诗词
            await autoDecryptPoems();
            // 防止加锁作品通过新作/修改列表意外暴露标题
            sanitizeUpdateInfoForLockedPoems();

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

            // 随机展示一首
            currentIndex = Math.floor(Math.random() * poems.length);
            renderPoem(currentIndex, true);
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
                <div class="toc-tabs-row">
                    <button class="toc-tab active" data-filter="all">全部作品</button>
                    <button class="toc-tab" data-filter="new">上线新作</button>
                    <button class="toc-tab" data-filter="modified">修改旧作</button>
                </div>
                <div class="toc-tabs-row toc-category-tabs">
                    <button class="toc-tab toc-cat-tab" data-filter="心声">心声</button>
                    <button class="toc-tab toc-cat-tab" data-filter="诗道">诗道</button>
                    <button class="toc-tab toc-cat-tab" data-filter="情思">情思</button>
                    <button class="toc-tab toc-cat-tab" data-filter="观察">观察</button>
                </div>
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
                .toc-tabs{display:flex;flex-direction:column;gap:6px;margin-bottom:.75rem;width:100%}
                .toc-tabs-row{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
                .toc-category-tabs{margin-top:4px;padding-top:6px;border-top:1px dashed rgba(168,63,63,0.2)}
                .toc-tab{border:2px solid var(--accent-color);background:rgba(255,255,255,.92);color:var(--accent-color);
                padding:4px 8px;border-radius:6px;font-size:.8rem;font-weight:700;cursor:pointer;line-height:1.2}
                .toc-tab.active{background:var(--accent-color);color:#fff}
                .toc-cat-tab{font-size:.75rem;padding:3px 10px}
                .toc-overlay.blue-mode .toc-category-tabs{border-top-color:rgba(18,104,204,0.2)}
                .bg-tabs,.music-tabs{flex-direction:row!important;justify-content:center;flex-wrap:wrap}
                @media(max-width:480px){
                    .toc-tabs{gap:4px}
                    .toc-tabs-row{gap:4px}
                    .toc-tab{font-size:.72rem;padding:3px 6px;border-width:1.5px}
                    .toc-cat-tab{font-size:.68rem;padding:2px 8px}
                    .toc-category-tabs{margin-top:3px;padding-top:5px}
                }
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

        // 点击"上线新作"或"修改旧作"时隐藏分类标签行
        const categoryTabsRow = document.querySelector('.toc-category-tabs');
        if (categoryTabsRow) {
            if (filter === 'new' || filter === 'modified') {
                categoryTabsRow.style.display = 'none';
            } else {
                categoryTabsRow.style.display = 'flex';
            }
        }
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

        const modifiedEntries = applyStickyModifiedTimes(normalizeModifiedWorks(updateInfo.modifiedWorks));
        const activeModified = modifiedEntries.filter(entry => isWithin24Hours(entry.effectiveAt || entry.modifiedAt || updateInfo.date));
        const activeModifiedKeys = activeModified.map(entry => normalizeTitleText(entry.title));

        const filteredPoems = poems.filter(poem => {
            if (filter === 'all') return true;
            const cleanTitle = normalizeTitleText(poem.title);
            if (filter === 'new') {
                return activeLatestKeys.some(key => cleanTitle.includes(key));
            }
            if (filter === 'modified') {
                return activeModifiedKeys.some(key => cleanTitle.includes(key));
            }
            // 按 category 分类筛选
            if (['心声', '诗道', '情思', '观察'].includes(filter)) {
                return poem.category === filter;
            }
            return true;
        });

        const lockedPoems = filteredPoems.filter(poem => isLockedPoemHidden(poem));
        const visiblePoems = filteredPoems.filter(poem => !isLockedPoemHidden(poem));
        const displayPoems = [...visiblePoems];
        if (lockedPoems.length > 0) {
            displayPoems.push({
                __lockedGroup: true,
                __lockedPoems: lockedPoems
            });
        }

        if (displayPoems.length === 0) {
            const li = document.createElement('li');
            if (filter === 'new') {
                li.innerText = '暂无新作';
            } else if (filter === 'modified') {
                li.innerText = '暂无修改';
            } else {
                li.innerText = '该分类暂无作品';
            }
            tocList.appendChild(li);
            return;
        }

        displayPoems.forEach((poem, index) => {
            const li = document.createElement('li');
            if (poem.__lockedGroup) {
                li.innerText = '🔒 情感珍藏';
            } else {
                li.innerText = formatPoemTitleForList(poem.title);
            }

            const cleanTitle = poem.__lockedGroup ? '' : normalizeTitleText(poem.title);
            const isNewWorkActive = !poem.__lockedGroup && activeLatestKeys.some(key => cleanTitle.includes(key));
            const isModifiedWorkActive = !poem.__lockedGroup && activeModifiedKeys.some(key => cleanTitle.includes(key));

            if (filter === 'new' && isNewWorkActive) {
                li.classList.add('new-work-highlight');
            }
            if (filter === 'modified' && isModifiedWorkActive) {
                li.classList.add('modified-work-highlight');
            }


            li.onclick = () => {
                const targetPoem = poem.__lockedGroup ? poem.__lockedPoems[0] : poem;
                const realIndex = poems.findIndex(p => p === targetPoem);
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
            if (isContentLocked(poem)) {
                notesContent.textContent = '';
                const p = document.createElement('p');
                p.textContent = '内容已加密，解锁后可查看注释';
                notesContent.appendChild(p);
                if (noteBtn) noteBtn.classList.remove('has-notes');
                overlay.classList.toggle('active');
                return;
            }
            const notes = poem.notes || [];

            notesContent.textContent = '';
            if (notes.length > 0) {
                // 有注释：逐条显示（安全创建 DOM 元素，防止 XSS）
                notes.forEach(note => {
                    const p = document.createElement('p');
                    p.textContent = note;
                    notesContent.appendChild(p);
                });
                // 点击查看后移除高亮
                if (noteBtn) noteBtn.classList.remove('has-notes');
            } else {
                // 无注释
                const p = document.createElement('p');
                p.textContent = '暂无注释';
                notesContent.appendChild(p);
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
        // 烟花仅保留“益智娱乐”按钮触发
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
        const list = document.getElementById('viewmode-list');
        if (!list) return;
        const activeMode = viewMode === 'single' ? 'single' : wingDisplayMode;
        list.querySelectorAll('li').forEach(item => {
            item.classList.toggle('active', item.dataset.mode === activeMode);
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

    let entertainmentMenuTimer = null;

    function openViewModeMenu() {
        const menu = document.getElementById('viewmode-menu');
        if (!menu) return;
        menu.classList.add('show');
    }

    function closeViewModeMenu() {
        const menu = document.getElementById('viewmode-menu');
        if (!menu) return;
        menu.classList.remove('show');
    }

    function selectViewModeOption(mode) {
        if (mode === 'single') {
            viewMode = 'single';
            applyViewMode('single');
        } else {
            viewMode = 'triple';
            applyViewMode('triple');
            setWingDisplayMode(mode);
        }
        updateWingDisplayButton();
        closeViewModeMenu();
    }

    function initViewModeMenu() {
        const btn = document.getElementById('viewmode-btn');
        const menu = document.getElementById('viewmode-menu');
        const list = document.getElementById('viewmode-list');
        if (!btn || !menu || !list) return;

        updateWingDisplayButton();

        list.querySelectorAll('li').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const mode = item.dataset.mode || 'single';
                selectViewModeOption(mode);
            });
        });

        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.remove('show');
            }
        });
    }

    function openEntertainmentMenu() {
        const menu = document.getElementById('entertainment-menu');
        if (!menu) return;
        menu.classList.add('show');
        clearTimeout(entertainmentMenuTimer);
        entertainmentMenuTimer = setTimeout(() => {
            closeEntertainmentMenu();
        }, 5000);
    }

    function closeEntertainmentMenu() {
        const menu = document.getElementById('entertainment-menu');
        if (!menu) return;
        menu.classList.remove('show');
        clearTimeout(entertainmentMenuTimer);
    }

    function toggleEntertainmentMenu() {
        const menu = document.getElementById('entertainment-menu');
        if (!menu) return;
        if (menu.classList.contains('show')) {
            closeEntertainmentMenu();
        } else {
            openEntertainmentMenu();
        }
    }

    function initEntertainmentMenu() {
        const menu = document.getElementById('entertainment-menu');
        const list = document.getElementById('entertainment-menu-list');
        const btn = document.getElementById('entertainment-btn');
        if (!menu || !list) return;

        if (list.dataset.bound !== 'true') {
            list.dataset.bound = 'true';
            list.addEventListener('click', (e) => {
                const item = e.target.closest('li[data-action]');
                if (!item) return;
                e.stopPropagation();
                const action = item.dataset.action;
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
                if (action === 'share-card') {
                    console.log('点击生成雅帖');
                    if (window.generateShareCard) {
                        console.log('调用 generateShareCard');
                        window.generateShareCard(poems, currentIndex);
                    } else {
                        console.error('window.generateShareCard 未定义');
                        alert('功能尚未加载，请检查网络或刷新页面');
                    }
                }
                // 点击后收起菜单
                menu.classList.remove('active');
                closeEntertainmentMenu();
            });
        }

        if (menu.dataset.outsideBound !== 'true') {
            menu.dataset.outsideBound = 'true';
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
                    closeEntertainmentMenu();
                }
            });
        }
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
            // 加锁诗词：隐藏标题
            if (poem.locked && !isPoemUnlocked(poem.title)) {
                displayTitle = '情感珍藏';
            }
            titleEl.innerText = displayTitle;
        }
        if (bodyDiv) {
            bodyDiv.innerHTML = '';
            // 加锁诗词：副卡显示锁定提示
            if (poem.locked && !isPoemUnlocked(poem.title)) {
                bodyDiv.innerHTML = '<div class="poem-locked-overlay"><div class="lock-icon">🔒</div><p class="lock-hint">情感珍藏，待您开启</p></div>';
            } else {
                poem.content.forEach((line, index) => {
                    const p = document.createElement('p');
                    p.innerText = line;
                    p.style.setProperty('--line-index', index);
                    p.classList.add('poem-line-animate');
                    bodyDiv.appendChild(p);
                });
            }
        }
        const techRomanceTag = card.querySelector('#tech-romance-tag');
        if (techRomanceTag) {
            // 统一修改为：在心成象，在纸成形
            techRomanceTag.innerHTML = '在心成象，在纸成形';
        }

        // 五星装饰显示逻辑
        const fiveStars = card.querySelector('.five-stars-row');
        if (fiveStars) {
            fiveStars.classList.remove('show-stars', 'rainbow-stars');
            fiveStars.style.color = '';
            fiveStars.querySelectorAll('svg').forEach(svg => svg.style.fill = '');

            // 只有红蓝彩才显示
            const wingStyle = STAR_STYLES[poem.starStyle];
            if (wingStyle) {
                fiveStars.classList.add('show-stars');
                if (wingStyle.className) fiveStars.classList.add(wingStyle.className);
                if (wingStyle.color) fiveStars.style.color = wingStyle.color;
            }
        }
    }

    // Fireworks are provided by js/fireworks.js via window.triggerFireworks
    function maybeTriggerFireworks() {
        // 彩蛋已关闭
        return;
        /*
        if (!autoFireworksReady) return;
        if (wingDisplayMode !== 'random') return;
        if (!isDesktopLayout()) return;
        if (document.body.classList.contains('view-mode-single')) return;
        if (lastWingIndices.left === null || lastWingIndices.right === null) return;
        if (lastWingIndices.left === currentIndex && lastWingIndices.right === currentIndex) {
            if (typeof window.triggerFireworks === 'function') {
                window.triggerFireworks();
            }
        }
        */
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
            } else if (poems.length > 0) {
                // Sync Mode: Left = Prev, Right = Next
                let targetIndex;
                if (idx === 0) { // Left Wing
                    targetIndex = (currentIndex - 1 + poems.length) % poems.length;
                } else { // Right Wing
                    targetIndex = (currentIndex + 1) % poems.length;
                }
                const poem = poems[targetIndex];
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
        if (!autoFireworksReady) {
            autoFireworksReady = true;
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

        // [新增] 将导航箭头移入 grid 容器，使其跟随布局
        const prevArrow = document.getElementById('arrow-prev');
        const nextArrow = document.getElementById('arrow-next');
        // 移动端隐藏箭头，仅桌面端移入
        if (prevArrow) grid.appendChild(prevArrow);
        if (nextArrow) grid.appendChild(nextArrow);

        wrapper.appendChild(grid);

        parent.insertBefore(wrapper, nextSibling);
    }

    function renderPoem(index, skipAnimation = false) {
        if (poems.length === 0) return;
        const poem = poems[index];
        const mainCard = getMainCard();
        if (!mainCard) return;
        const textContainer = mainCard.querySelector('#poem-text-container');
        const bodyDiv = mainCard.querySelector('#poem-body');
        if (!textContainer || !bodyDiv) return;

        // 如果是首次加载 (skipAnimation = true)，直接渲染，不执行翻页动画
        if (!skipAnimation) {
            // 3D 翻页淡出动画 + 水墨晕染
            textContainer.classList.remove('page-flip-in', 'ink-fade-in');
            textContainer.classList.add('page-flip-out', 'ink-fade-out');
        } else {
            // 首次加载，确保没有残留动画类
            textContainer.classList.remove('page-flip-out', 'ink-fade-out', 'page-flip-in', 'ink-fade-in');
        }

        const renderContent = () => {
            // 处理标题（如果标题里有通韵标注则移除，备注通过弹窗显示）
            let displayTitle = poem.title;
            const tongYunRegex = /[\(（]通韵[\)）]/;
            if (tongYunRegex.test(displayTitle)) {
                displayTitle = displayTitle.replace(tongYunRegex, "");
            }

            // 仅情感珍藏系列：隐藏真实标题
            if (isLockedPoemHidden(poem)) {
                displayTitle = '情感珍藏';
            }

            const titleEl = mainCard.querySelector('#poem-title');
            if (titleEl) titleEl.innerText = displayTitle;

            // 渲染正文（支持加锁诗词）
            bodyDiv.innerHTML = '';
            if (isContentLocked(poem)) {
                // 加锁状态：显示锁定 UI
                const lockHint = isLockedPoemHidden(poem) ? '情感珍藏，待您开启' : '内容已加密，请输入密码';
                bodyDiv.innerHTML = `
                    <div class="poem-locked-overlay">
                        <div class="lock-icon">🔒</div>
                        <p class="lock-hint">${lockHint}</p>
                        <div class="lock-input-row">
                            <input type="password" id="poem-password-input"
                                   placeholder="请输入密码" maxlength="20"
                                   autocomplete="off" spellcheck="false"
                                   class="lock-password-input">
                            <button id="poem-unlock-btn" class="lock-unlock-btn">解锁</button>
                        </div>
                        <p class="lock-error" id="lock-error" style="display:none">密码错误</p>
                    </div>`;
                // 绑定解锁事件
                const unlockBtn = bodyDiv.querySelector('#poem-unlock-btn');
                const pwdInput = bodyDiv.querySelector('#poem-password-input');
                const errorMsg = bodyDiv.querySelector('#lock-error');
                const doUnlock = async () => {
                    const pwd = pwdInput.value.trim();
                    if (!pwd) return;
                    try {
                        const { payload, keyBytes } = await decryptPoemContent(poem.encryptedContent, pwd);
                        // 存储实际解密成功的密钥（可能是 legacy 或 PBKDF2）
                        storeGlobalUnlockKey(keyBytes);
                        // 解密成功：用假标题作为 localStorage 键
                        const lockedAliasTitle = poem.title;
                        markPoemUnlocked(lockedAliasTitle);
                        // 恢复真实数据
                        if (payload.realTitle) {
                            poem.title = payload.realTitle;
                            markPoemUnlocked(payload.realTitle);
                        }
                        poem.content = payload.content || payload;
                        poem.notes = payload.notes || [];
                        applyPoemContentFixes(poem);
                        // 一次成功解锁后，自动解密全部锁作，避免重复输入
                        await autoDecryptPoems();
                        // 重新渲染 + 刷新目录
                        renderPoem(currentIndex, true);
                        renderTOC();
                    } catch {
                        errorMsg.style.display = 'block';
                        pwdInput.value = '';
                        pwdInput.focus();
                        setTimeout(() => { errorMsg.style.display = 'none'; }, 2000);
                    }
                };
                unlockBtn.addEventListener('click', doUnlock);
                pwdInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') doUnlock();
                });
                setTimeout(() => pwdInput.focus(), 100);
            } else {
                // 正常渲染（含已解锁的诗词）
                poem.content.forEach((line, index) => {
                    const p = document.createElement('p');
                    p.innerText = line;
                    p.style.setProperty('--line-index', index);
                    p.classList.add('poem-line-animate');
                    bodyDiv.appendChild(p);
                });
            }

            // 检测是否有备注，高亮注释按钮
            const noteBtn = document.getElementById('note-btn');
            const hasNotes = !isContentLocked(poem) && poem.notes && poem.notes.length > 0;

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
                // 统一修改为：在心成象，在纸成形
                techRomanceTag.innerHTML = '在心成象，在纸成形';
            }

            // 五星装饰显示逻辑 - 配置化重构
            const fiveStars = mainCard.querySelector('.five-stars-row');
            if (fiveStars) {
                fiveStars.classList.remove('show-stars', 'rainbow-stars');
                fiveStars.querySelectorAll('svg').forEach(svg => svg.style.fill = '');
                fiveStars.style.color = '';

                // 星星样式 (数据驱动，只有红蓝彩才显示)
                const mainStyle = STAR_STYLES[poem.starStyle];
                if (mainStyle) {
                    fiveStars.classList.add('show-stars');
                    if (mainStyle.className) fiveStars.classList.add(mainStyle.className);
                    if (mainStyle.color) fiveStars.style.color = mainStyle.color;
                }
            }

            // 智能注释提醒逻辑已移除

            // 更新页码
            const pageNumEl = document.getElementById('poem-page-number');
            if (pageNumEl) {
                pageNumEl.textContent = `${index + 1} / ${poems.length}`;
            }
        };

        // 如果跳过动画，直接渲染；否则延迟执行以配合动画
        if (skipAnimation) {
            renderContent();
            lockMobileCardHeight();
            // 首次加载也需要同步侧翼卡片
            wingRandomizeOnNextSync = true;
            syncWingCards();
        } else {
            setTimeout(() => {
                renderContent();

                // 3D 翻页淡入动画 + 水墨晕染
                textContainer.classList.remove('page-flip-out', 'ink-fade-out');
                textContainer.classList.add('page-flip-in', 'ink-fade-in');

                lockMobileCardHeight();
                wingRandomizeOnNextSync = true;
                syncWingCards();
            }, 400);
        }
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
        const viewModeMenu = document.getElementById('viewmode-menu');
        const entertainmentMenu = document.getElementById('entertainment-menu');
        const entertainmentBtn = document.getElementById('entertainment-btn');
        const settingsBtn = document.getElementById('settings-btn');
        const musicMenu = document.getElementById('music-menu');
        const bgMenu = document.getElementById('bg-menu');
        const themeMenu = document.getElementById('theme-menu');
        const tocOverlay = document.getElementById('toc-overlay');
        const notesOverlay = document.getElementById('notes-overlay');

        if (voiceBtn) voiceBtn.classList.toggle('blue-mode');
        if (noteBtn) noteBtn.classList.toggle('blue-mode');
        if (musicControl) musicControl.classList.toggle('blue-mode');
        if (sealBtn) sealBtn.classList.toggle('blue-mode');
        if (viewModeMenu) viewModeMenu.classList.toggle('blue-mode');
        if (entertainmentMenu) entertainmentMenu.classList.toggle('blue-mode');
        if (entertainmentBtn) entertainmentBtn.classList.toggle('blue-mode');
        if (settingsBtn) settingsBtn.classList.toggle('blue-mode');
        if (musicMenu) musicMenu.classList.toggle('blue-mode');
        if (bgMenu) bgMenu.classList.toggle('blue-mode');
        if (themeMenu) themeMenu.classList.toggle('blue-mode');
        if (tocOverlay) tocOverlay.classList.toggle('blue-mode');
        if (notesOverlay) notesOverlay.classList.toggle('blue-mode');
        const arrowPrev = document.getElementById('arrow-prev');
        const arrowNext = document.getElementById('arrow-next');
        if (arrowPrev) arrowPrev.classList.toggle('blue-mode');
        if (arrowNext) arrowNext.classList.toggle('blue-mode');

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

    function applyViewMode(mode) {
        const btn = document.getElementById('viewmode-btn');
        const viewModeMenu = document.getElementById('viewmode-menu');
        const viewModeWrapper = document.querySelector('.viewmode-btn-wrapper');
        const isSingle = mode === 'single';

        if (!isDesktopLayout()) {
            document.body.classList.remove('view-mode-single');
            if (btn) btn.style.display = 'none';
            if (viewModeMenu) viewModeMenu.style.display = 'none';
            if (viewModeWrapper) viewModeWrapper.style.display = 'none';
            return;
        }

        if (btn) btn.style.display = '';
        if (viewModeMenu) viewModeMenu.style.display = '';
        if (viewModeWrapper) viewModeWrapper.style.display = '';
        initThreeCardLayout();
        document.body.classList.toggle('view-mode-single', isSingle);

        if (btn) {
            btn.innerHTML = '展示<br>样式';
        }

        localStorage.setItem('viewMode', mode);
        updateWingDisplayButton();
        syncWingCards();
    }

    function toggleViewMode() {
        const menu = document.getElementById('viewmode-menu');
        if (!isDesktopLayout()) return;
        if (!menu) return;
        menu.classList.toggle('show');
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

        // 绑定下拉菜单事件
        const btn = document.getElementById('theme-btn');
        const menu = document.getElementById('theme-menu');
        const list = document.getElementById('theme-list');

        if (btn && menu && list) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('show');
            });

            list.querySelectorAll('li').forEach(item => {
                item.addEventListener('click', (e) => {
                    const mode = e.target.dataset.value;
                    selectTheme(mode);
                    menu.classList.remove('show');
                });
            });

            document.addEventListener('click', (e) => {
                if (!btn.contains(e.target) && !menu.contains(e.target)) {
                    menu.classList.remove('show');
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

    // ===== 秘密功能：点击标题7次切换管理员模式 =====
    // 动态加载不蒜子统计
    function loadBusuanzi() {
        if (document.getElementById('busuanzi-script')) return;
        const script = document.createElement('script');
        script.id = 'busuanzi-script';
        script.async = true;
        script.src = '//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
        script.onload = () => { window.busuanziLoaded = true; };
        script.onerror = () => {
            // 加载失败时移除脚本标签，允许下次重试
            script.remove();
        };
        document.body.appendChild(script);
    }

    // 轮询等待不蒜子数据就绪，最多 5 秒
    function waitForBusuanzi(callback) {
        const uvSpan = document.getElementById('busuanzi_value_site_uv');
        const pvSpan = document.getElementById('busuanzi_value_site_pv');
        let attempts = 0;
        const maxAttempts = 25; // 25 × 200ms = 5s
        const timer = setInterval(() => {
            attempts++;
            const uvReady = uvSpan && uvSpan.innerText;
            const pvReady = pvSpan && pvSpan.innerText;
            if ((uvReady && pvReady) || attempts >= maxAttempts) {
                clearInterval(timer);
                callback(uvReady || '统计中...', pvReady || '统计中...');
            }
        }, 200);
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

            const wasAdmin = !!localStorage.getItem('qilv_admin');

            // 连点7次触发：非管理员进入并查看数据；管理员退出
            if (clickCount === 7) {
                clickCount = 0;
                if (wasAdmin) {
                    localStorage.removeItem('qilv_admin');
                    alert('管理员模式已退出，刷新页面后恢复统计。');
                    return;
                }
                localStorage.setItem('qilv_admin', 'true');

                // 强制加载脚本以获取数据（如果未加载）
                loadBusuanzi();

                // 轮询等待数据就绪后弹窗
                waitForBusuanzi((uv, pv) => {
                    alert(`㊙️ 秘密数据 (管理员模式已激活)\n\n👤 总访客数 (UV): ${uv}\n👁️ 总访问量 (PV): ${pv}\n\n⚠️ 注：您的访问今后将不再计入统计。\n💡 再次连点7次可退出管理员模式。`);
                });
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
        if (typeof window.stopFireworks === 'function') {
            window.stopFireworks();
        }
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
    window.selectViewModeOption = selectViewModeOption;
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
    const today = new Date();
    if (today.getFullYear() === 2026 && today.getMonth() === 0 && today.getDate() === 29) {
        const blessingNotice = document.getElementById('blessing-notice');
        const blessingText = document.getElementById('blessing-notice-text');

        if (blessingNotice && blessingText) {
            // 1. 修改文案
            blessingText.innerHTML = "🧨 新春快乐！点击此处为您燃放烟花送祝福！🎆";

            // 2. 覆盖点击事件 (点击 -> 放烟花，不再直接隐藏)
            blessingNotice.onclick = function (e) {
                e.stopPropagation(); // 防止冒泡
                // 烟花仅保留“益智娱乐”按钮触发
                // 仅点击多次后或长按才隐藏？暂时保持常驻方便多次玩
            };

            // 3. 强制显示 (不受 CSS 隐藏限制)
            blessingNotice.style.display = 'flex';

            // 4. (可选) 给个小动画提示 注意这里
            blessingNotice.style.animation = 'pulse 2s infinite';
        }
    }
});

// 窗口大小变化时重新初始化
window.addEventListener('resize', () => {
    const wrapper = document.querySelector('.music-wrapper');
    // 如果没有任何状态类，重新初始化（防止resize导致状态丢失）
    if (wrapper && !wrapper.classList.contains('collapsed') && !wrapper.classList.contains('expanded')) {
        initCollapseMenu();
    }
});
