/**
 * 收藏夹主逻辑
 * 管理每个文本节点的悬浮按钮实例
 */

import { app } from "../../../scripts/app.js";
import { AssistantContainer } from './AssistantContainer.js';
import { favoritesPanel } from './FavoritesPanel.js';
import { nodeMountService } from '../services/NodeMountService.js';
import { EventManager } from '../utils/eventManager.js';
import { logger } from '../utils/logger.js';

class PromptFavorites {
    constructor() {
        this.instances = new Map(); // widgetKey -> { container, node, widget, inputEl, textarea, containerInfo }
    }

    static isValidNode(node) {
        if (!node || typeof node.id === 'undefined' || node.id === -1) return false;
        if (typeof node.type !== 'string') return false;
        return !!node.widgets;
    }

    _isTextareaWidget(widget) {
        return nodeMountService._isTextareaWidget(widget);
    }

    _getWidgetKey(node, inputId) {
        return `${node.id}__${inputId}`;
    }

    checkAndSetupNode(node) {
        if (!node) return;
        if (!PromptFavorites.isValidNode(node)) return;
        if (!node.widgets) return;

        const validInputs = node.widgets.filter(w => {
            if (!w.node) w.node = node;
            return this._isTextareaWidget(w);
        });

        if (validInputs.length === 0) return;

        validInputs.forEach(inputWidget => {
            const inputId = inputWidget.name || inputWidget.id;
            const widgetKey = this._getWidgetKey(node, inputId);

            if (this.instances.has(widgetKey)) return;

            this._setupForWidget(node, inputWidget, widgetKey);
        });
    }

    _setupForWidget(node, inputWidget, widgetKey) {
        // 查找挂载容器
        nodeMountService.findMountContainerWithRetry(node, inputWidget).then(containerInfo => {
            if (!containerInfo || !containerInfo.textarea) {
                logger.debug(`未找到挂载容器 | 节点: ${node.id}`);
                return;
            }

            // 检查是否已被其他流程创建
            if (this.instances.has(widgetKey)) return;

            const container = new AssistantContainer({
                nodeId: node.id,
                onButtonClick: () => {
                    favoritesPanel.open({
                        node,
                        widget: inputWidget,
                        inputEl: inputWidget.inputEl || inputWidget.element,
                        textarea: containerInfo.textarea,
                        containerInfo,
                        anchorButton: container.button
                    });
                },
                shouldCollapse: () => {
                    return !favoritesPanel.isOpen();
                }
            });

            const element = container.render();
            if (!element) return;

            const mounted = nodeMountService.mountAssistant(element, containerInfo);
            if (!mounted) {
                container.destroy();
                return;
            }

            this.instances.set(widgetKey, {
                container,
                node,
                widget: inputWidget,
                inputEl: inputWidget.inputEl || inputWidget.element,
                textarea: containerInfo.textarea,
                containerInfo
            });
        }).catch(e => {
            logger.error(`挂载失败 | 节点: ${node.id} | ${e.message}`);
        });
    }

    /**
     * 强制折叠所有展开的悬浮按钮实例
     * 在收藏面板关闭时调用，确保按钮回到待机状态
     */
    collapseAllInstances() {
        this.instances.forEach(instance => {
            instance.container.forceCollapse();
        });
    }

    cleanup(nodeId = null) {
        if (nodeId === null) {
            // 清理全部
            this.instances.forEach(instance => {
                instance.container.destroy();
            });
            this.instances.clear();
            return;
        }

        // 清理指定节点
        const keysToDelete = [];
        this.instances.forEach((instance, key) => {
            if (instance.node.id === nodeId) {
                instance.container.destroy();
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(k => this.instances.delete(k));
    }
}

const promptFavorites = new PromptFavorites();
export { promptFavorites, PromptFavorites };
