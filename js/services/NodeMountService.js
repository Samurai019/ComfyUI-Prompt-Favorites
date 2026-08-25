/**
 * 节点挂载服务 (精简版)
 * 照搬 ComfyUI-Prompt-Assistant 的双渲染模式容器查找逻辑
 */

import { app } from "../../../../scripts/app.js";
import { logger } from '../utils/logger.js';

export const RENDER_MODE = {
    LITEGRAPH: 'litegraph',
    VUE_NODES: 'vue_nodes'
};

class NodeMountService {
    constructor() {
        this._modeCache = null;
        this._modeCacheTime = 0;
        this._modeCacheTTL = 1000;
    }

    detectRenderMode(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && this._modeCache && (now - this._modeCacheTime) < this._modeCacheTTL) {
            return this._modeCache;
        }
        const mode = (typeof LiteGraph !== 'undefined' && LiteGraph.vueNodesMode === true)
            ? RENDER_MODE.VUE_NODES
            : RENDER_MODE.LITEGRAPH;
        this._modeCache = mode;
        this._modeCacheTime = now;
        return mode;
    }

    isVueNodesMode() {
        return this.detectRenderMode() === RENDER_MODE.VUE_NODES;
    }

    _isTextareaWidget(widget) {
        if (!widget) return false;
        let target = widget;
        if (typeof widget.resolveDeepest === 'function') {
            try {
                const deepest = widget.resolveDeepest();
                if (deepest && deepest.widget) target = deepest.widget;
            } catch (e) {}
        }
        if (target.type === 'customtext' || target.type === 'string') return true;
        if (target.type === 'STRING' && target.options?.multiline) return true;
        if (target.element && target.element.tagName === 'TEXTAREA') return true;
        return false;
    }

    _isSubgraphNode(node) {
        if (!node || !node.type) return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.type);
    }

    /**
     * 查找挂载容器（统一入口）
     */
    findMountContainer(node, widget) {
        if (!node || !widget) return null;
        const mode = this.detectRenderMode();
        if (mode === RENDER_MODE.VUE_NODES) {
            return this._findVueNodeContainer(node, widget);
        }
        return this._findDomWidgetContainer(node, widget);
    }

    _findVueNodeContainer(node, widget) {
        try {
            let targetWidget = widget;
            if (typeof widget.resolveDeepest === 'function') {
                try {
                    const deepest = widget.resolveDeepest();
                    if (deepest && deepest.widget) targetWidget = deepest.widget;
                } catch (e) {}
            }

            const nodeContainer = document.querySelector(`[data-node-id="${node.id}"]`);
            if (!nodeContainer) return null;

            const widgetName = targetWidget.name || targetWidget.id || widget.name;
            let textarea = null;

            // 策略1: inputEl 直接引用
            if (targetWidget.inputEl && targetWidget.inputEl.tagName === 'TEXTAREA') {
                if (nodeContainer.contains(targetWidget.inputEl)) {
                    textarea = targetWidget.inputEl;
                }
            }

            // 策略2: 索引匹配
            if (!textarea && node.widgets) {
                let targetIndex = -1;
                let currentIndex = 0;
                for (const w of node.widgets) {
                    if (w.hidden || w.type === 'hidden') continue;
                    if (this._isTextareaWidget(w)) {
                        let wInternal = w;
                        if (typeof w.resolveDeepest === 'function') {
                            try {
                                const d = w.resolveDeepest();
                                if (d && d.widget) wInternal = d.widget;
                            } catch (e) {}
                        }
                        if (w === widget || wInternal === targetWidget) {
                            targetIndex = currentIndex;
                            break;
                        } else if (targetIndex === -1 && w.name && widget.name && w.name === widget.name) {
                            targetIndex = currentIndex;
                        }
                        currentIndex++;
                    }
                }
                if (targetIndex !== -1) {
                    const primeTextareas = Array.from(nodeContainer.querySelectorAll('textarea.p-textarea'));
                    const textareas = primeTextareas.length > 0
                        ? primeTextareas
                        : Array.from(nodeContainer.querySelectorAll('textarea'));
                    if (targetIndex < textareas.length) {
                        textarea = textareas[targetIndex];
                    }
                }
            }

            // 策略3: placeholder/label 模糊匹配
            if (!textarea) {
                const textareas = nodeContainer.querySelectorAll('textarea');
                const searchName = widgetName.toLowerCase().replace(/_/g, ' ');
                for (const ta of textareas) {
                    const ph = (ta.getAttribute('placeholder') || '').toLowerCase();
                    const al = (ta.getAttribute('aria-label') || '').toLowerCase();
                    const lbl = ta.closest('label')?.textContent?.toLowerCase() || '';
                    const fl = ta.parentElement?.querySelector('label')?.textContent?.toLowerCase() || '';
                    if (ph.includes(searchName) || al.includes(searchName) || lbl.includes(searchName) || fl.includes(searchName)) {
                        textarea = ta;
                        break;
                    }
                }
            }

            // 策略4: 唯一 textarea 兜底
            if (!textarea) {
                const textareas = nodeContainer.querySelectorAll('textarea');
                if (textareas.length === 1) textarea = textareas[0];
            }

            if (!textarea) return null;

            const mountContainer = textarea.closest('.p-floatlabel, [class*="float"]') || textarea.parentElement;
            return {
                container: mountContainer,
                textarea: textarea,
                nodeContainer: nodeContainer,
                mode: RENDER_MODE.VUE_NODES,
                widgetName: widgetName
            };
        } catch (e) {
            logger.error(`Vue容器查找失败: ${e.message}`);
            return null;
        }
    }

    _findDomWidgetContainer(node, widget) {
        try {
            let targetWidget = widget;
            if (typeof widget.resolveDeepest === 'function') {
                try {
                    const deepest = widget.resolveDeepest();
                    if (deepest && deepest.widget) targetWidget = deepest.widget;
                } catch (e) {}
            }
            const inputEl = targetWidget.inputEl || targetWidget.element;
            if (!inputEl) return null;

            let parent = inputEl.parentElement;
            let domWidgetContainer = null;
            while (parent) {
                if (parent.classList?.contains('dom-widget')) {
                    domWidgetContainer = parent;
                    break;
                }
                parent = parent.parentElement;
            }
            if (!domWidgetContainer) return null;

            return {
                container: domWidgetContainer,
                textarea: inputEl,
                mode: RENDER_MODE.LITEGRAPH,
                widgetName: targetWidget.name || targetWidget.id
            };
        } catch (e) {
            logger.error(`dom-widget容器查找失败: ${e.message}`);
            return null;
        }
    }

    /**
     * 挂载助手元素到容器
     * 注意：收藏按钮固定在左下角 (bottom-left)
     */
    mountAssistant(assistantElement, containerInfo, options = {}) {
        if (!assistantElement || !containerInfo?.container) return false;
        try {
            const { container } = containerInfo;
            const offset = options.offset || { x: 4, y: 4 };

            assistantElement.style.position = 'absolute';
            assistantElement.style.left = `${offset.x}px`;
            assistantElement.style.bottom = `${offset.y}px`;
            assistantElement.style.right = 'auto';
            assistantElement.style.top = 'auto';
            assistantElement.style.zIndex = '10';

            const containerPosition = window.getComputedStyle(container).position;
            if (containerPosition === 'static') {
                container.style.position = 'relative';
            }

            container.appendChild(assistantElement);
            void assistantElement.offsetWidth;
            return true;
        } catch (e) {
            logger.error(`挂载失败: ${e.message}`);
            return false;
        }
    }

    async findMountContainerWithRetry(node, widget, options = {}) {
        const { timeout = 500 } = options;
        const immediate = this.findMountContainer(node, widget);
        if (immediate && immediate.textarea) return immediate;

        const mode = this.detectRenderMode();
        if (mode === RENDER_MODE.VUE_NODES) {
            const nodeContainer = document.querySelector(`[data-node-id="${node.id}"]`);
            if (nodeContainer) {
                await this.waitForElement(nodeContainer, () => {
                    const r = this.findMountContainer(node, widget);
                    return (r && r.textarea) ? r : null;
                }, timeout);
                const final = this.findMountContainer(node, widget);
                if (final && final.textarea) return final;
            }
        }

        await new Promise(r => setTimeout(r, 100));
        const retry = this.findMountContainer(node, widget);
        if (retry && retry.textarea) return retry;
        return null;
    }

    waitForElement(parent, selector, timeout = 2000) {
        return new Promise((resolve) => {
            let element = null;
            if (typeof selector === 'function') element = selector(parent);
            else element = parent.querySelector(selector);
            if (element) return resolve(element);

            const observer = new MutationObserver(() => {
                let found = null;
                if (typeof selector === 'function') found = selector(parent);
                else found = parent.querySelector(selector);
                if (found) { observer.disconnect(); resolve(found); }
            });
            observer.observe(parent, { childList: true, subtree: true, attributes: true });
            setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
        });
    }
}

export const nodeMountService = new NodeMountService();
export { NodeMountService };
