/**
 * 日志管理模块
 */

export const LOG_LEVELS = {
    ERROR: 0,
    BASIC: 1,
    DEBUG: 2
};

class Logger {
    constructor() {
        this.level = LOG_LEVELS.DEBUG;
    }

    log(message) {
        if (this.level >= LOG_LEVELS.BASIC) {
            const msg = typeof message === 'function' ? message() : message;
            console.log(`[PromptFavorites] ${msg}`);
        }
    }

    debug(message) {
        if (this.level >= LOG_LEVELS.DEBUG) {
            const msg = typeof message === 'function' ? message() : message;
            console.debug(`[PromptFavorites] ${msg}`);
        }
    }

    error(message) {
        const msg = typeof message === 'function' ? message() : message;
        console.error(`[PromptFavorites] ${msg}`);
    }

    warn(message) {
        const msg = typeof message === 'function' ? message() : message;
        console.warn(`[PromptFavorites] ${msg}`);
    }
}

const logger = new Logger();
export { logger };
