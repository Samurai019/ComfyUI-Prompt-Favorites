/**
 * 样式加载器
 * 通过 import.meta.url 定位 CSS 文件路径
 */

import { logger } from './logger.js';

const STYLES = [
    { id: 'pf-assistant-styles', file: 'assistant.css' },
    { id: 'pf-panel-styles', file: 'panel.css' }
];

let loaded = false;

export function loadStyles() {
    if (loaded) return;
    loaded = true;

    STYLES.forEach(({ id, file }) => {
        if (document.getElementById(id)) return;
        try {
            const cssUrl = new URL(`../css/${file}`, import.meta.url).href;
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = cssUrl;
            link.onerror = () => logger.error(`样式表加载失败: ${file}`);
            document.head.appendChild(link);
        } catch (e) {
            logger.error(`加载样式 ${file} 失败: ${e.message}`);
        }
    });
}
