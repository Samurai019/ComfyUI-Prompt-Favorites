/**
 * 收藏夹面板
 * 点击收藏按钮后弹出，展示所有收藏夹和收藏项
 * 支持：收藏当前文本/使用收藏/命名/删除/建收藏夹/移动收藏
 */

import { app } from "../../../scripts/app.js";
import { favoritesStore } from '../services/favoritesStore.js';
import { promptFavorites } from './PromptFavorites.js';
import { EventManager } from '../utils/eventManager.js';
import { logger } from '../utils/logger.js';
import { FAVORITE_ICON_SVG } from './AssistantContainer.js';

class FavoritesPanel {
    constructor() {
        this.activePanel = null;
        this.activeContext = null; // { node, widget, inputEl, textarea, containerInfo }
        this._currentFolderId = 'default';
        this._searchKeyword = '';
        this._unsubscribe = null;
        this._cleanupFunctions = [];
        this._outsideClickHandler = null;
        this._escHandler = null;
    }

    /**
     * 打开面板
     * @param {Object} context - { node, widget, inputEl, textarea, containerInfo, anchorButton }
     */
    async open(context) {
        // 如果已有面板打开，先关闭
        if (this.activePanel) {
            this.close();
            return;
        }

        this.activeContext = context;

        // 先确保数据已从后端加载
        await favoritesStore.ensureLoaded();

        const panel = this._buildPanel();
        this.activePanel = panel;

        // 定位
        this._positionPanel(panel, context.anchorButton);

        document.body.appendChild(panel);

        // 【关键】立即渲染面板内容（侧栏、收藏列表、底栏）
        this._render();

        // 触发动画
        requestAnimationFrame(() => {
            panel.classList.add('pf-panel-visible');
        });

        // 监听数据变化（后续 add/delete/rename 等操作会自动触发重渲染）
        this._unsubscribe = favoritesStore.subscribe(() => this._render());

        // 关闭事件
        this._setupCloseEvents(panel);

        // 聚焦搜索框
        setTimeout(() => {
            const search = panel.querySelector('.pf-panel-search-input');
            if (search) search.focus();
        }, 100);
    }

    close() {
        if (!this.activePanel) return;
        const panel = this.activePanel;
        this.activePanel = null;

        // 移除事件
        if (this._outsideClickHandler) {
            document.removeEventListener('mousedown', this._outsideClickHandler);
            this._outsideClickHandler = null;
        }
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        this._cleanupFunctions.forEach(fn => { try { fn(); } catch (e) {} });
        this._cleanupFunctions = [];

        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }

        // 关闭动画
        panel.classList.remove('pf-panel-visible');
        panel.classList.add('pf-panel-closing');
        setTimeout(() => {
            if (panel.parentNode) panel.parentNode.removeChild(panel);
        }, 200);

        this.activeContext = null;

        // 【关键】面板关闭后，强制折叠所有展开的悬浮按钮，回到待机状态
        // 解决：从画布/其他地方关闭面板时，按钮不会自动收起的问题
        promptFavorites.collapseAllInstances();
    }

    isOpen() {
        return this.activePanel !== null;
    }

    // ========== 面板构建 ==========

    _buildPanel() {
        const panel = document.createElement('div');
        panel.className = 'pf-panel popup_container';

        // 标题栏
        const titleBar = document.createElement('div');
        titleBar.className = 'pf-panel-title-bar popup_title_bar';

        const title = document.createElement('div');
        title.className = 'pf-panel-title popup_title';
        title.textContent = '文本收藏夹';

        // 搜索框
        const searchContainer = document.createElement('div');
        searchContainer.className = 'pf-panel-search-container popup_search_container';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'pf-panel-search-input popup_search_input';
        searchInput.placeholder = '搜索收藏...';
        searchInput.addEventListener('input', (e) => {
            this._searchKeyword = e.target.value.trim().toLowerCase();
            this._renderFavoritesList();
        });
        searchContainer.appendChild(searchInput);

        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.className = 'pf-panel-btn popup_btn';
        closeBtn.title = '关闭';
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        closeBtn.addEventListener('click', () => this.close());

        titleBar.appendChild(title);
        titleBar.appendChild(searchContainer);
        titleBar.appendChild(closeBtn);
        panel.appendChild(titleBar);

        // 主体区域：左侧收藏夹栏 + 右侧收藏项列表
        const body = document.createElement('div');
        body.className = 'pf-panel-body';

        // 左侧收藏夹栏
        const sidebar = document.createElement('div');
        sidebar.className = 'pf-panel-sidebar';
        body.appendChild(sidebar);

        // 右侧收藏项列表
        const main = document.createElement('div');
        main.className = 'pf-panel-main';
        body.appendChild(main);

        panel.appendChild(body);

        // 底部操作栏
        const footer = document.createElement('div');
        footer.className = 'pf-panel-footer';
        panel.appendChild(footer);

        return panel;
    }

    _render() {
        if (!this.activePanel) return;
        this._renderSidebar();
        this._renderFavoritesList();
        this._renderFooter();
    }

    _renderSidebar() {
        const sidebar = this.activePanel.querySelector('.pf-panel-sidebar');
        if (!sidebar) return;
        sidebar.innerHTML = '';

        const folders = favoritesStore.getFolders();

        folders.forEach(folder => {
            const item = document.createElement('div');
            item.className = 'pf-folder-item';
            if (folder.id === this._currentFolderId) item.classList.add('pf-folder-active');

            const count = favoritesStore.getFavorites(folder.id).length;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'pf-folder-name';
            nameSpan.textContent = folder.name;
            const countSpan = document.createElement('span');
            countSpan.className = 'pf-folder-count';
            countSpan.textContent = count;

            item.appendChild(nameSpan);
            item.appendChild(countSpan);

            item.addEventListener('click', () => {
                this._currentFolderId = folder.id;
                this._render();
            });

            // 右键菜单：重命名/删除收藏夹
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showFolderContextMenu(e, folder);
            });

            sidebar.appendChild(item);
        });

        // 新建收藏夹按钮
        const addBtn = document.createElement('button');
        addBtn.className = 'pf-folder-add-btn';
        addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg><span>新建收藏夹</span>';
        addBtn.addEventListener('click', () => this._promptAddFolder());
        sidebar.appendChild(addBtn);
    }

    _renderFavoritesList() {
        const main = this.activePanel.querySelector('.pf-panel-main');
        if (!main) return;
        main.innerHTML = '';

        const favorites = favoritesStore.getFavorites(this._currentFolderId);
        const keyword = this._searchKeyword;

        const filtered = keyword
            ? favorites.filter(f =>
                f.name.toLowerCase().includes(keyword) || f.content.toLowerCase().includes(keyword))
            : favorites;

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'pf-empty-state';
            empty.innerHTML = `<div class="pf-empty-icon">${FAVORITE_ICON_SVG}</div><div class="pf-empty-text">${keyword ? '没有匹配的收藏' : '当前收藏夹为空'}</div><div class="pf-empty-hint">${keyword ? '试试其他关键词' : '点击底部"收藏当前文本"按钮添加'}</div>`;
            main.appendChild(empty);
            return;
        }

        filtered.forEach(fav => {
            const card = document.createElement('div');
            card.className = 'pf-fav-card';

            const header = document.createElement('div');
            header.className = 'pf-fav-header';

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'pf-fav-name';
            nameInput.value = fav.name;
            nameInput.title = '点击编辑名称';
            nameInput.addEventListener('change', () => {
                const newName = nameInput.value.trim();
                if (newName && newName !== fav.name) {
                    favoritesStore.renameFavorite(fav.id, newName);
                } else {
                    nameInput.value = fav.name;
                }
            });
            nameInput.addEventListener('click', (e) => e.stopPropagation());

            const actions = document.createElement('div');
            actions.className = 'pf-fav-actions';

            // 使用按钮
            const useBtn = document.createElement('button');
            useBtn.className = 'pf-fav-action-btn';
            useBtn.title = '使用此收藏（替换当前文本）';
            useBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
            useBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._useFavorite(fav);
            });

            // 移动按钮
            const moveBtn = document.createElement('button');
            moveBtn.className = 'pf-fav-action-btn';
            moveBtn.title = '移动到其他收藏夹';
            moveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 9v-2h4v2h-4zm0-4V7h4v4h-4z"/></svg>';
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._showMoveMenu(e, fav);
            });

            // 删除按钮
            const delBtn = document.createElement('button');
            delBtn.className = 'pf-fav-action-btn pf-fav-action-danger';
            delBtn.title = '删除';
            delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDelete(fav);
            });

            actions.appendChild(useBtn);
            actions.appendChild(moveBtn);
            actions.appendChild(delBtn);

            header.appendChild(nameInput);
            header.appendChild(actions);
            card.appendChild(header);

            // 内容预览
            const content = document.createElement('div');
            content.className = 'pf-fav-content';
            content.textContent = fav.content;
            content.title = '点击使用此收藏';
            content.addEventListener('click', () => this._useFavorite(fav));
            card.appendChild(content);

            // 时间
            const meta = document.createElement('div');
            meta.className = 'pf-fav-meta';
            const date = new Date(fav.updatedAt || fav.createdAt);
            meta.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
            card.appendChild(meta);

            main.appendChild(card);
        });
    }

    _renderFooter() {
        const footer = this.activePanel.querySelector('.pf-panel-footer');
        if (!footer) return;
        footer.innerHTML = '';

        // 收藏当前文本按钮
        const addCurrentBtn = document.createElement('button');
        addCurrentBtn.className = 'pf-footer-btn pf-footer-btn-primary';
        addCurrentBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg><span>收藏当前文本</span>';
        addCurrentBtn.addEventListener('click', () => this._addCurrentText());
        footer.appendChild(addCurrentBtn);

        const hint = document.createElement('div');
        hint.className = 'pf-footer-hint';
        hint.textContent = '双击收藏卡片或点击对勾按钮可填入文本框';
        footer.appendChild(hint);
    }

    // ========== 定位 ==========

    _positionPanel(panel, anchorButton) {
        if (!anchorButton) {
            panel.style.left = '50%';
            panel.style.top = '50%';
            panel.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const btnRect = anchorButton.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        // 先临时挂载测量尺寸
        panel.style.visibility = 'hidden';
        panel.style.display = 'flex';
        document.body.appendChild(panel);
        void panel.offsetWidth;
        const panelRect = panel.getBoundingClientRect();
        document.body.removeChild(panel);
        panel.style.visibility = 'visible';

        // 垂直：优先显示在按钮上方（因为按钮在左下角）
        const spaceAbove = btnRect.top;
        const showAbove = spaceAbove >= panelRect.height || spaceAbove > (viewportH - btnRect.bottom);

        if (showAbove) {
            panel.style.top = `${btnRect.top - panelRect.height}px`;
            panel.classList.add('pf-panel-up');
        } else {
            panel.style.top = `${btnRect.bottom}px`;
            panel.classList.add('pf-panel-down');
        }

        // 水平：左对齐按钮
        let left = btnRect.left;
        if (left + panelRect.width > viewportW - 8) {
            left = viewportW - panelRect.width - 8;
        }
        if (left < 8) left = 8;
        panel.style.left = `${left}px`;
    }

    // ========== 关闭事件 ==========

    _setupCloseEvents(panel) {
        this._outsideClickHandler = (e) => {
            if (!panel.isConnected) {
                document.removeEventListener('mousedown', this._outsideClickHandler);
                return;
            }
            if (panel.contains(e.target)) return;
            // 点击锚按钮不关闭（防止重复开关）
            if (this.activeContext?.anchorButton?.contains(e.target)) return;
            // 点击其他悬浮按钮容器
            if (e.target.closest('.pf-assistant-container')) return;
            // 点击右键菜单/确认框
            if (e.target.closest('.pf-context-menu') || e.target.closest('.pf-confirm-dialog')) return;
            this.close();
        };
        document.addEventListener('mousedown', this._outsideClickHandler);

        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                if (document.querySelector('.pf-context-menu') || document.querySelector('.pf-confirm-dialog')) return;
                this.close();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    // ========== 收藏操作 ==========

    _getCurrentText() {
        const ctx = this.activeContext;
        if (!ctx) return '';
        const el = ctx.textarea || ctx.inputEl;
        if (!el) return '';
        return el.value || '';
    }

    _addCurrentText() {
        const text = this._getCurrentText();
        if (!text.trim()) {
            this._toast('当前文本框为空，无法收藏', 'warn');
            return;
        }
        const fav = favoritesStore.addFavorite(text, '', this._currentFolderId);
        this._toast(`已收藏到「${this._getFolderName(this._currentFolderId)}」`, 'success');
        // 数据变化会自动触发 _render
    }

    _useFavorite(fav) {
        const ctx = this.activeContext;
        if (!ctx) return;
        const el = ctx.textarea || ctx.inputEl;
        if (!el) return;

        // 写入文本框
        el.value = fav.content;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // 同步到 ComfyUI widget
        if (ctx.widget) {
            try {
                if (typeof ctx.widget.callback === 'function') {
                    ctx.widget.callback(fav.content);
                }
                if (ctx.widget.value !== undefined) {
                    ctx.widget.value = fav.content;
                }
            } catch (e) {}
        }

        // 高亮反馈
        el.classList.add('pf-input-highlight');
        setTimeout(() => el.classList.remove('pf-input-highlight'), 600);

        this._toast(`已填入「${fav.name}」`, 'success');
    }

    _confirmDelete(fav) {
        const dialog = document.createElement('div');
        dialog.className = 'pf-confirm-dialog';
        dialog.innerHTML = `
            <div class="pf-confirm-content">
                <div class="pf-confirm-title">删除收藏</div>
                <div class="pf-confirm-msg">确定要删除「${this._escapeHtml(fav.name)}」吗？此操作不可撤销。</div>
                <div class="pf-confirm-actions">
                    <button class="pf-confirm-btn pf-confirm-cancel">取消</button>
                    <button class="pf-confirm-btn pf-confirm-ok">删除</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        requestAnimationFrame(() => dialog.classList.add('pf-confirm-visible'));

        const close = () => {
            dialog.classList.remove('pf-confirm-visible');
            setTimeout(() => { if (dialog.parentNode) dialog.parentNode.removeChild(dialog); }, 200);
        };
        dialog.querySelector('.pf-confirm-cancel').addEventListener('click', close);
        dialog.querySelector('.pf-confirm-ok').addEventListener('click', () => {
            favoritesStore.deleteFavorite(fav.id);
            this._toast('已删除', 'success');
            close();
        });
        dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    }

    _promptAddFolder() {
        const dialog = this._showInputDialog('新建收藏夹', '请输入收藏夹名称', '', (name) => {
            if (name && name.trim()) {
                const folder = favoritesStore.addFolder(name);
                this._currentFolderId = folder.id;
                this._render();
                this._toast(`已创建「${folder.name}」`, 'success');
            }
        });
    }

    _showFolderContextMenu(e, folder) {
        this._hideContextMenu();
        const menu = document.createElement('div');
        menu.className = 'pf-context-menu';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        const renameItem = document.createElement('div');
        renameItem.className = 'pf-context-menu-item';
        renameItem.textContent = '重命名';
        renameItem.addEventListener('click', () => {
            this._hideContextMenu();
            this._showInputDialog('重命名收藏夹', '请输入新名称', folder.name, (name) => {
                if (name && name.trim() && name !== folder.name) {
                    favoritesStore.renameFolder(folder.id, name);
                    this._render();
                    this._toast('已重命名', 'success');
                }
            });
        });

        const deleteItem = document.createElement('div');
        deleteItem.className = 'pf-context-menu-item pf-context-menu-danger';
        deleteItem.textContent = folder.id === 'default' ? '清空收藏夹' : '删除收藏夹';
        deleteItem.addEventListener('click', () => {
            this._hideContextMenu();
            this._confirmDeleteFolder(folder);
        });

        menu.appendChild(renameItem);
        menu.appendChild(deleteItem);
        document.body.appendChild(menu);

        // 防止超出边界
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
            menu.style.left = `${window.innerWidth - rect.width - 8}px`;
        }
        if (rect.bottom > window.innerHeight - 8) {
            menu.style.top = `${window.innerHeight - rect.height - 8}px`;
        }

        setTimeout(() => {
            const handler = (ev) => {
                if (!menu.contains(ev.target)) this._hideContextMenu();
                document.removeEventListener('mousedown', handler);
            };
            document.addEventListener('mousedown', handler);
        }, 0);
    }

    _confirmDeleteFolder(folder) {
        const isDefault = folder.id === 'default';
        const msg = isDefault
            ? '确定要清空「默认收藏夹」吗？所有收藏项将被删除，此操作不可撤销。'
            : `确定要删除收藏夹「${this._escapeHtml(folder.name)}」吗？其中的收藏项将移至默认收藏夹。`;
        const dialog = document.createElement('div');
        dialog.className = 'pf-confirm-dialog';
        dialog.innerHTML = `
            <div class="pf-confirm-content">
                <div class="pf-confirm-title">${isDefault ? '清空收藏夹' : '删除收藏夹'}</div>
                <div class="pf-confirm-msg">${msg}</div>
                <div class="pf-confirm-actions">
                    <button class="pf-confirm-btn pf-confirm-cancel">取消</button>
                    <button class="pf-confirm-btn pf-confirm-ok">${isDefault ? '清空' : '删除'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        requestAnimationFrame(() => dialog.classList.add('pf-confirm-visible'));
        const close = () => {
            dialog.classList.remove('pf-confirm-visible');
            setTimeout(() => { if (dialog.parentNode) dialog.parentNode.removeChild(dialog); }, 200);
        };
        dialog.querySelector('.pf-confirm-cancel').addEventListener('click', close);
        dialog.querySelector('.pf-confirm-ok').addEventListener('click', () => {
            favoritesStore.deleteFolder(folder.id);
            if (this._currentFolderId === folder.id) this._currentFolderId = 'default';
            this._render();
            this._toast(isDefault ? '已清空' : '已删除', 'success');
            close();
        });
        dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    }

    _showMoveMenu(e, fav) {
        this._hideContextMenu();
        const menu = document.createElement('div');
        menu.className = 'pf-context-menu';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        const title = document.createElement('div');
        title.className = 'pf-context-menu-title';
        title.textContent = '移动到...';
        menu.appendChild(title);

        const folders = favoritesStore.getFolders();
        folders.forEach(folder => {
            if (folder.id === fav.folderId) return;
            const item = document.createElement('div');
            item.className = 'pf-context-menu-item';
            item.textContent = folder.name;
            item.addEventListener('click', () => {
                favoritesStore.moveFavorite(fav.id, folder.id);
                this._hideContextMenu();
                this._render();
                this._toast(`已移动到「${folder.name}」`, 'success');
            });
            menu.appendChild(item);
        });

        if (menu.children.length <= 1) {
            const empty = document.createElement('div');
            empty.className = 'pf-context-menu-empty';
            empty.textContent = '没有其他收藏夹';
            menu.appendChild(empty);
        }

        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
        if (rect.bottom > window.innerHeight - 8) menu.style.top = `${window.innerHeight - rect.height - 8}px`;

        setTimeout(() => {
            const handler = (ev) => {
                if (!menu.contains(ev.target)) this._hideContextMenu();
                document.removeEventListener('mousedown', handler);
            };
            document.addEventListener('mousedown', handler);
        }, 0);
    }

    _hideContextMenu() {
        document.querySelectorAll('.pf-context-menu').forEach(m => m.remove());
    }

    _showInputDialog(title, label, defaultValue, onConfirm) {
        const dialog = document.createElement('div');
        dialog.className = 'pf-confirm-dialog';
        dialog.innerHTML = `
            <div class="pf-confirm-content pf-input-dialog-content">
                <div class="pf-confirm-title">${this._escapeHtml(title)}</div>
                <div class="pf-confirm-msg">${this._escapeHtml(label)}</div>
                <input type="text" class="pf-input-dialog-input" value="${this._escapeHtml(defaultValue || '')}" />
                <div class="pf-confirm-actions">
                    <button class="pf-confirm-btn pf-confirm-cancel">取消</button>
                    <button class="pf-confirm-btn pf-confirm-ok">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        requestAnimationFrame(() => dialog.classList.add('pf-confirm-visible'));
        const input = dialog.querySelector('.pf-input-dialog-input');
        setTimeout(() => { input.focus(); input.select(); }, 50);

        const close = () => {
            dialog.classList.remove('pf-confirm-visible');
            setTimeout(() => { if (dialog.parentNode) dialog.parentNode.removeChild(dialog); }, 200);
        };
        const confirm = () => {
            const val = input.value;
            close();
            if (onConfirm) onConfirm(val);
        };
        dialog.querySelector('.pf-confirm-cancel').addEventListener('click', close);
        dialog.querySelector('.pf-confirm-ok').addEventListener('click', confirm);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') close();
        });
        dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
        return dialog;
    }

    // ========== 工具方法 ==========

    _getFolderName(folderId) {
        const f = favoritesStore.getFolders().find(f => f.id === folderId);
        return f ? f.name : '未知';
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    _toast(msg, severity = 'info') {
        try {
            if (app.extensionManager?.toast?.add) {
                app.extensionManager.toast.add({ severity, summary: msg, life: 2500 });
                return;
            }
        } catch (e) {}
        // 降级：控制台
        logger.log(`[${severity}] ${msg}`);
    }
}

const favoritesPanel = new FavoritesPanel();
export { favoritesPanel, FavoritesPanel };
