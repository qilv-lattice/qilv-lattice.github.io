let poems = [];
let currentIndex = 0;

// 背景图随机切换（12张）
const backgrounds = [
    'assets/background01.jpg',
    'assets/background02.jpg',
    'assets/background03.jpg',
    'assets/background04.png',
    'assets/background05.jpeg',
    'assets/background06.jpg',
    'assets/background07.jpg',
    'assets/background08.jpg',
    'assets/background09.png',
    'assets/background10.jpg',
    'assets/background11.jpg',
    'assets/background12.jpg'
];

let bgIndex = 0; // 当前背景索引
const cacheBuster = Date.now(); // 时间戳破缓存
let bgMode = 'random'; // 背景模式：random（随机）或 fixed（固定）
let bgIntervalId = null; // 背景切换定时器ID
let fixedBgIndex = 0; // 固定模式下的背景索引

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

// 分析背景图片亮度
function analyzeBackground(url) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;

    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1;
        canvas.height = 1;

        // 绘制图片到 1x1 画布以获取平均色
        ctx.drawImage(img, 0, 0, 1, 1);
        const p = ctx.getImageData(0, 0, 1, 1).data;

        // 计算亮度 (Luminance)
        // Formula: 0.299*R + 0.587*G + 0.114*B
        const brightness = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
        const isDark = brightness < 128;

        console.log(`Background: ${url}, Brightness: ${brightness.toFixed(1)}, Mode: ${isDark ? 'Dark' : 'Light'}`);

        // 触发自定义事件
        const event = new CustomEvent('lattice-theme-change', {
            detail: {
                isDark: isDark,
                brightness: brightness
            }
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

// 页面加载时初始化背景
document.addEventListener('DOMContentLoaded', () => {
    // 初始随机背景
    bgIndex = Math.floor(Math.random() * backgrounds.length);
    applyBackground(bgIndex);

    // 每5分钟切换一次
    bgIntervalId = setInterval(changeBackground, 5 * 60 * 1000);

    // 绑定背景按钮点击事件
    const bgBtn = document.getElementById('bg-btn');
    const branchGroup = document.getElementById('bg-branch-group');

    if (bgBtn && branchGroup) {
        // 1. 点击主按钮：切换印章组显示状态
        bgBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // 切换显示 class
            branchGroup.classList.toggle('show');

            // 重置所有印章的激活状态（收起子菜单）
            if (branchGroup.classList.contains('show')) {
                branchGroup.querySelectorAll('.branch-item').forEach(item => item.classList.remove('active'));
            }
        });

        // 2. 点击印章按钮：展开对应子菜单
        branchGroup.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止冒泡关闭菜单

            // 情况A：点击了印章按钮 (.branch-btn)
            const branchBtn = e.target.closest('.branch-btn');
            if (branchBtn) {
                const item = branchBtn.parentElement; // .branch-item

                // 切换当前项激活状态
                // 如果当前已激活，则关闭；否则激活当前并关闭其他
                const isActive = item.classList.contains('active');

                // 先关闭所有其他
                branchGroup.querySelectorAll('.branch-item').forEach(i => i.classList.remove('active'));

                if (!isActive) {
                    item.classList.add('active');
                }
                return;
            }

            // 情况B：点击了具体背景项
            const bgItem = e.target.closest('li[data-index]');
            if (bgItem) {
                const index = parseInt(bgItem.dataset.index);
                selectBackground(index);

                // 关闭整个菜单组
                branchGroup.classList.remove('show');

                // 更新激活状态 UI
                branchGroup.querySelectorAll('li[data-index]').forEach(li => li.classList.remove('active'));
                bgItem.classList.add('active');
                return;
            }
        });

        // 3. 点击外部区域关闭菜单
        document.addEventListener('click', (e) => {
            if (!bgBtn.contains(e.target) && !branchGroup.contains(e.target)) {
                branchGroup.classList.remove('show');
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

    // 检查是否显示通知（匹配北京时间 或 本地时间）
    function checkUpdateNotice() {
        const noticeEl = document.getElementById('update-notice');
        const textEl = document.getElementById('notice-text');
        // 使用统一的北京时间判断
        const beijingDate = getBeijingDateString();

        // 宽容模式：允许24小时内的缓冲期（即“今天”和“昨天”都算）
        const isValid = isWithin24Hours(updateInfo.date, beijingDate);

        if (isValid) {
            noticeEl.style.display = 'flex';
            // 直接显示具体数量
            const count = updateInfo.latestWorks.length;
            const worksList = updateInfo.latestWorks.join('、');
            textEl.innerHTML = `新作 ${count} 首：${worksList}`;

            // 10秒后自动隐藏
            setTimeout(() => {
                if (noticeEl) noticeEl.style.display = 'none';
            }, 10000);
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

    // 检查是否显示修改通知（蓝喇叭）
    function checkModificationNotice() {
        const noticeEl = document.getElementById('modification-notice');
        const textEl = document.getElementById('mod-notice-text');
        // 如果没有修改作品，或者不在更新时间窗口内，隐藏
        if (!updateInfo.modifiedWorks || updateInfo.modifiedWorks.length === 0) {
            noticeEl.style.display = 'none';
            return;
        }

        // 使用统一的北京时间判断
        const beijingDate = getBeijingDateString();

        // 宽容模式：允许24小时内的缓冲期（即“今天”和“昨天”都算）
        const isValid = isWithin24Hours(updateInfo.date, beijingDate);

        if (isValid) {
            noticeEl.style.display = 'flex';
            // 直接显示修订列表
            const list = updateInfo.modifiedWorks.join('、');
            textEl.innerHTML = `修订：${list}`;

            // 10秒后自动隐藏
            setTimeout(() => {
                if (noticeEl) noticeEl.style.display = 'none';
            }, 10000);
        } else {
            noticeEl.style.display = 'none';
        }
    }

    // 辅助函数：判断日期是否在有效期内（今天或昨天）
    function isWithin24Hours(targetDate, currentDate) {
        if (!targetDate) return false;
        // 1. 完全匹配
        if (targetDate === currentDate) return true;

        // 2. 也是为了防止时区计算微差，转为时间戳比较
        const tDate = Date.parse(targetDate);
        const cDate = Date.parse(currentDate);

        // 如果 targetDate 是未来的（比如手动改了明天的日期），也显示
        if (tDate > cDate) return true;

        // 如果差距在 24小时 (86400000毫秒) 以内，也显示
        return (cDate - tDate) <= 86400000;
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

            // 设置零点自动隐藏：计算距离下一个北京时间零点的毫秒数
            scheduleMidnightCheck();

            // 渲染名录
            console.log(`Loaded ${poems.length} poems.`);
            renderTOC();

            // 随机开始
            currentIndex = Math.floor(Math.random() * poems.length);
            renderPoem(currentIndex);
        } catch (error) {
            console.error("加载诗词数据失败:", error);
            alert("诗词数据加载失败： " + error.message);
        }
    }

    // 计算距离下一个北京时间零点的毫秒数，并设置定时器
    function scheduleMidnightCheck() {
        const now = new Date();
        // 计算北京时间 (UTC+8)
        const beijingNow = new Date(now.getTime() + 8 * 3600000);
        // 计算北京时间明天零点
        const beijingMidnight = new Date(
            beijingNow.getUTCFullYear(),
            beijingNow.getUTCMonth(),
            beijingNow.getUTCDate() + 1,
            0, 0, 0, 0
        );
        // 转换回本地时间计算差值
        const msUntilMidnight = beijingMidnight.getTime() - 8 * 3600000 - now.getTime();

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


    function renderTOC() {
        const tocList = document.getElementById('toc-list');
        const beijingDate = getBeijingDateString();
        const localDate = getLocalDateString();
        tocList.innerHTML = '';
        poems.forEach((poem, index) => {
            const li = document.createElement('li');
            li.innerText = poem.title;

            // 如果是最新作品且在通知有效期内（宽容模式：今天或昨天），添加高亮类
            const isUpdateDay = isWithin24Hours(updateInfo.date, beijingDate);

            // 归一化处理
            const cleanTitle = poem.title.replace(/[《》\s]/g, '');

            // 1. 检查是否为最新作品 (红色高亮)
            const isNewWork = updateInfo.latestWorks.some(work => {
                return cleanTitle.includes(work.replace(/[《》\s]/g, ''));
            });

            // 2. 检查是否为修订作品 (蓝色高亮)
            const isModifiedWork = updateInfo.modifiedWorks.some(work => {
                return cleanTitle.includes(work.replace(/[《》\s]/g, ''));
            });

            if (isUpdateDay) {
                if (isNewWork) {
                    li.classList.add('new-work-highlight');
                } else if (isModifiedWork) {
                    li.classList.add('modified-work-highlight');
                }
            }

            li.onclick = () => {
                currentIndex = index;
                renderPoem(index);
                toggleTOC();
            };
            tocList.appendChild(li);
        });
    }

    function toggleTOC() {
        const overlay = document.getElementById('toc-overlay');
        overlay.classList.toggle('active');
    }

    // 切换作品注释弹窗
    function toggleNotes() {
        const overlay = document.getElementById('notes-overlay');
        const notesContent = document.getElementById('notes-content');
        const noteBtn = document.getElementById('note-btn');

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

    function renderPoem(index) {
        // 切换诗词时停止朗读
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        isSpeaking = false;
        const voiceBtn = document.getElementById('voice-btn');
        if (voiceBtn) {
            voiceBtn.classList.remove('active');
            voiceBtn.innerHTML = '语音<br>朗读';
        }

        if (poems.length === 0) return;
        const poem = poems[index];
        const textContainer = document.getElementById('poem-text-container');

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

            document.getElementById('poem-title').innerText = displayTitle;

            // 渲染正文（不渲染备注，备注通过弹窗单独显示）
            const bodyDiv = document.getElementById('poem-body');
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

            // ===== 智能注释提醒：首次阅读有注释的作品时自动展开菜单 =====
            // 使用 Set 追踪本次会话中已提醒过的作品（刷新页面后重置）
            if (!window._notifiedPoemsWithNotes) {
                window._notifiedPoemsWithNotes = new Set();
            }

            // 如果作品有注释，且本次会话中尚未提醒过
            if (hasNotes && !window._notifiedPoemsWithNotes.has(poem.title)) {
                // 标记为已提醒
                window._notifiedPoemsWithNotes.add(poem.title);

                // 自动展开菜单（仅在当前是折叠状态时）
                if (menuCollapsed) {
                    const wrapper = document.querySelector('.music-wrapper');
                    const settingsBtn = document.getElementById('settings-btn');

                    menuCollapsed = false;
                    wrapper.classList.remove('collapsed');
                    wrapper.classList.add('expanded');
                    playShuffleSound();

                    // 10秒后自动收起（比普通操作更长）
                    clearTimeout(collapseTimer);
                    collapseTimer = setTimeout(() => {
                        // 双重检查悬停状态
                        if (window.matchMedia('(hover: hover)').matches && wrapper.matches(':hover')) {
                            return;
                        }
                        menuCollapsed = true;
                        wrapper.classList.remove('expanded');
                        wrapper.classList.add('collapsed');
                        if (settingsBtn) settingsBtn.classList.add('settings-used');
                    }, 10000); // 10秒
                }
            }

            // 3D 翻页淡入动画
            textContainer.classList.remove('page-flip-out');
            textContainer.classList.add('page-flip-in');
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
        const card = document.querySelector('.poem-content');
        const btn = document.getElementById('mode-btn');
        const tocBtn = document.getElementById('toc-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const musicLabel = document.querySelector('.music-label');
        const themeBtn = document.getElementById('theme-btn');
        const playmodeBtn = document.getElementById('playmode-btn');
        const bgBtn = document.getElementById('bg-btn');

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

        // 修改按钮文字（显示当前状态）
        if (card.classList.contains('horizontal-mode')) {
            btn.innerHTML = "横排<br>观赏"; // 当前是横排
        } else {
            btn.innerHTML = "竖排<br>观赏"; // 当前是竖排
        }
    }

    // 音乐控制逻辑
    function initMusic() {
        const musicCtrl = document.getElementById('music-control');
        const audio = document.getElementById('bg-music');
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
        const card = document.querySelector('.poem-content');
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
    loadPoems();

    // 初始化主题
    initTheme();

    // 初始化音乐（先设置音频源）
    initMusic();

    // 初始化播放模式（后设置loop属性）
    initPlayMode();

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
    window.toggleMode = toggleMode;
    window.togglePlayMode = togglePlayMode;
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
    wrapper.querySelectorAll('.widget-btn, #mode-btn, .music-control, #theme-list, #music-list, #bg-list, #theme-list li, #music-list li, #bg-list li').forEach(el => {
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

// ===== 语音朗读功能 (TTS) =====
let isSpeaking = false;
let synthesisVoice = null;

// 初始化语音引擎（尝试获取中文语音）
function initSpeech() {
    if ('speechSynthesis' in window) {
        // 某些浏览器需要 onvoiceschanged 事件才能加载语音列表
        window.speechSynthesis.onvoiceschanged = () => {
            const voices = window.speechSynthesis.getVoices();
            // 优先找中文女声/男声
            synthesisVoice = voices.find(v => v.lang.includes('zh-CN') || v.lang.includes('zh'));
        };
    }
}
initSpeech();

function toggleVoice() {
    const btn = document.getElementById('voice-btn');

    if (isSpeaking) {
        // 停止朗读
        window.speechSynthesis.cancel();
        isSpeaking = false;
        btn.classList.remove('active');
        btn.innerHTML = '语音<br>朗读';
    } else {
        // 开始朗读
        const poem = poems[currentIndex];
        if (!poem) return;

        // 拼接朗读文本：标题 -> 作者 -> 正文
        // 稍微加点停顿（用逗号或句号）
        const text = `${poem.title.replace('·', ' ')}。${poem.author.split('|')[1] || poem.author}。。${poem.content.join('。')}`;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.85; // 稍慢语速，更有韵味
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (synthesisVoice) {
            utterance.voice = synthesisVoice;
        } else {
            // 再次尝试获取语音
            const voices = window.speechSynthesis.getVoices();
            synthesisVoice = voices.find(v => v.lang.includes('zh-CN') || v.lang.includes('zh'));
            if (synthesisVoice) utterance.voice = synthesisVoice;
        }

        utterance.onend = () => {
            isSpeaking = false;
            btn.classList.remove('active');
            btn.innerHTML = '语音<br>朗读';
        };

        window.speechSynthesis.speak(utterance);
        isSpeaking = true;
        btn.classList.add('active');
        btn.innerHTML = '正在<br>朗读';
    }
}

window.toggleVoice = toggleVoice;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initCollapseMenu);

// 窗口大小变化时重新初始化
window.addEventListener('resize', () => {
    const wrapper = document.querySelector('.music-wrapper');
    // 如果没有任何状态类，重新初始化（防止resize导致状态丢失）
    if (wrapper && !wrapper.classList.contains('collapsed') && !wrapper.classList.contains('expanded')) {
        initCollapseMenu();
    }
});