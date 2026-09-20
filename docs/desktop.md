# Electron 桌面版与存档

## 开发与构建

需要 Node.js 22.12+。首次运行或打包时会按需下载固定版本的 Electron；网页端继续使用 `npm run dev`。

```powershell
npm ci
npm run desktop:dev
```

桌面开发服务器从 `127.0.0.1:5174` 开始选择空闲端口，退出桌面窗口时同时关闭该服务器。F11 切换全屏；开发版 F12 打开开发者工具。

```powershell
npm run desktop:pack
npm run desktop:start
npm run desktop:dist
```

- `desktop:pack`：构建网页资源和 Windows x64 程序，入口为 `release/win-unpacked/Charset.exe`。运行时需要保留整个目录，不能只复制 exe。
- `desktop:start`：用 Electron 运行已有的 `dist/`，不启动 Vite；资源更新后需要重新构建。
- `desktop:dist`：构建 Windows x64 NSIS 安装包，输出 `release/Charset-0.1.0-Windows-x64-Setup.exe`。不自动发布或上传。

桌面版固定使用 `charset://game/index.html` 加载安装目录内资源，更新程序或换安装路径不会改变存档来源。渲染进程启用沙箱、上下文隔离与 CSP，不能使用 Node.js；导入导出仅通过原生文件选择窗口访问用户选定的文件。

## 存档

主菜单的“存档”支持导出和导入 JSON 文件，包含：

- 通关、字符与槽位解锁、已见敌怪、无尽最高纪录。
- 各无尽关卡的续玩战场。
- 上次选卡、语言、快捷键和调试设置。

导入会先校验格式与战场数据，再询问是否覆盖。确认后整体替换上述内容，未包含的项目恢复默认，不与旧进度合并。写入前保留恢复记录，失败或导入中断会回滚。文件过大、版本不支持或数据损坏时拒绝导入。

网页、开发版和正式桌面版的存档相互独立，可使用同一种 JSON 文件迁移。正式版用户数据在 `%APPDATA%/Charset`，开发版在 `%APPDATA%/Charset Dev`；内部仍使用 Chromium 本地存储，不要直接编辑数据库文件。

关闭桌面窗口会先保存正在进行的无尽战场，再退出；保存失败会保留窗口，超时会询问是否放弃保存。主线关卡仍只保存进度，不提供战斗中途续玩。卸载默认保留用户数据。

## 发布边界

当前完成 Windows 桌面运行与本地安装包，尚未接入 Steamworks、Steam 云存档、自动更新或代码签名。安装包暂用 Electron 默认图标。正式发布前需要设置图标、版本、签名和 Steam depot 启动项；`release/win-unpacked` 可作为 Windows depot 内容的基础。

固定 Electron 可统一 Chromium/V8 运行时，但不能代替联机协议与回放兼容校验。战斗继续使用现有固定步长、随机种子和操作记录；升级运行时或战斗规则后仍需做确定性回归。

## 检查命令

```powershell
npm run test:rules
npm run validate
npm run build
```

规则测试包含存档校验、覆盖失败回滚、中断恢复、桌面导航限制与资源路径检查。`CHARSET_USER_DATA` 可指定独立测试数据目录，`CHARSET_TEST=1` 可隐藏自动化测试窗口；开发地址仅接受本机 HTTP，正式包忽略 `CHARSET_DEV_URL`。
