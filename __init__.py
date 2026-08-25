"""
ComfyUI-Prompt-Favorites
文本收藏夹插件 - 在文本类节点的左下角植入收藏按钮

收藏数据持久化到项目目录下的 data/favorites.json。
"""

from . import server  # 注册后端 API 路由

WEB_DIRECTORY = "./js"
NODE_CLASS_MAPPINGS = {}

__version__ = "1.1.0"

print(f"✨ 文本收藏夹 (Prompt Favorites) V{__version__} 已启动")
