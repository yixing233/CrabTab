# CrabTab - 现代毛玻璃极简浏览器起始页扩展 (Chrome / Edge)

CrabTab 是一款遵循**现代、极简美学、毛玻璃视效（Frosted Glass / Glassmorphism）**的 Chrome & Edge 浏览器新标签页与主页扩展。

全部采用自研及现代开源组件库（Lucide Icons + Tailwind CSS + IndexedDB），完全摒弃浏览器生硬的原生组件，结构严谨可靠，无任何横向溢出滚动，提供沉浸舒缓的视觉与使用体验。

---

## ✨ 核心特性

1. **现代毛玻璃美学与纯净交互**
   - 深度定制多级毛玻璃模糊（`backdrop-blur-md / lg / xl`）与微反光描边（`border border-white/20`）。
   - 严格约束在 100vw / 100vh 视口内，采用 `overflow-hidden` 与弹性和流式排版，**彻底杜绝横向滚动条**。
   - 所有对话框、气泡菜单、输入框、快捷导航项均统一毛玻璃圆角风格，不采用浏览器原生 UI。

2. **双语界面与深浅色彩模式**
   - **多语言切换**：支持简体中文 (`zh`) 与 English (`en`) 一键无缝切换。
   - **深浅色外观**：支持暗色模式（Dark）、浅色模式（Light）以及随壁纸亮度自动适配。

3. **丰富壁纸系统与自定义**
   - **在线优质壁纸库**：
     - Unsplash 高清自然风光
     - Bing 每日壁纸
     - 动漫与插画壁纸
     - 极简渐变与现代抽象
     - 4K 风景精选
   - **一键随机刷新**：轻松探索下一张美景。
   - **本地壁纸导入**：
     - 支持**本地图片**（JPG、PNG、WebP 等）。
     - 支持**本地动态视频壁纸**（MP4、WebM），静音循环播放，性能流畅。
     - 本地大体积文件基于 **IndexedDB** 客户端持久化存储，无需担心浏览器存储限额崩溃。
   - **个性化视觉微调**：
     - 背景模糊度调节（0 ~ 30px）
     - 背景遮罩不透明度调节（0% ~ 80%）
     - 时钟大小自定义与秒数开关

4. **精致智能天气组件**
   - 自动基于真实 IP 定位并获取气象数据（Open-Meteo 实时气象引擎，无需申请私有 API Key）。
   - 展示实时温度、天气状态、体感温度、湿度、风速。
   - 悬浮毛玻璃天气卡片可展开查看空气质量指数与体感详细信息。

5. **多引擎聚合搜索与搜索历史**
   - 支持主流搜索引擎快速切换：Google、Bing、百度、DuckDuckGo、GitHub、哔哩哔哩。
   - 快捷键支持：按 `/` 迅速聚焦搜索栏；输入状态下 `ESC` 快速清空或失去焦点。
   - 本地搜索历史沉淀：自动记录最近搜索记录，支持一键点击重新检索、单条移除或一键清空。

6. **浏览器历史记录与最近访问**
   - 独立滑动抽屉（Drawer），毛玻璃面板优雅展示浏览器历史足迹。
   - 支持历史记录关键字极速实时搜索。
   - 一键直达历史访问网页。
   - 浏览器原生安全降级：在未开启 Chrome 历史权限或普通网页预览环境下，优雅切换为演示访问记录。

7. **自定义快捷站点导航（Shortcuts）**
   - 默认预设 GitHub、YouTube、Bilibili、Twitter、Notion 等常用入口。
   - 支持自由添加自定义站点（名称、URL、自定义图标色）。
   - 智能抓取网站 Favicon，加载失败优雅降级为文字徽标。
   - 支持站点编辑、置顶排序与删除，支持在新标签页或当前标签页打开。

---

## 🚀 安装与使用指引

### 方法一：加载已打包好的扩展（推荐）

1. 本项目已经完成全量编译构建，生产文件位于根目录的 `dist/` 文件夹中。
2. 打开 Chrome 或 Edge 浏览器：
   - Chrome 地址栏输入：`chrome://extensions/`
   - Edge 地址栏输入：`edge://extensions/`
3. 在页面右上角开启 **“开发者模式” (Developer mode)** 开关。
4. 点击左上角的 **“加载已解压的扩展程序” (Load unpacked)** 按钮。
5. 选择当前项目的 `dist` 目录（例如 `C:\code\crab-home\dist`）。
6. 安装成功后，按 `Ctrl + T` 打开一个新标签页，即可沉浸式体验 CrabTab！

### 方法二：从源码开发与构建

```bash
# 1. 安装依赖
npm install

# 2. 本地热重载开发调试
npm run dev

# 3. 编译打包出扩展 dist 目录
npm run build

# 4. 本地预览构建产物
npm run preview
```

---

## 🛠️ 技术栈与工程架构

- **前端框架**：React 19 + TypeScript 5
- **构建工具**：Vite 6（打包体积精炼，秒级增量编译）
- **样式方案**：Tailwind CSS v4 + 现代 CSS Backdrop-Filter
- **图标系统**：Lucide React（轻量级现代矢量图标）
- **本地存储**：IndexedDB (`idb-keyval`) 处理大体积视频/图片壁纸 + `chrome.storage.local` / `localStorage` 同步基础配置
- **气象接口**：Open-Meteo REST API + ipapi.co
- **规范标准**：Chrome Extension Manifest V3

---

## 📁 目录结构

```
crab-home/
├── dist/                  # 打包后的扩展程序目录（可直接加载至浏览器）
│   ├── assets/            # 样式与脚本资产
│   ├── icon.png           # 扩展图标
│   ├── index.html         # 主入口页面
│   └── manifest.json      # Chrome 扩展配置文件
├── public/                # 静态资产源文件
├── src/
│   ├── components/        # UI 组件
│   │   ├── BrowserHistoryDrawer.tsx # 历史记录侧边抽屉
│   │   ├── Clock.tsx                # 现代极简毛玻璃时钟
│   │   ├── SearchBox.tsx            # 聚合搜索引擎与搜索历史
│   │   ├── SettingsModal.tsx        # 外观、壁纸与语言设置面板
│   │   ├── Shortcuts.tsx            # 快捷站点宫格
│   │   ├── Wallpaper.tsx            # 多源与自定义视频/图片壁纸渲染器
│   │   └── Weather.tsx              # 智能实时气象卡片
│   ├── types/             # TypeScript 类型定义
│   ├── utils/             # 存储与外部 API 工具
│   ├── constants.ts       # 默认配置、壁纸源与预设数据
│   ├── i18n.ts            # 中英文国际化语言包
│   ├── App.tsx            # 核心状态组合与主布局
│   ├── index.css          # 全局样式与自定义毛玻璃特效
│   └── main.tsx           # React 挂载入口
├── manifest.json
├── package.json
└── vite.config.ts
```

---

## 📄 开源许可证 (License)

本项目基于 **[GNU General Public License v3.0 (GPL-3.0)](LICENSE)** 协议开源。

### ⚠️ 二次开发与衍生要求
根据 GPL-3.0 强互惠（Copyleft）协议条款：
- **强制开源**：任何个人或组织在修改、衍生、引用或二次分发本项目代码时，**必须同样以 GPL-3.0 协议开源**其衍生作品的全部源代码；
- **保留原声明**：必须保留原作者的版权声明、许可证全文与修改记录说明；
- **禁止闭源分发**：不得将本项目或其二改版本闭源发布为私有专有软件。
