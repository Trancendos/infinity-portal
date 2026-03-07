/**
 * Fabulousa Studio's — Entry Point
 * Ista: Baron Von Hilton (The Styleista)
 * Pipeline Stage: 2 — Visual Logic | Port: 3052
 */
import { app, fabricEngine, hexValidator, couture } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3052);
const HOST = process.env.HOST ?? '0.0.0.0';

async function bootstrap(): Promise<void> {
  logger.info('Fabulousa starting up...');
  const server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, '🧵 Fabulousa is online — Generative Fashion & Style Engine ready');
    logger.info('Ista: Baron Von Hilton — "Darling, if the thread count is wrong, the entire collection is wrong."');
  });

  const SUMMARY_INTERVAL = Number(process.env.SUMMARY_INTERVAL_MS ?? 15 * 60 * 1000);
  const summaryTimer = setInterval(() => {
    try {
      logger.info({ fabrics: fabricEngine.getStats(), colors: hexValidator.getStats(), couture: couture.getStats() }, '🧵 Fabulousa periodic summary');
    } catch (err) { logger.error({ err }, 'Summary failed'); }
  }, SUMMARY_INTERVAL);

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(summaryTimer);
    server.close(() => { logger.info('Fabulousa shut down — Baron Von Hilton retires to his atelier.'); process.exit(0); });
    setTimeout(() => { process.exit(1); }, 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => { logger.error({ err }, 'Uncaught exception'); process.exit(1); });
  process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'Unhandled rejection'); process.exit(1); });
}
bootstrap().catch((err) => { logger.error({ err }, 'Bootstrap failed'); process.exit(1); });
