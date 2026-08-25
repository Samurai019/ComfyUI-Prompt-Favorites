/**
 * 悬浮按钮容器 (精简版)
 * 固定左下角布局，折叠/展开两个状态
 * 仿照 ComfyUI-Prompt-Assistant 的视觉风格
 */

import { EventManager } from '../utils/eventManager.js';
import { logger } from '../utils/logger.js';

// 内联图标 SVG（来自 star-svgrepo-com.svg，fill 改为 currentColor 跟随主题色）
const FAVORITE_ICON_SVG = `<span class="pf-svg-icon"><svg viewBox="0 0 48 48" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M22.6988 4.8956L18.2481 17.9614H5.4002C4.03895 17.9614 3.48002 19.7095 4.58648 20.5008L15.1262 28.006C15.576 28.3263 16.2004 28.2213 16.5208 27.7714C16.8411 27.3216 16.7361 26.6972 16.2863 26.3768L7.27697 19.9614H18.5362C19.2198 19.9614 19.8313 19.5251 20.0501 18.874L23.9547 7.41137L26.6334 15.2893C26.8112 15.8122 27.3793 16.092 27.9021 15.9142C28.425 15.7364 28.7048 15.1683 28.527 14.6455L25.213 4.89946C24.7999 3.70066 23.1105 3.70066 22.6988 4.8956ZM12.1763 43.6127C11.026 44.6869 9.61068 43.3261 10.0353 42.0652L13.9053 30.7092C14.0834 30.1865 14.6516 29.9071 15.1744 30.0853C15.6971 30.2634 15.9765 30.8316 15.7983 31.3544L12.6107 40.7082L23.0715 32.3427C23.5767 31.8712 24.3414 31.8712 24.7805 32.2929L35.3001 40.7115L31.0362 28.1991C30.8052 27.5277 31.0467 26.7849 31.6238 26.3772L40.633 19.9618H28.9558C28.4035 19.9618 27.9558 19.5141 27.9558 18.9618C27.9558 18.4095 28.4035 17.9618 28.9558 17.9618H42.5098C43.8711 17.9618 44.4337 19.7122 43.3219 20.5024L33.0249 27.8347L37.8755 42.0687C38.2987 43.3253 36.8889 44.6839 35.7911 43.6627L23.9575 34.1914L12.1763 43.6127Z"/></svg></span>`;

class AssistantContainer {
    constructor(options = {}) {
        this.nodeId = options.nodeId;
        this.anchorPosition = 'bottom-left-h'; // 固定左下角
        this.offset = options.offset || { x: 4, y: 4 };

        this.onButtonClick = options.onButtonClick;
        this.shouldCollapse = options.shouldCollapse;

        this.isCollapsed = true;
        this.isDestroyed = false;
        this.element = null;
        this.container = null;
        this.hoverArea = null;
        this.indicator = null;
        this.content = null;
        this.button = null;

        this._collapseTimer = null;
        this._expandTimer = null;
        this._cleanupFunctions = [];
    }

    render() {
        if (this.isDestroyed) return null;

        this.element = document.createElement('div');
        this.element.className = 'pf-assistant-container pf-collapsed pf-layout-bottom-left-h';

        // 悬停检测区
        this.hoverArea = document.createElement('div');
        this.hoverArea.className = 'pf-hover-area';
        this.element.appendChild(this.hoverArea);

        // 指示器图标
        this.indicator = document.createElement('div');
        this.indicator.className = 'pf-indicator pf-indicator-init';
        this.indicator.innerHTML = FAVORITE_ICON_SVG;
        this.indicator.addEventListener('animationend', () => {
            this.indicator.classList.remove('pf-indicator-init');
        }, { once: true });
        this.element.appendChild(this.indicator);

        // 内容容器
        this.content = document.createElement('div');
        this.content.className = 'pf-content';
        this.element.appendChild(this.content);

        // 收藏按钮
        this.button = document.createElement('button');
        this.button.className = 'pf-assistant-button';
        this.button.type = 'button';
        this.button.title = '收藏夹';
        this.button.innerHTML = FAVORITE_ICON_SVG;
        this.content.appendChild(this.button);

        this._bindEvents();
        return this.element;
    }

    _bindEvents() {
        // 悬停展开
        const enterHandler = () => {
            if (this.isCollapsed) {
                this._expandTimer = setTimeout(() => this.expand(), 120);
            }
            if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
        };
        const leaveHandler = () => {
            if (this._expandTimer) { clearTimeout(this._expandTimer); this._expandTimer = null; }
            if (!this.isCollapsed) {
                this._collapseTimer = setTimeout(() => {
                    if (this.shouldCollapse && !this.shouldCollapse()) return;
                    this.collapse();
                }, 150);
            }
        };
        this.element.addEventListener('mouseenter', enterHandler);
        this.element.addEventListener('mouseleave', leaveHandler);
        this._cleanupFunctions.push(() => {
            this.element.removeEventListener('mouseenter', enterHandler);
            this.element.removeEventListener('mouseleave', leaveHandler);
        });

        // 点击按钮
        const clickHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.onButtonClick) this.onButtonClick(e);
        };
        this.button.addEventListener('click', clickHandler);
        this._cleanupFunctions.push(() => {
            this.button.removeEventListener('click', clickHandler);
        });
    }

    /**
     * 强制折叠（面板关闭时调用，不检查 shouldCollapse，不走延迟）
     */
    forceCollapse() {
        if (this.isDestroyed || this.isCollapsed) return;
        if (this._expandTimer) { clearTimeout(this._expandTimer); this._expandTimer = null; }
        if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
        this.collapse();
    }

    expand() {
        if (this.isDestroyed || !this.isCollapsed) return;
        this.isCollapsed = false;
        this.element.classList.remove('pf-collapsed');
        this.element.classList.add('pf-expanded');
    }

    collapse() {
        if (this.isDestroyed || this.isCollapsed) return;
        this.isCollapsed = true;
        this.element.classList.remove('pf-expanded');
        this.element.classList.add('pf-collapsed');
    }

    mount(parentElement) {
        if (parentElement && this.element) {
            parentElement.appendChild(this.element);
        }
    }

    destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        if (this._expandTimer) clearTimeout(this._expandTimer);
        if (this._collapseTimer) clearTimeout(this._collapseTimer);
        this._cleanupFunctions.forEach(fn => { try { fn(); } catch (e) {} });
        this._cleanupFunctions = [];
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.hoverArea = null;
        this.indicator = null;
        this.content = null;
        this.button = null;
    }
}

export { AssistantContainer, FAVORITE_ICON_SVG };
