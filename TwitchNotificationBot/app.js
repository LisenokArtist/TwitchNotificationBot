const { TwitchNotificationBot } = require("./TwitchNotificationBot");
const { AppConfig } = require("./config/AppConfig");

async function main() {
    const appConfig = new AppConfig();
    if (!appConfig.load()) {
        process.exit(1);
    }

    const app = new TwitchNotificationBot(appConfig);
    let stopping = false;

    /**
     * @param {string} signal
     * @returns {Promise<void>}
     */
    const shutdown = async (signal) => {
        if (stopping) {
            return;
        }
        stopping = true;
        console.log(`${signal}: останавливаю сервисы`);
        try {
            await app.Stop();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`Остановка сервисов не выполнена: ${message}`);
            process.exitCode = 1;
        }
        process.exit();
    };

    process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
        void shutdown('SIGINT');
    });

    await app.Start();
    if (!app.isRunning) {
        process.exit(1);
    }
}

void main();
