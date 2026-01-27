# 七律空间 · 工作交接文档

**更新日期**: 2026-01-27
**当前版本**: `v1.5-feature-three-card-merge`
**当前分支**: `feature/three-card`
**最新提交 (Commit Hash)**: `bdaa072` (Check git log for latest)
**状态**: ✅ 烟花系统升级完毕 (Fireworks v1.3)

---

## 📅 最新更新 (v1.5 - Fireworks Upgrade)

### 🎆 烟花系统重构 (Fireworks v1.3)
1.  **物理引擎集成**:
    - 全新 `js/fireworks.js` 模块，替代了 `script.js` 中的旧逻辑。
    - 引入重力 (`gravity`) 和空气阻力 (`friction`)，模拟真实抛物线轨迹。
2.  **高级造型 (Shapes)**:
    - **心形 (Heart)**: 使用参数方程 `16sin^3(t)` 生成。
    - **土星环 (Saturn)**: 椭圆轨道 + 中心高亮恒星。
    - **标准圆**: 增强的粒子辐射效果。
3.  **视觉增强**:
    - **HSL 色彩空间**: 支持高饱和度霓虹色和动态色相偏移 (`hue += 0.5`)。
    - **闪烁效果**: 粒子随机 `sparkle` 属性实现高频频闪。
4.  **适配性修复**:
    - **移动端居中**: 使用 `window.visualViewport.width` 解决移动端地址栏导致的中心点偏移问题。
    - **点击冲突修复**: 移除了 `script.js` 中残留的 `triggerFireworks` 函数，解决了第一次点击无响应的 Bug。

### 🖥️ 桌面端布局重构 (Desktop Layout)
1.  **Grid Areas 布局**: 
    - 采用 CSS Grid Areas (`.grid-head`, `.grid-left`, `.main`, `.grid-right`, `.grid-tail`)。
    - 关键容器: `.layout-wrapper` (仅在 Desktop 生效, Mobile 为 `display: block`)。
    - CSS 文件: `css/desktop.css` (重写了 Grid 相关逻辑, 包含 `gap: 10px`, `margin: 0 !important` 重置)。
2.  **幽灵分身 (Side Wings)**:
    - 左右两侧 `.wing` 元素通过 JS (`script.js` -> `updateWings()`) 实时克隆主卡片内容。
    - 样式: 透明度 0.5, 缩放 95%, 灰度 50%。
3.  **字体优化**:
    - 全局按钮 (控制面板、挂件) 字体已从 "马山正" (Title Font) 修改为 **"宋体" (Noto Serif SC)** 以提升可读性。

### 🚨 已知问题 / 注意事项 (Critical Context)
1.  **缓存问题**:
    - 由于 `script.js` 变动较大，`index.html` 中已更新版本号为 `v=20260127-fix-click2` 以强制刷新缓存。后续更新请注意维护版本号。
2.  **卡片宽度一致性**:
    - `base.css`: 卡片最大宽度 `max-width: 600px` (clamp设置)。
    - `desktop.css`: 页脚宽度目前硬编码为 `500px`。
    - **TODO**: 需要确认最终宽度标准 (建议统一为 500px 或 600px)。

---

## 📂 文件结构说明

```
qilv-lattice-mobile-first/
├── index.html          # 主页面 (包含 .layout-wrapper 结构)
├── css/
│   ├── base.css        # 核心样式 (移动优先, 字体变量 var(--font-body))
│   └── desktop.css     # 桌面端覆盖 (Grid布局, 粒子背景, 挂件)
├── js/
│   ├── script.js       # 核心逻辑 (含 updateWings() 克隆函数)
│   ├── fireworks.js    # [NEW] 独立烟花物理引擎模块
│   └── snow.js         # 雪花特效
└── ...
```

## 🛠️ 常用指令

- **启动服务**: `python -m http.server 8081`
- **Git 同步**: 确保 `git pull` 获取最新 `desktop.css` 和 `index.html` 结构变动。

---

*Updated by Antigravity for Collaboration*
