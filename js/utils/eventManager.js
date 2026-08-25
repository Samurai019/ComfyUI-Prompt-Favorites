/**
 * 事件管理器
 */

import { logger } from './logger.js';

class EventManager {
    static listeners = new Map();
    static initialized = false;
    static _mouseHandler = null;
    static mousePosition = { x: 0, y: 0 };

    static init() {
        if (this.initialized) return true;
        try {
            this._mouseHandler = (e) => {
                this.mousePosition.x = e.clientX;
                this.mousePosition.y = e.clientY;
            };
            document.addEventListener('mousemove', this._mouseHandler);
            this.initialized = true;
            return true;
        } catch (e) {
            logger.error(`事件管理器初始化失败: ${e.message}`);
            return false;
        }
    }

    static getMousePosition() {
        return { ...this.mousePosition };
    }

    static addDOMListener(element, event, handler, options = false) {
        if (!element || !event || typeof handler !== 'function') {
            return () => {};
        }
        element.addEventListener(event, handler, options);
        return () => {
            try { element.removeEventListener(event, handler, options); } catch (e) {}
        };
    }

    static debounce(func, wait = 100) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    static registerHoverEvents(element, onEnter, onLeave) {
        if (!element) return () => {};
        const enterHandler = () => onEnter && onEnter();
        const leaveHandler = () => onLeave && onLeave();
        element.addEventListener('mouseenter', enterHandler);
        element.addEventListener('mouseleave', leaveHandler);
        return () => {
            element.removeEventListener('mouseenter', enterHandler);
            element.removeEventListener('mouseleave', leaveHandler);
        };
    }
}

export { EventManager };
