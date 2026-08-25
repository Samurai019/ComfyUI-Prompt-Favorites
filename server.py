"""
ComfyUI-Prompt-Favorites 后端服务
提供收藏数据的读写 API，数据持久化到项目目录下的 JSON 文件
"""

import os
import json
import asyncio
from aiohttp import web
from server import PromptServer

# 插件目录
NODE_DIR = os.path.dirname(os.path.abspath(__file__))
# 数据文件路径
DATA_DIR = os.path.join(NODE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "favorites.json")

# API 路由前缀（用插件目录名，自动适配重命名）
NODE_DIR_NAME = os.path.basename(NODE_DIR)
API_PREFIX = f"/{NODE_DIR_NAME}/api"

SCHEMA_VERSION = 1

# 文件写入锁，避免并发写冲突
_write_lock = asyncio.Lock()


def _ensure_data_dir():
    """确保数据目录存在"""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)


def _default_data():
    """默认数据结构"""
    return {
        "version": SCHEMA_VERSION,
        "folders": [
            {"id": "default", "name": "默认收藏夹", "createdAt": _now_ms(), "order": 0}
        ],
        "favorites": []
    }


def _now_ms():
    import time
    return int(time.time() * 1000)


def _read_data():
    """读取数据文件"""
    _ensure_data_dir()
    if not os.path.exists(DATA_FILE):
        data = _default_data()
        _write_data_sync(data)
        return data
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if data and data.get("version") == SCHEMA_VERSION:
                return data
            # 版本不匹配，返回默认
            return _default_data()
    except (json.JSONDecodeError, IOError):
        return _default_data()


def _write_data_sync(data):
    """同步写入数据文件"""
    _ensure_data_dir()
    tmp_file = DATA_FILE + ".tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    # 原子替换
    if os.path.exists(DATA_FILE):
        os.replace(tmp_file, DATA_FILE)
    else:
        os.rename(tmp_file, DATA_FILE)


async def _write_data(data):
    """异步写入数据文件（带锁）"""
    async with _write_lock:
        await asyncio.get_event_loop().run_in_executor(None, _write_data_sync, data)


# ====================== API 路由 ======================

@PromptServer.instance.routes.get(f"{API_PREFIX}/favorites")
async def get_favorites(request):
    """获取全部收藏数据"""
    try:
        data = _read_data()
        return web.json_response({"success": True, "data": data})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.post(f"{API_PREFIX}/favorites")
async def save_favorites(request):
    """保存全部收藏数据"""
    try:
        body = await request.json()
        if not body or "data" not in body:
            return web.json_response({"success": False, "error": "缺少 data 字段"}, status=400)

        data = body["data"]
        # 基本校验
        if not isinstance(data, dict) or "folders" not in data or "favorites" not in data:
            return web.json_response({"success": False, "error": "数据格式不正确"}, status=400)

        data["version"] = SCHEMA_VERSION
        await _write_data(data)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get(f"{API_PREFIX}/info")
async def get_info(request):
    """获取插件信息（数据文件路径等）"""
    return web.json_response({
        "success": True,
        "data": {
            "data_file": DATA_FILE,
            "version": SCHEMA_VERSION
        }
    })
