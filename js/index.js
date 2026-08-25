/**
 * ComfyUI-Prompt-Favorites 主入口
 * 照搬 ComfyUI-Prompt-Assistant 的扩展注册和节点生命周期 Hook 模式
 * 在文本类节点的左下角植入收藏悬浮按钮
 */

import { app } from "../../scripts/app.js";
import { promptFavorites, PromptFavorites } from './modules/PromptFavorites.js';
import { favoritesPanel } from './modules/FavoritesPanel.js';
import { EventManager } from './utils/eventManager.js';
import { loadStyles } from './utils/styleLoader.js';
import { logger } from './utils/logger.js';

app.registerExtension({
    name: "Comfy.PromptFavorites",

    async setup() {
        try {
            loadStyles();
            EventManager.init();
            logger.log("文本收藏夹扩展初始化完成");
        } catch (error) {
            logger.error(`扩展初始化失败: ${error.message}`);
        }

        // 绑定画布钩子
        this._bindGraphHooks(app.graph);

        // 子图切换监听
        this._setupGraphSwitchListener();
    },

    /**
     * 画布切换监听（进入/退出子图）
     */
    _setupGraphSwitchListener() {
        if (!app.canvas) return;
        let lastGraph = app.canvas.graph;
        const self = this;

        const originalDescriptor = Object.getOwnPropertyDescriptor(app.canvas, 'graph') || {
            value: app.canvas.graph, writable: true, configurable: true
        };
        let _graphValue = app.canvas.graph;

        Object.defineProperty(app.canvas, 'graph', {
            get() { return _graphValue; },
            set(newGraph) {
                const oldGraph = _graphValue;
                _graphValue = newGraph;
                if (originalDescriptor.set) originalDescriptor.set.call(this, newGraph);
                if (newGraph && newGraph !== oldGraph) {
                    const isVueMode = typeof LiteGraph !== 'undefined' && LiteGraph.vueNodesMode === true;
                    const delay = isVueMode ? 300 : 100;
                    setTimeout(() => self._onGraphSwitch(newGraph), delay);
                }
            },
            configurable: true,
            enumerable: true
        });
    },

    _onGraphSwitch(graph) {
        if (!graph) return;
        this._bindGraphHooks(graph, { resetFlags: true });
    },

    _bindGraphHooks(graph, options = {}) {
        if (!graph) return;
        const { resetFlags = false } = options;

        if (!graph._promptFavoritesHooksInjected) {
            graph._promptFavoritesHooksInjected = true;

            const origOnNodeAdded = graph.onNodeAdded;
            graph.onNodeAdded = (node) => {
                if (origOnNodeAdded) origOnNodeAdded.apply(graph, [node]);
                if (!node) return;
                this._injectUniversalHooks(node);
                this._handleNodeActive(node, { delay: true });
            };

            const isVueMode = typeof LiteGraph !== 'undefined' && LiteGraph.vueNodesMode === true;
            const scanDelay = isVueMode ? 500 : 100;

            const scanExistingNodes = () => {
                const nodes = graph._nodes || [];
                if (nodes.length === 0) return;
                nodes.forEach(node => {
                    if (!node || node.id === -1) return;
                    this._injectUniversalHooks(node);
                    this._handleNodeActive(node, { delay: false });
                });
            };
            setTimeout(scanExistingNodes, scanDelay);
        }

        if (resetFlags) {
            // 切换图时清理旧实例
            promptFavorites.cleanup(null);

            const isVueMode = typeof LiteGraph !== 'undefined' && LiteGraph.vueNodesMode === true;
            const delay = isVueMode ? 300 : 100;

            setTimeout(() => {
                const nodes = graph._nodes || [];
                nodes.forEach(node => {
                    if (!node || node.id === -1) return;
                    node._promptFavoritesInitialized = false;
                    this._injectUniversalHooks(node);
                    this._handleNodeActive(node, { delay: false });
                });
            }, delay);
        }
    },

    _injectUniversalHooks(node) {
        if (!node || node._promptFavoritesHooksInjected) return;
        const self = this;

        const origOnSelected = node.onSelected;
        const origOnRemoved = node.onRemoved;

        node.onSelected = function () {
            if (origOnSelected) origOnSelected.apply(this, arguments);
            self._handleNodeActive(this, { reset: true, delay: true });
        };

        node.onRemoved = function () {
            self._handleNodeCleanup(this);
            if (origOnRemoved) origOnRemoved.apply(this, arguments);
        };

        node._promptFavoritesHooksInjected = true;
    },

    _handleNodeActive(node, options = {}) {
        if (!node || node.id === -1) return;
        const { reset = false, delay = true } = options;
        if (reset) node._promptFavoritesInitialized = false;

        const run = () => {
            if (!node || !node.id || node.id === -1) return;
            if (PromptFavorites.isValidNode(node) && !node._promptFavoritesInitialized) {
                node._promptFavoritesInitialized = true;
                promptFavorites.checkAndSetupNode(node);
            }
        };

        if (delay) {
            requestAnimationFrame(() => requestAnimationFrame(run));
        } else {
            run();
        }
    },

    _handleNodeCleanup(node) {
        if (!node || node.id === undefined || node.id === -1) return;
        promptFavorites.cleanup(node.id);
        // 如果面板正属于被删除的节点，关闭面板
        if (favoritesPanel.isOpen() && favoritesPanel.activeContext?.node?.id === node.id) {
            favoritesPanel.close();
        }
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const self = this;
        const proto = nodeType.prototype;

        const origOnCreated = proto.onNodeCreated;
        const origOnSelected = proto.onSelected;
        const origOnRemoved = proto.onRemoved;

        proto.onNodeCreated = function () {
            if (origOnCreated) origOnCreated.apply(this, arguments);
            self._handleNodeActive(this, { delay: true });
        };
        proto.onSelected = function () {
            if (origOnSelected) origOnSelected.apply(this, arguments);
            self._handleNodeActive(this, { reset: true, delay: true });
        };
        proto.onRemoved = function () {
            self._handleNodeCleanup(this);
            if (origOnRemoved) origOnRemoved.apply(this, arguments);
        };
    },

    async nodeCreated(node) {
        if (!node || node.id === -1) return;
        this._injectUniversalHooks(node);
    },

    async nodeRemoved(node) {
        this._handleNodeCleanup(node);
    },

    async beforeExtensionUnload() {
        promptFavorites.cleanup();
        favoritesPanel.close();
    }
});
