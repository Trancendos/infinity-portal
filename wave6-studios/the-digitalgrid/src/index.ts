/**
 * The DigitalGrid — Entry Point
 * Ista: Tyler Towncroft (The DevOpsista)
 * Pipeline Stage: 4 — Deployment | Port: 3055
 */
import { app, spatialRouter, quarantineEngine, webhookMatrix } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3055);
const HOST = process.env.HOST ?? '0.0.0.0';

async function bootstrap(): Promise<void> {
  logger.info('The DigitalGrid starting up...');
  const server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, '🕸️  The DigitalGrid is online — Infrastructure & CI/CD Automation Matrix ready');
    logger.info('Ista: Tyler Towncroft — "If it\'s not automated, it\'s not infrastructure. It\'s a liability."');
  });

  const SUMMARY_INTERVAL = Number(process.env.SUMMARY_INTERVAL_MS ?? 15 * 60 * 1000);
  const summaryTimer = setInterval(() => {
    try {
      logger.info({ routing: spatialRouter.getStats(), quarantine: quarantineEngine.getStats(), webhooks: webhookMatrix.getStats() }, '🕸️  DigitalGrid periodic summary');
    } catch (err) { logger.error({ err }, 'Summary failed'); }
  }, SUMMARY_INTERVAL);

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(summaryTimer);
    server.close(() => { logger.info('The DigitalGrid shut down — Tyler has left the terminal.'); process.exit(0); });
    setTimeout(() => { process.exit(1); }, 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => { logger.error({ err }, 'Uncaught exception'); process.exit(1); });
  process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'Unhandled rejection'); process.exit(1); });
}
bootstrap().catch((err) => { logger.error({ err }, 'Bootstrap failed'); process.exit(1); });
