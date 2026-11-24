// Minimal type stub for node-telegram-bot-api (library ships no .d.ts).
// Resolved via jsconfig "paths" so tsc never checks the library's own JS.
// Covers only the members used in this project.

interface TelegramBotOptions {
    polling?: boolean;
    [key: string]: unknown;
}

declare class TelegramBot {
    constructor(token: string, opts?: TelegramBotOptions);
    sendMessage(
        chatId: number | string,
        text: string,
        extra?: Record<string, unknown>
    ): Promise<unknown>;
    sendPhoto(
        chatId: number | string,
        photo: string | Buffer,
        extra?: Record<string, unknown>,
        fileOptions?: { filename?: string; contentType?: string }
    ): Promise<unknown>;
    editMessageMedia(
        media: Record<string, unknown>,
        extra?: Record<string, unknown>
    ): Promise<unknown>;
    isPolling(): boolean;
    stopPolling(options?: { cancel?: boolean; reason?: string }): Promise<void>;
    on(event: string, handler: (...args: unknown[]) => void): void;
}

export = TelegramBot;
