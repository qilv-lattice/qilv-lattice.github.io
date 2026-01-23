# 七律空间 · 工作交接文档

**更新日期**: 2026-01-23
**当前版本**: `v1.4-desktop-layout-optimization`
**状态**: 🛠️ 开发中 (Desktop Layout Tuning)

---

## 📅 最新更新 (v1.4)

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
1.  **卡片宽度一致性**:
    - `base.css`: 卡片最大宽度 `max-width: 600px` (clamp设置)。
    - `desktop.css`: 页脚宽度目前硬编码为 `500px`。
    - **TODO**: 需要确认最终宽度标准 (建议统一为 500px 或 600px)。
2.  **移动端兼容**:
    - `.layout-wrapper` 在移动端必须回退为普通流。
    - `.wing` 元素在移动端必须 `display: none`。

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
│   └── snow.js         # 雪花特效
└── ...
```

## 🛠️ 常用指令

- **启动服务**: `python -m http.server 8081`
- **Git 同步**: 确保 `git pull` 获取最新 `desktop.css` 和 `index.html` 结构变动。

---

*Updated by Antigravity for Collaboration*
