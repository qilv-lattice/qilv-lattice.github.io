# 七律空间 · 工作交接文档

**更新日期**: 2026-01-27
**当前版本**: `v1.6-feature-stars`
**当前分支**: `feature/three-card`
**最新提交 (Commit Hash)**: `Check git log`
**状态**: ✅ 五星动态评价系统上线

---

## 📅 最新更新 (v1.6 - Five Stars System)

### ⭐ 五星动态评价系统 (Dynamic Star Rating)
1.  **视觉设计**:
    - 在诗词卡片左上角（梅花装饰旁）增加了一排五颗星 `★★★★★`。
    - 默认显示为 **灰色 (#CCCCCC)**，代表“标准展示”或“等待点亮”。
2.  **智能变色逻辑**:
    - 系统根据当前展示的诗词标题自动改变星星颜色：
        - **《七律·逆风》** ➡️ **中国红 (#DE2910)** (Heroic Red)
        - **《七律·灵犀》** ➡️ **灵动蓝 (#1E90FF)** (Dodger Blue)
        - **其他作品** ➡️ **高级灰 (#CCCCCC)** (Default Gray)
3.  **技术实现**:
    - HTML: `index.html` 中新增 `.five-stars-row` 容器，内嵌 SVG (使用 `fill="currentColor"` 实现动态变色)。
    - CSS: `css/base.css` 定义定位和过渡效果。
4.  **移动端适配优化 (Mobile Optimization)**:
    - **布局调整**: 在手机端，五星装饰强制改为**竖向排列** (Vertical Stack)，位于梅花图标下方 (`top: 50px`)，避免挤占标题空间。桌面端保持横向并排。
    - **卡片加高**: 为容纳竖排装饰，手机端卡片顶部内边距 (`padding-top`) 增至 `3.5rem` (约 56px)。

### 🎆 烟花系统升级 (v1.3 - Previously)
1.  **物理引擎**: 引入重力与阻力，模拟真实轨迹。
2.  **花样造型**: 心形、土星环、霓虹圆。
3.  **修复**: 解决了点击无响应的 Bug。

---

## 📂 文件结构说明 (Key Files)

```
qilv-lattice-mobile-first/
├── index.html          # 主页面 (包含 .five-stars-row 结构)
├── css/
│   ├── base.css        # 核心样式 (含 .five-stars-row, .decoration-plum)
├── js/
│   ├── script.js       # 核心逻辑 (含 renderPoem 星星变色逻辑)
│   ├── fireworks.js    # 烟花引擎
└── ...
```

## 🛠️ 常用指令

- **启动服务**: `python -m http.server 8081`
- **Git 同步**: `git pull` & `git push`

---

*Updated by Antigravity for Collaboration*

## 上新 / 修改 规范 (Poem Publish Checklist)

1) 编辑 `data/poems.json`
- **不要动** `js/script.js` / `index.html` / `css/*`（除非功能变更）。
- **务必使用 UTF-8 编码** 保存，防止乱码。

2) 上新 (新作，24h内)
- 在 `poems` 数组最前方添加：
  - `title`: 《七律·XX》
  - `author`: 当代 | 理工博士
  - `content`: [4句诗]
  - `notes`: []
  - `techRomance`: false (或 true)
- 在 `latestWorks` 数组添加：
  - `title`: 《七律·XX》
  - `receivedAt`: "YYYY-MM-DD HH:mm" (北京时间)
- 更新 `lastUpdate` 时间字段。

3) 修改 (旧作，24h内)
- 修改 `poems` 里的对应内容。
- 在 `modifiedWorks` 数组添加：
  - `title`: 《七律·XX》
  - `modifiedAt`: "YYYY-MM-DD HH:mm" (北京时间)
- 注：24h 内的修改会触发蓝色通知提醒。

4) 验证检查
- 启动服务预览 / 检查显示。
- 确认 `latestWorks` / `modifiedWorks` 对应的红/蓝喇叭提示正常。

5) 提交代码
- `git status` 确认只改了 `data/poems.json`。
- `commit` 信息：`Add poem 《七律·XX》` 或 `Fix poem...`
- `push` 推送到远程。
