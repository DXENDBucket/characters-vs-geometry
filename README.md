# 字里行军 / Charset

一个使用 TypeScript + Phaser 3 制作的极简黑白风五路选卡塔防 demo。玩家部署字符单位，对抗圆、三角、正方形和立方体 Boss 等几何敌人。

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物会输出到 `dist/`。项目已配置 GitHub Pages workflow，推送到 `main` 后可通过 GitHub Actions 自动部署。

## 桌面版与存档

```bash
npm run desktop:dev
npm run desktop:dist
```

使用 Electron 开发和打包 Windows x64 桌面版，安装包输出到 `release/`。主菜单的“存档”支持导入、导出进度、无尽战场与设置，网页和桌面版之间也可以迁移。

运行方式、存档位置与发布前准备见 [桌面版说明](docs/desktop.md)。

## 参考资料

- [解锁参考](unlock-reference.md)：初始字符、逐关字符奖励、卡槽、功能及无尽关卡开放条件。
- [性能与重构边界](docs/performance.md)：敌怪索引、共享文字纹理、回归检查与后续拆分方向。
- [塔技能定义](docs/tower-abilities.md)：技力技能的数据归属、复制与升级规则、扩展和回归检查。
- [Boss 技能定义](docs/boss-abilities.md)：技力与阶段初始化、同帧释放顺序、存档兼容和扩展边界。
- `wave-reference.md`：敌人权重、关卡波次、角色属性和难度规则。

## 许可证

All Rights Reserved. 未经许可，不得复制、修改、分发或使用本项目文件。
