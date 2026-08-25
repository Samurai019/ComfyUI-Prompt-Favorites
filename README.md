# ComfyUI-Prompt-Favorites

文本收藏夹插件 —— 在文本类节点的**左下角**植入一个收藏悬浮按钮，点击弹出收藏面板。

## 功能

- **收藏当前文本**：一键将文本框当前内容收藏到指定收藏夹
- **使用收藏**：点击收藏项将其内容填入文本框（替换）
- **命名收藏**：直接点击收藏名称即可编辑
- **删除收藏**：单个删除，带确认提示
- **多收藏夹**：创建多个收藏夹分类管理
- **移动收藏**：在收藏夹之间移动收藏项
- **搜索**：按名称或内容搜索收藏
- **持久化**：数据存储在后端 `data/favorites.json`，重启不丢失

## 安装

将本目录放入 ComfyUI 的 `custom_nodes/` 文件夹，重启 ComfyUI 即可。

## 使用

1. 任意含多行文本输入框的节点（如 CLIP Text Encode、Note 等）左下角会出现一个星标小图标
2. 鼠标悬停展开，点击星标按钮打开收藏面板
3. 在面板中管理收藏

## 技术实现

- 前端扩展 + 后端 API（无自定义节点），收藏数据经后端持久化到 `data/favorites.json`
- 照搬 ComfyUI-Prompt-Assistant 的节点挂载机制（双渲染模式：LiteGraph / Vue Nodes 2.0）
- 悬浮按钮固定在文本框左下角（`bottom-left-h` 布局）
- 折叠态点击穿透（`pointer-events: none`），悬停展开

## 文件结构

```
ComfyUI-Prompt-Favorites/
├── __init__.py                  # 插件入口，声明 WEB_DIRECTORY
├── server.py                    # 后端服务，提供收藏数据读写 API
├── data/                        # 运行时数据（favorites.json，已 gitignore）
└── js/
    ├── index.js                 # 扩展注册 + 节点生命周期 Hook
    ├── modules/
    │   ├── PromptFavorites.js   # 主逻辑：管理每个节点的实例
    │   ├── AssistantContainer.js# 悬浮按钮容器
    │   └── FavoritesPanel.js    # 收藏面板（弹窗）
    ├── services/
    │   ├── NodeMountService.js  # 节点挂载服务（双渲染模式）
    │   └── favoritesStore.js    # 后端 API 数据层
    ├── utils/
    │   ├── logger.js            # 日志
    │   ├── eventManager.js      # 事件管理
    │   └── styleLoader.js       # CSS 加载器
    └── css/
        ├── assistant.css        # 悬浮按钮样式
        └── panel.css            # 收藏面板样式
```
