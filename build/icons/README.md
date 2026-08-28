# Modbus Client — 4c "收发信标" 图标资源

颜色：瓷白 #F2F4F6 / 琥珀 #FFB224 / 底板 #20262E → #0E1216
网格：1024，笔宽 104，圆头，留白 160。

## 文件

- `icon.svg` — 带底板的矢量母版（改色改这里）
- `icon.png` = `icon-1024.png` — electron-builder 主图标
- `icon-{1024,512,256,128,64,48,32,16}.png` — 完整位图尺寸集
- `icon-transparent-{dark,light}.svg` / `transparent/icon-{dark,light}-{1024,512,256}.png` — 透明背景版（dark 用瓷白笔画，light 用墨色笔画）
- `icon-mono.svg` — 单色版，笔画走 `currentColor`
- `tray/trayTemplate-{16,32,44}.png`、`tray/tray-white-*.png` — 托盘图标（macOS 用 Template 命名，自动跟随明暗）

## electron-builder

放在 `build/` 下并只保留 1024 主图，其余由 builder 生成：

```
build/icon.png        ← icons/icon.png (1024×1024)
build/icon.icns       ← 可由 icon.png 自动生成（macOS）
build/icon.ico        ← 可由 icon.png 自动生成（Windows）
```

```json
{
  "build": {
    "mac":   { "icon": "build/icon.png" },
    "win":   { "icon": "build/icon.png" },
    "linux": { "icon": "build/icon.png", "category": "Development" }
  }
}
```

需要手工生成 icns/ico 时：

```bash
npx png-to-ico icons/icon-256.png > build/icon.ico
npx iconutil-cli icons/icon-1024.png build/icon.icns   # 或使用 macOS iconutil
```

## 托盘（main.js）

```js
const { Tray, nativeImage } = require('electron')
const img = nativeImage.createFromPath('icons/tray/trayTemplate-32.png')
img.setTemplateImage(true)
const tray = new Tray(img)
```
