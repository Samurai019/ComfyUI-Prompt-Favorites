/**
 * 收藏数据存储服务
 * 通过后端 API 读写项目目录下的 data/favorites.json
 * 前端维护内存缓存，写入时异步同步到后端文件
 */

import { logger } from '../utils/logger.js';

const SCHEMA_VERSION = 1;

// 后端 API 路径（与 server.py 中注册的路由一致）
// 使用相对路径，由 ComfyUI 前端代理转发
const API_BASE = './ComfyUI-Prompt-Favorites/api';

class FavoritesStore {
    constructor() {
        this._cache = null;
        this._listeners = new Set();
        this._loaded = false;
        this._saveTimer = null;
        this._saving = false;
    }

    /**
     * 从后端加载数据
     */
    async _load() {
        if (this._cache) return this._cache;
        try {
            const resp = await fetch(`${API_BASE}/favorites`);
            const json = await resp.json();
            if (json.success && json.data) {
                this._cache = json.data;
                this._loaded = true;
                return this._cache;
            }
        } catch (e) {
            logger.error(`从后端加载收藏数据失败: ${e.message}`);
        }
        // 降级：使用默认数据
        this._cache = this._defaultData();
        this._loaded = true;
        return this._cache;
    }

    _defaultData() {
        return {
            version: SCHEMA_VERSION,
            folders: [
                { id: 'default', name: '默认收藏夹', createdAt: Date.now(), order: 0 }
            ],
            favorites: []
        };
    }

    /**
     * 异步保存到后端文件（防抖 500ms）
     */
    _scheduleSave() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._save(), 500);
    }

    async _save() {
        if (this._saving || !this._cache) return;
        this._saving = true;
        try {
            const resp = await fetch(`${API_BASE}/favorites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: this._cache })
            });
            const json = await resp.json();
            if (!json.success) {
                logger.error(`保存收藏数据失败: ${json.error || '未知错误'}`);
            }
        } catch (e) {
            logger.error(`保存收藏数据到后端失败: ${e.message}`);
        } finally {
            this._saving = false;
        }
    }

    _notify() {
        this._listeners.forEach(fn => {
            try { fn(this._cache); } catch (e) {}
        });
    }

    /**
     * 确保数据已加载（所有公开方法调用前需 await）
     */
    async ensureLoaded() {
        if (!this._loaded) await this._load();
        return this._cache;
    }

    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    /**
     * 以下 getter 方法从内存缓存同步读取（调用前需确保 ensureLoaded 已完成）
     */
    getAll() {
        return this._cache;
    }

    getFolders() {
        if (!this._cache) return [];
        return this._cache.folders.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    getFavorites(folderId = null) {
        if (!this._cache) return [];
        const all = this._cache.favorites;
        if (folderId === null) return all.slice();
        return all.filter(f => f.folderId === folderId);
    }

    _genId() {
        return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    /**
     * 写操作：同步修改缓存 + 异步保存到后端 + 通知监听器
     */
    addFolder(name) {
        const folder = {
            id: this._genId(),
            name: name.trim() || '新建收藏夹',
            createdAt: Date.now(),
            order: this._cache.folders.length
        };
        this._cache.folders.push(folder);
        this._scheduleSave();
        this._notify();
        return folder;
    }

    renameFolder(folderId, newName) {
        const folder = this._cache.folders.find(f => f.id === folderId);
        if (folder) {
            folder.name = newName.trim() || folder.name;
            this._scheduleSave();
            this._notify();
            return folder;
        }
        return null;
    }

    deleteFolder(folderId) {
        if (folderId === 'default') {
            this._cache.favorites = this._cache.favorites.filter(f => f.folderId !== folderId);
            this._scheduleSave();
            this._notify();
            return true;
        }
        this._cache.favorites.forEach(f => {
            if (f.folderId === folderId) f.folderId = 'default';
        });
        this._cache.folders = this._cache.folders.filter(f => f.id !== folderId);
        this._scheduleSave();
        this._notify();
        return true;
    }

    addFavorite(content, name, folderId = 'default') {
        const fav = {
            id: this._genId(),
            folderId,
            name: (name && name.trim()) ? name.trim() : content.slice(0, 20),
            content,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this._cache.favorites.push(fav);
        this._scheduleSave();
        this._notify();
        return fav;
    }

    renameFavorite(favId, newName) {
        const fav = this._cache.favorites.find(f => f.id === favId);
        if (fav) {
            fav.name = newName.trim() || fav.name;
            fav.updatedAt = Date.now();
            this._scheduleSave();
            this._notify();
            return fav;
        }
        return null;
    }

    updateFavoriteContent(favId, newContent) {
        const fav = this._cache.favorites.find(f => f.id === favId);
        if (fav) {
            fav.content = newContent;
            fav.updatedAt = Date.now();
            this._scheduleSave();
            this._notify();
            return fav;
        }
        return null;
    }

    deleteFavorite(favId) {
        this._cache.favorites = this._cache.favorites.filter(f => f.id !== favId);
        this._scheduleSave();
        this._notify();
        return true;
    }

    moveFavorite(favId, targetFolderId) {
        const fav = this._cache.favorites.find(f => f.id === favId);
        if (fav && fav.folderId !== targetFolderId) {
            fav.folderId = targetFolderId;
            fav.updatedAt = Date.now();
            this._scheduleSave();
            this._notify();
            return fav;
        }
        return null;
    }
}

const favoritesStore = new FavoritesStore();
export { favoritesStore, FavoritesStore };
