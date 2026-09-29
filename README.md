# 紫帽少女桌宠（purple-girl-desktop-pet）

一个基于 **Electron + TypeScript** 的 Windows 桌面宠物程序。角色是戴紫色渔夫帽的 Q 版元气少女「小紫」，
以无边框透明窗口悬浮在桌面上，支持拖拽、点击互动、滚轮缩放、右键菜单与系统托盘常驻。

项目自带一整套「素材处理 → 质量门禁 → 受控构建」工具链：所有角色素材必须先通过图像 QA 才能启动源码预览或打包，
因此仓库里不会出现残缺帧、带底影的抠图或与配置不一致的素材。

本项目以 **Apache License 2.0**（SPDX：`Apache-2.0`）开源发布，允许商用、修改与再分发。

- 应用名 / 可执行文件名：`紫帽少女桌宠`
- 应用 ID：`com.purplegirl.desktopet`
- 版本：`1.0.0`
- 唯一配置源：`pet-spec.json`（角色、互动、状态机、主题色、功能开关、构建参数）
- 许可证：**Apache License 2.0**，版权所有者 `hermanrous`，全文见 [`LICENSE`](LICENSE)

---

## 一、主要功能

### 桌宠本体

| 功能 | 说明 |
|------|------|
| 透明无边框窗口 | 背景完全透明，`skipTaskbar`，不显示系统标题栏 |
| 始终置顶 | 默认开启，可通过右键菜单 / 托盘菜单切换 |
| 鼠标拖拽 | 左键按住拖动；超过 4px 位移才判定为拖拽，避免与点击混淆 |
| 点击互动 | 单击轮流触发 4 种互动动作（跳一下 → 弹一弹 → 向左跳 → 向右跳） |
| 对话气泡 | 互动时从 `pet-spec.json` 的 `feedback` 数组随机取一句中文对白 |
| 滚轮缩放 | `0.4`–`2.5`，步进 `0.1`，通过 `requestAnimationFrame` 节流写回设置 |
| 右键菜单 | 互动动作快捷触发、调整大小（6 档预设）、置顶开关、隐藏桌宠、退出 |
| 系统托盘 | 左键显示/隐藏桌宠，右键菜单可显示、置顶、退出 |
| 待机动画 | 呼吸微动（3200ms 周期）+ 随机眨眼（2–6s）+ 随机空闲调度 |
| 挤压回弹 | 点击时叠加 280ms 的 squash/stretch 变形 |

### 动画状态机

状态与帧全部由 `pet-spec.json` 的 `states` 定义，共 **7 个状态**：

| 状态 | 触发器 | 帧数 | 循环 | 优先级 |
|------|--------|------|------|--------|
| `idle` | `app:start` / `ambient:idle` | 4 | 是 | 10 |
| `blink` | `ambient:blink` | 5 | 否 | 30 |
| `happy` | `pointer:tap` | 5 | 否 | 70 |
| `jump` | `interaction:jump` | 5 | 否 | 85 |
| `squash` | `interaction:squash` | 5 | 否 | 85 |
| `hop-left` | `interaction:hop-left` | 5 | 否 | 85 |
| `hop-right` | `interaction:hop-right` | 5 | 否 | 85 |

状态切换规则由 `src/renderer/pet/state-machine.ts` 统一实现：**优先级更高的状态可打断低优先级状态；
`interrupt: resume` 的同状态不重启；每个状态有独立 `cooldownMs` 冷却；非循环状态播完后自动回落 `idle`。**

### 好感度与陪伴统计

每次互动 `affectionGain: 2`，好感度上限 **300**、心情上限 **100**；同时累计当日互动次数与累计陪伴时长。
统计数据在退出时落盘，跨天自动重置当日计数。

### 数据持久化

写入 Electron 默认 `userData` 目录（Windows 为 `%APPDATA%\紫帽少女桌宠\`）：

| 文件 | 内容 |
|------|------|
| `settings.json` | 置顶、贴边、鼠标穿透、打字响应、缩放比例 |
| `reminders.json` | 提醒列表 |
| `pet-stats.json` | 好感度、心情、当日互动、累计陪伴毫秒 |
| `logs/app.jsonl` | JSON Lines 结构化日志 |

写入使用「临时文件 + `rename`」的原子写；读取时若 JSON 损坏会重命名为 `*.corrupt` 并回退默认值，不会因脏数据启动失败。

### 已实现但默认关闭的能力

`src/main.ts`、`src/renderer/reminder/`、`src/renderer/dashboard/` 中已实现「提醒弹窗」「小屋面板」「文件口袋」，
是否启用由 `pet-spec.json` 的 `features` 开关控制。当前配置：

```json
{
  "transparentWindow": true,
  "drag": true,
  "tray": true,
  "interactions": true,
  "relationship": true,
  "edgeSnap": false,
  "reminders": false,
  "filePocket": false,
  "dashboard": false,
  "typingReaction": false,
  "autonomousMovement": false
}
```

> 注意：`tools/validate-spec.mjs` 会校验「功能开关」与「状态触发器」的一致性——打开 `reminders` 就必须在
> `states` 里存在且仅存在一个拥有 `reminder:due` 触发器的状态，反之亦然。不要把开关直接改成 `true` 了事。

> 打字响应（`typingReaction`）目前是占位实现：`src/main/typing-listener.ts` 只返回 `{ enabled: false, reason: 'not-available' }`，
> 不实际监听键盘。如需启用需接入 `uiohook-napi`（见 `npm run typing:install`）。

### 安全设计

`forge.config.js` 与 `src/main.ts` 共同施加了以下约束：

- 三个渲染进程统一 `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`，仅通过 `preload.ts` 暴露白名单 `petAPI`
- 每个 HTML 强制 CSP（`script-src 'self'`，禁用 `unsafe-eval`），渲染层禁用 eval 型 devtool
- 主进程按 `webContents.id` 记录窗口角色，所有 IPC 调用都做 `assertSender(允许的角色列表)` 校验
- 拒绝所有 `window.open` 与权限申请；渲染进程崩溃 / `did-fail-load` / 控制台致命错误会直接 `fatalExit`
- Forge fuses：关闭 `RunAsNode`、关闭 `NODE_OPTIONS` 与 `--inspect`、开启 Cookie 加密、开启 ASAR 完整性校验
- 应用名、可执行文件名、打包参数全部从 `pet-spec.json` 读取，不做硬编码

---

## 二、技术栈

| 层面 | 选型 |
|------|------|
| 运行时 | Electron `37.10.3` |
| 语言 | TypeScript `5.8`（`strict` + `noUncheckedIndexedAccess`，target ES2022 / CommonJS） |
| 构建 | Webpack 5 + ts-loader + MiniCssExtractPlugin，由 `@electron-forge/plugin-webpack` 驱动 |
| 打包 | Electron Forge 7.9（Squirrel / DMG / ZIP maker + `plugin-fuses` + `plugin-auto-unpack-natives`） |
| 图像处理 | Sharp `0.34`（512×512 RGBA 归一化、接触表生成、像素级 QA） |
| 抠图后端 | Apple Vision（macOS 14+，`tools/vision-cutout.swift`）或 `rembg[cpu,cli]==2.0.76`（Python，跨平台） |
| 单元测试 | Node 内置 `node:test`，经 `tsx` 直接运行 `.ts` |
| 端到端测试 | Playwright `connectOverCDP` 连入打包后应用的调试端口 |

---

## 三、目录结构

```
purple-girl-pet-app/
├── LICENSE                       # ⭐ Apache License 2.0 全文 + 版权声明（Copyright 2026 hermanrous）
├── README.md                     # 本项目说明文档
├── pet-spec.json                 # ⭐ 唯一配置源：角色 / 档案 / 素材管线 / 体验 / 运动 / 功能开关 / 状态 / 构建
├── package.json                  # 依赖与 npm 脚本（scripts 是工具的入口，勿手改）
├── package-lock.json             # 锁定工具链版本
├── forge.config.js               # Forge 配置：三个渲染入口、端口、maker、fuses、打包授权门禁
├── webpack.main.config.js        # 主进程打包（target: electron-main，externals: uiohook-napi）
├── webpack.renderer.config.js    # 渲染进程打包（source-map，禁用 eval）
├── tsconfig.json                 # TS 配置（include: src / tests）
├── build-windows.bat             # Windows 一键构建：npm ci → process:assets → package:win
├── .doubao-pet-builder.json      # 工程来源证明 + 受保护文件 SHA-256（preflight 校验，勿手改）
├── .gitignore                    # 忽略 node_modules / .webpack / .build / out / release / qa（保留 manual-checklist.md）
│
├── src/
│   ├── main.ts                   # 主进程：三个窗口、托盘、菜单、全部 IPC 处理器、运行时门禁与致命退出
│   ├── preload.ts                # 预加载：contextBridge 暴露 petAPI，上报渲染就绪 / 引导失败
│   ├── forge-env.d.ts            # Webpack 注入的入口常量与 *.png / require.context 类型声明
│   ├── shared/
│   │   └── contracts.ts          # 全部类型定义（PetSpec / Settings / Reminder / PetStats / PetAPI…）+ 运行时断言
│   ├── main/
│   │   ├── drag.ts               # 拖拽阈值、窗口位移计算、贴边吸附（纯函数，可单测）
│   │   ├── persistence.ts        # 原子写 JSON、带校验读取、损坏文件归档、去重目标路径
│   │   ├── data-validation.ts    # settings / stats / reminders 解析与提醒定时器延迟计算
│   │   ├── logger.ts             # JSON Lines 日志（写失败不影响主流程）
│   │   └── typing-listener.ts    # 全局打字监听器（当前为占位实现）
│   ├── renderer/
│   │   ├── pet/                  # 桌宠窗口：state-machine.ts（状态机）+ index.ts（动画循环/交互/拖拽）+ index.css
│   │   ├── dashboard/            # 小屋面板：好感度、心情、互动快捷入口、设置开关、尺寸选择
│   │   └── reminder/             # 提醒编辑窗：文本 + 时间，默认「一小时后」
│   └── assets/
│       ├── pet/                  # 运行时素材（512×512 PNG，含 core-ip/core-ip.png 身份母版）
│       └── tray/tray-icon.png    # 托盘图标（32×32）
│
├── incoming-assets/              # 原始素材仓（35 张 PNG），process:assets 的输入
│
├── tools/                        # 工具链（mjs，全部由 npm scripts 调用）
│   ├── run-dev.mjs               # 受控源码预览：选端口 → preflight → check → forge start → 等运行时就绪
│   ├── run-build.mjs             # 受控打包：preflight → check → 清理 → forge package/make → 收集产物
│   ├── dev-ports.mjs             # 端口解析、可用性探测、自动避让
│   ├── activity-lock.mjs         # 互斥锁：禁止开发预览与构建同时运行（PID 存活检测 + 陈旧锁回收）
│   ├── process-assets.mjs        # 素材管线：语义抠图 → 归一化 → 锚点/占位校验 → 输出 512×512 + 托盘图标
│   ├── semantic-cutout.mjs       # 抠图后端路由（auto / apple-vision / rembg），含缓存与超时
│   ├── vision-cutout.swift       # macOS Apple Vision 抠图助手源码
│   ├── inspect-assets.mjs        # ═ process-assets + qa-assets 的串联入口
│   ├── qa-assets.mjs             # 素材 QA：尺寸/透明/锚点/占位/底影/重复帧/跨帧漂移 + 生成接触表
│   ├── qa-experience.mjs         # 体验 QA：状态可达性、触发器唯一归属、互动↔状态↔触发器闭环、素材引用完整性
│   ├── qa-ui.mjs                 # UI QA：透明根、隐藏滚动条、原生控件复位、托盘图标、菜单 emoji、尺寸预算
│   ├── validate-spec.mjs         # pet-spec.json 结构与业务约束校验（v5）
│   ├── validate-dev-contract.mjs # 开发契约：CSP/非 eval devtool/三渲染就绪门禁/隔离冒烟/构建授权
│   ├── validate-asset-links.mjs  # 素材引用闭环：缺帧、孤儿 PNG、大小写冲突
│   ├── preflight.mjs             # 依赖与 Electron 运行时自检、受保护文件哈希校验、锁文件一致性
│   ├── doctor.mjs                # 环境体检（Node 版本 / 哈希漂移 / Electron / 端口 / 素材报告）
│   ├── dev-smoke-client.mjs      # 冒烟客户端（连 CDP，校验三窗口与托盘后收尾）
│   └── collect-release.mjs       # 产物收集：ready-to-run / 安装包 / 便携包 + manifest.json（含 SHA-256）
│
├── qa/                           # QA 证据输出（assets-report.json、接触表、ui/experience/dev-contract 报告、manual-checklist.md）
│
└── tests/
    ├── unit/
    │   ├── state-machine.test.ts    # 状态机：优先级打断、冷却、循环/非循环回落
    │   ├── persistence.test.ts      # 原子写、损坏回退、去重命名
    │   ├── drag.test.ts             # 拖拽阈值与位移计算
    │   ├── typing-listener.test.ts  # 打字监听器状态返回
    │   ├── experience.test.ts       # pet-spec 体验配置一致性
    │   └── dev-ports.test.mjs       # 端口选择逻辑
    └── e2e/
        ├── app.e2e.ts               # 打包应用端到端：三窗口、托盘、优雅退出
        ├── soak.e2e.ts              # 稳定性浸泡测试（默认 30s，release 模式 60min）
        └── helpers.ts               # CDP 连接、窗口等待、快照、优雅退出
```

### 关键约定

- **配置外置**：`displayName`、互动文案、主题色、锚点、帧时长、构建超时等全部走 `pet-spec.json`，
  改文案或改配色**不需要动代码**。
- **素材目录即契约**：`src/assets/pet/` 下不得存在未被 `pet-spec.json` 引用的 PNG（孤儿素材会让 `qa:assets` 失败）。
- **`core-ip/core-ip.png` 是身份母版**，属于独立于动画帧的角色基准图，不允许出现在任何 `states[].frames` 中。

---

## 四、环境要求

| 项 | 要求 |
|----|------|
| 操作系统 | Windows 10 / 11 x64（`targets.windows.enabled = true`）；macOS 脚本已具备但 `targets.macos.enabled = false` |
| Node.js | **≥ 20.12 且 < 25**，推荐 22 LTS。`< 20.12` 缺少部分 `fs` API；`≥ 25` 会被 Forge 拒绝（可用 `PET_BUILD_NODE` 指向兼容版本） |
| Python（可选） | 仅在 Windows 上执行素材处理时需要（`rembg` 后端） |
| 磁盘 | 首次 `npm ci` 约 500MB+（含 Electron 运行时） |

> 打包与预览**必须走 npm scripts**。`forge.config.js` 的 `hooks.prePackage` 要求 `PET_BUILD_AUTHORIZED=1`，
> 直接执行 `npx electron-forge package` 会被主动拦截——这是刻意设计，避免绕过 QA 门禁。

---

## 五、安装与配置

### 1. 安装依赖

```bash
npm ci          # 注意：必须用 ci 而不是 install，且只需执行一次
npm run preflight   # 可选：自检依赖、Electron 运行时、受保护文件哈希
npm run doctor      # 可选：完整环境体检，报告写入 .build/doctor-report.json
```

`npm ci` 会按 `package-lock.json` 安装锁定版本；若 `node_modules/electron/dist` 缺失或版本不符，
`preflight` / `doctor` 会基于官方校验和自动重新下载并还原 Electron 运行时。

### 2. 环境变量（全部可选，均有默认值）

| 变量 | 默认 | 用途 |
|------|------|------|
| `PET_DEV_PORT` | 3000 | Webpack dev server 端口（占用则自动向后避让） |
| `PET_LOGGER_PORT` | 9000 | Webpack dev 日志端口 |
| `PET_SMOKE_PORT` | 9223 | 冒烟模式调试端口 |
| `PET_BUILD_NODE` | — | 当当前 Node ≥ 25 时，指向兼容的 Node 可执行文件 |
| `PET_BUILD_MODE` | `all` | Forge maker 模式：`all` / `installer` / `dmg` / `portable` / `none` |
| `PET_BUILD_OUT` | `out` | Forge 输出目录 |
| `PET_BUILD_AUTHORIZED` | — | 置 `1` 表示由受控构建脚本授权打包（脚本自动设置） |
| `PET_ELECTRON_ZIP_DIR` | — | 指定已缓存的 Electron zip 目录 |
| `PET_VERBOSE_LOGGING` | — | 置 `1` 给 Forge dev 追加 `--enable-logging` |
| `PET_CUTOUT_TIMEOUT_MS` | 300000 | 单次抠图命令超时 |
| `PET_E2E` / `PET_E2E_USER_DATA` | — | 端到端测试开关与隔离 userData 目录（测试自动设置） |
| `PET_PREVIEW_MODE` | — | 置 `1` 让打包版也写运行时证据文件 |

### 3. 更换角色素材（可选）

1. 把符合 `pet-spec.json` 中帧名的 PNG 放入 `incoming-assets/`（当前 35 张，含 `core-ip/core-ip.png`）。
2. 按素材来源在 `pet-spec.json` 的 `assetPipeline` 中设置后端：

   ```json
   {
     "backgroundMode": "semantic-cutout",
     "segmentationBackend": "auto",
     "subjectKind": "illustration",
     "generationBackground": "transparent-grid"
   }
   ```

   `segmentationBackend` 取 `auto` / `apple-vision`（macOS 14+） / `rembg`。
   Windows 上请安装 `rembg[cpu,cli]==2.0.76` 后使用 `rembg` 或 `auto`。
3. 执行管线并验收：

   ```bash
   npm run inspect:assets    # = process:assets + qa:assets
   ```

   产物写入 `src/assets/pet/`（统一 512×512 RGBA，锚点水平居中、脚底基线对齐）与 `src/assets/tray/`，
   质检报告与接触表（`qa/contact-sheet.png` / `contact-sheet-dark.png`）会一并生成。

---

## 六、使用方法与示例

### 开发预览

```bash
npm run dev
```

这条命令不是简单的 `electron-forge start`，而是受控流程：

1. 申请活动锁（防止与构建并发）
2. 选择可用端口 → `preflight`（依赖 + 受保护文件哈希）
3. `npm run check`（类型检查 + 6 项门禁，并刷新 `qa/*.json`）
4. 启动 Forge dev，等待窗口就绪
5. 校验运行时证据：三个渲染进程全部就绪、素材数量与文件名一一对应、帧尺寸为 512×512、桌宠窗口可见
6. 打印 `DEV_PREVIEW_READY ...` 后进入常驻；`Ctrl+C` 优雅退出

就绪后会输出类似：

```
DEV_PREVIEW_READY mode=source-dev renderers=pet,dashboard,reminder ipc=true assets=35 image=512x512 state=idle devPort=3000 loggerPort=9000
```

### 冒烟测试（隔离 userData）

```bash
npm run test:dev-smoke
```

以独立 `userData` 目录启动并自动连 CDP 校验三窗口与托盘，成功输出 `DEV_SMOKE_PASS`，结束后清理临时数据。

### 测试

```bash
npm run test          # 单元测试（node:test + tsx）
npm run test:e2e      # 端到端：先 package-host 打包，再用 Playwright 连入打包版
npm run test:soak     # 稳定性浸泡（默认 30 秒）
npm run test:soak:release   # 60 分钟稳定性验证
```

`test:e2e` / `test:soak` 依赖 `release/manifest.json` 中 `kind = ready-to-run` 的产物，`pretest:*` 会自动打包。

### 构建产物

```bash
# Windows
npm run package:win   # 免安装可运行目录 → release/紫帽少女桌宠-win32-x64-ready-to-run/紫帽少女桌宠.exe
npm run make:win      # 安装包 → release/紫帽少女桌宠-1.0.0-x64-Setup.exe
npm run portable:win  # 便携 ZIP → release/*.zip

# macOS（需在 macOS 主机执行，且 spec 中 targets.macos.enabled = true）
npm run package:mac | make:mac | portable:mac
```

构建脚本会：`preflight` → `check` → 清理 `.webpack`/`out` → 在外部临时目录（避开中文路径）打包 →
`collect-release` 收集到 `release/` 并生成 `manifest.json`（含每个产物的字节数与 SHA-256）。

产物结构：

```
release/
├── 紫帽少女桌宠-win32-x64-ready-to-run/
│   └── 紫帽少女桌宠.exe        ← 双击运行；必须保留整个目录
├── manifest.json               ← 版本 / 平台 / 架构 / 模式 / sha256
└── build.log                   ← 完整构建日志
```

也可以直接双击 **`build-windows.bat`**：依次执行 `npm ci` → `npm run process:assets` → `npm run package:win`。

### 操作说明

| 操作 | 效果 |
|------|------|
| 左键单击角色 | 轮流触发互动动作 + 随机对话气泡 |
| 左键按住拖动 | 移动桌宠位置（位移 ≥ 4px 才判定为拖拽） |
| 鼠标滚轮 | 放大 / 缩小（40% – 250%） |
| 右键单击角色 | 打开功能菜单 |
| 托盘左键 | 显示 / 隐藏桌宠 |
| 托盘右键 | 显示小紫、置顶开关、退出 |

### 配置示例

**改对话文案**——编辑 `pet-spec.json` → `experience.interactions[].feedback`：

```json
{
  "id": "jump",
  "emoji": "⬆️",
  "label": "跳一下",
  "stateId": "jump",
  "durationMs": 1200,
  "affectionGain": 2,
  "feedback": ["哇！跳得好高！", "再来一次嘛～", "嘿嘿，厉害吧！", "我还能跳更高！"]
}
```

**改主题配色**——`experience.theme`，三个渲染窗口会自动把色板注入 CSS 变量：

```json
{ "primary": "#9B7ED8", "accent": "#C9B3F0", "background": "#F5F0FF",
  "surface": "#FFFFFF", "text": "#3D2E5C", "muted": "#8E7CA8", "cornerRadius": 20 }
```

**改桌宠默认大小**——`experience.petSizing`（`baseWindowPx` 限 180–260，`defaultScale` 仅允许 `0.65 / 0.8 / 1 / 1.2`）：

```json
{ "baseWindowPx": 220, "defaultScale": 0.8 }
```

改完 `pet-spec.json` 后建议先跑 `npm run check`，通过后再 `npm run dev` 或重新打包。

---

## 七、npm 脚本一览

| 脚本 | 作用 |
|------|------|
| `dev` / `start` | 受控源码预览（`tools/run-dev.mjs`） |
| `check` | `tsc --noEmit` + 开发契约 + spec 校验 + 素材引用 + UI/体验/素材三项 QA |
| `test` | 单元测试 |
| `test:e2e` / `test:soak` / `test:soak:release` | 端到端与稳定性测试 |
| `test:dev-smoke` | 隔离 userData 的开发冒烟 |
| `qa:assets` / `qa:experience` / `qa:ui` | 单独运行某项质量门禁 |
| `process:assets` | 只跑素材管线 |
| `inspect:assets` | 素材管线 + 素材 QA |
| `preflight` / `doctor` | 依赖与运行环境自检 |
| `typing:install` | 安装可选的 `uiohook-napi`（打字响应前置） |
| `package:win` / `make:win` / `portable:win` | Windows 打包 / 安装包 / 便携包 |
| `package:mac` / `make:mac` / `portable:mac` | macOS 对应产物 |

---

## 八、常见问题与注意事项

### 运行相关

**Q：双击 EXE 没反应？**
A：必须保留整个 `*-ready-to-run/` 目录，不能只把 EXE 单独复制出去——它依赖同目录下的 Electron 运行时文件。

**Q：安全软件提示「未知发布者」？**
A：`build.unsigned = true`，项目未做代码签名，属于预期行为。选择「仍要运行」即可。正式分发前请自行签名。

**Q：桌宠挡住其他窗口 / 想让它不接收鼠标？**
A：右键菜单可关闭置顶或隐藏桌宠；「鼠标穿透」（`settings.clickThrough`）已实现但当前没有菜单入口，
可先调用 `petAPI.settings.update({ clickThrough: true })`，或在 `buildPetMenu()` 中补一个菜单项。

**Q：想同时开两个桌宠？**
A：不可以。主进程持有单实例锁，第二个实例会唤醒并前置已有窗口后退出。

**Q：日志在哪？**
A：`%APPDATA%\紫帽少女桌宠\logs\app.jsonl`，JSON Lines 格式，含渲染进程崩溃、IPC 致命错误等事件。

### 构建与开发相关

**Q：`npm run dev` 报「Source preview requires a complete passing qa/assets-report.json」？**
A：源码预览会读取 `qa/assets-report.json` 并逐帧比对 `src/assets/pet/` 的真实 SHA-256。
正常流程下 `npm run dev` 已内置 `check`（含 `qa:assets`）会刷新它；若你手工改过素材，请先执行
`npm run inspect:assets`（或 `npm run qa:assets`）再预览。

**Q：为什么改了文件就报「protected template infrastructure changed」？**
A：`.doubao-pet-builder.json` 记录了一批**受保护文件**的 SHA-256：

```
package.json / package-lock.json / forge.config.js / webpack.main.config.js / webpack.renderer.config.js
src/main.ts / src/preload.ts / src/shared/contracts.ts
tools/{preflight,run-dev,run-build,activity-lock,process-assets,qa-assets,qa-experience,qa-ui,validate-spec,validate-dev-contract,validate-asset-links}.mjs
```

改动其中任何一个都会让 `preflight` 失败。**不要手工刷新哈希**——请在 `pet-spec.json` 或环境变量层面配置，
或通过正式的工程迁移流程重建项目。`README.md`、`src/renderer/**`、`pet-spec.json`、`incoming-assets/` 不在保护列表内，可自由修改。

**Q：提示「Development or another build is active」？**
A：`tools/activity-lock.mjs` 会阻止开发预览与构建并发。若确认没有进程在跑（例如上次被强杀），
删除 `.build/activity.lock` 即可；脚本在检测到持有者进程已死时也会自动回收并记录到 `.build/stale-locks.jsonl`。

**Q：打包很慢或超时？**
A：`pet-spec.json` 的 `build.timeoutMinutes`（默认 20）是硬上限。首次构建需下载 Electron；
若本地已有缓存 zip，可用 `PET_ELECTRON_ZIP_DIR` 指向缓存目录，构建脚本会用官方 `checksums.json` 校验后复用。

**Q：为什么找不到 `out/` 和 `release/`？**
A：`.gitignore` 已忽略 `node_modules/`、`.webpack/`、`.build/`、`out/`、`release/`、`qa/*`（仅保留 `qa/manual-checklist.md`）。
这些构建产物都不会进版本库；`collect-release.mjs` 每次还会先清空 `release/` 再写入。

**Q：Node 版本报错？**
A：Forge 打包要求 **Node < 25**。若本机是 25/26，设置 `PET_BUILD_NODE` 指向一个 20.12–24 的 Node 可执行文件即可。

### 素材相关

**Q：素材 QA 失败怎么排查？**
A：报告在 `qa/assets-report.json`，每个失败帧都带稳定诊断码与修复建议，例如
`SUBJECT_TOUCHES_BORDER`（主体被裁切，必须重新生成，补边无法复原）、`GROUND_RESIDUE`（残留地面/阴影）、
`ANCHOR_DRIFT`（锚点漂移）、`SCALE_DRIFT`（跨帧比例漂移）、`DUPLICATE_FRAME`（复制帧不算动画）、
`SOLID_BLOCK`（抠图没分离出主体）。同时打开 `qa/contact-sheet.png` 目视复核。

**Q：`REGRESSION_FIXTURE_ONLY.txt` 是什么？**
A：素材 QA 的回归夹具开关。创建该文件会把部分阻塞级诊断降级为警告，**仅供回归测试使用**，
正式交付前必须删除，否则会掩盖真实缺陷。

**Q：`qa:assets` 报「unusedAssets」？**
A：`src/assets/pet/` 下存在未被 `pet-spec.json` 引用的 PNG。要么在 `states[].frames` 中引用，
要么删除该文件；`validate-asset-links.mjs` 还会检查 Mac/Windows 之间的大小写一致性。

### 许可证相关

**Q：可以用这个项目做商业产品吗？会不会有传染性？**
A：可以商用。Apache 2.0 是宽松型（permissive）许可证，**不具备 GPL 式的传染性**——你可以把本项目
（含修改后的版本）闭源集成进商业产品，只需保留 `LICENSE` 全文、在修改过的文件上标注「已修改」、
并保留原有的版权与署名声明。详见「九、许可证」。

**Q：为什么 `package.json` 里写的还是 `UNLICENSED`？**
A：那是历史遗留的 npm 元数据。**本项目实际以 Apache 2.0 授权，以 `LICENSE` 与本文档为准。**
该字段未同步修改，是因为 `package.json` / `package-lock.json` 属于受保护文件，直接改动会让哈希门禁失败——
详见「常见问题 → 为什么改了文件就报『protected template infrastructure changed』」。

### 交付前检查

- `npm run check` 全绿
- `npm run doctor` 通过
- 按 `qa/manual-checklist.md` 在目标机型真人验收（DPI 缩放、多屏、负坐标显示器、联系表逐状态入口）
- `release/manifest.json` 中的版本、架构、模式、字节数与 SHA-256 与实际文件一致
- 已明确告知最终用户「未签名」这一事实
- 分发产物中已随附 `LICENSE` 全文，以及 Electron / Chromium / Node.js 等第三方组件的许可证文本
- 对源文件的修改已按要求标注「已修改」（Apache 2.0 第 4(b) 条）

---

## 九、许可证

本项目采用 **Apache License 2.0** 开源发布。

| 项 | 值 |
|----|-----|
| 许可证类型 | Apache License, Version 2.0（January 2004） |
| SPDX 标识符 | `Apache-2.0` |
| 版权所有者 | Copyright 2026 **hermanrous** |
| 许可证全文 | [`LICENSE`](LICENSE)（Apache 2.0 官方原文，未作任何修改） |
| 官方地址 | <https://www.apache.org/licenses/LICENSE-2.0> |

### 授予你的权利

Apache 2.0 授予你一项**永久的、全球范围的、非排他的、免费的、不可撤销**的授权：

| 权利 | 说明 |
|------|------|
| 商业使用 | 可用于商业产品与服务，无需支付版税或授权费 |
| 修改 | 可自由修改源码、制作衍生作品 |
| 分发 | 可以源码形式或目标（编译后）形式再分发 |
| 私人使用 | 可内部私有使用，无开源回馈义务（无传染性） |
| 专利授权 | 每位贡献者同时授予其必要专利的实施许可 |
| 附加条款 | 可对自己的修改附加不同的许可条款 |
| 再许可 | 可将本项目置于其他许可证下再许可（sublicense） |

### 你必须遵守的义务

| 义务 | 具体要求 | 条款 |
|------|----------|------|
| 保留许可证 | 任何再分发（无论源码还是二进制）都必须附带 Apache 2.0 全文，即保留 `LICENSE` 文件 | 第 4(a) 条 |
| 标注修改 | 被修改过的文件必须带有醒目的「已修改」说明 | 第 4(b) 条 |
| 保留声明 | 必须保留源码中全部版权、专利、商标与署名声明 | 第 4(c) 条 |
| 保留 NOTICE | 分发物若含 `NOTICE` 文件则须一并保留其中署名信息（本项目当前**不含** `NOTICE` 文件） | 第 4(d) 条 |
| 专利终止 | 若你发起专利诉讼主张本项目构成专利侵权，你已获得的专利许可将自起诉之日起终止 | 第 3 条 |
| 商标除外 | 本许可证**不授予**任何商标、商品名、服务标记或产品名的使用权 | 第 6 条 |

### 无担保与责任限制

本项目按 **"AS IS"（现状）** 基础提供，不附带任何明示或默示担保，包括但不限于所有权、非侵权、适销性
及特定用途适用性的担保。在任何情况下（无论基于合同、侵权或其他法律理论），作者与贡献者均不对因使用或
无法使用本项目而产生的任何直接、间接、特殊、附带或后果性损害承担责任——包括但不限于商誉损失、停工、
计算机故障或其他商业损害。具体条款以 `LICENSE` 第 7 条（免责声明）与第 8 条（责任限制）为准。

### 第三方组件

本项目的**分发产物**包含第三方开源组件，其许可证独立于本项目，署名与许可保留要求由各自许可证规定：

| 组件 | 许可证 | 说明 |
|------|--------|------|
| Electron（含 Chromium、Node.js） | MIT（Chromium 为 BSD 系多重许可） | 随打包产物分发，必须保留其许可证文本 |
| Sharp | Apache-2.0 | 图像处理，构建期使用 |
| TypeScript | Apache-2.0 | 编译期使用 |
| Webpack / Electron Forge / ts-loader 等 | MIT | 构建期使用 |

依赖树中直接依赖以 MIT 与 Apache-2.0 为主；另有 ISC、BSD-2/3-Clause、Unlicense、CC0 等宽松许可。
`sharp` 附带的 `@img/sharp-libvips-*` 二进制为 LGPL-3.0-or-later，但**均为 devDependency，
仅在构建期处理素材时使用，不会被打包进分发产物**。

完整清单与各包许可证以 `package-lock.json` 中每个依赖的 `license` 字段为准
（其中 `parse-color` 的嵌套依赖 `color-convert@0.5.3` 未声明 license 字段，属构建期 dev 依赖）。

> **分发提醒**：Electron 官方建议在分发产物中同时附带 `LICENSE` 与 `LICENSES.chromium.html`。
> 若你在此基础上新增 `NOTICE` 文件，请在分发时一并保留。

### 关于 npm 元数据的说明

`package.json` 与 `package-lock.json` 中目前仍保留 `"license": "UNLICENSED"`（且 `package.json` 带有
`"private": true`）。**本项目实际以 Apache 2.0 授权，以 [`LICENSE`](LICENSE) 与本章节为准。**

该字段未同步修改是刻意的：这两个文件在 `.doubao-pet-builder.json` 的受保护文件哈希名单内，
直接修改会导致 `npm run preflight`、`npm run dev` 与打包门禁全部失败
（见「常见问题 → 为什么改了文件就报『protected template infrastructure changed』」）。
若确需让 npm 元数据与许可证一致，请走工程迁移流程更新哈希白名单，**不要手工刷新哈希**。
