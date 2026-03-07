/**
 * Style&Shoot Studios — Entry Point
 * Ista: Madam Krystal (The UX UIista)
 * Pipeline Stage: 2 — Visual Logic | Port: 3051
 */
import { app, componentEngine, designSystem, svgGenerator } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3051);
const HOST = process.env.HOST ?? '0.0.0.0';

async function bootstrap(): Promise<void> {
  logger.info('Style&Shoot starting up...');
  const server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST, env: process.env.NODE_ENV ?? 'development' },
      '🎨 Style&Shoot is online — Empathy-Driven UX/UI & Visual Engine ready');
    logger.info('Ista: Madam Krystal — "Perfection is not when there is nothing more to add, but when there is nothing left to remove."');
  });

  const SUMMARY_INTERVAL = Number(process.env.SUMMARY_INTERVAL_MS ?? 15 * 60 * 1000);
  const summaryTimer = setInterval(() => {
    try {
      const cStats = componentEngine.getStats();
      const dStats = designSystem.getStats();
      const sStats = svgGenerator.getStats();
      logger.info({ components: cStats, design: dStats, svg: sStats }, '🎨 Style&Shoot periodic summary');
    } catch (err) { logger.error({ err }, 'Periodic summary failed'); }
  }, SUMMARY_INTERVAL);

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(summaryTimer);
    server.close(() => { logger.info('Style&Shoot shut down cleanly — Madam Krystal retires gracefully.'); process.exit(0); });
    setTimeout(() => { logger.warn('Forced shutdown after timeout'); process.exit(1); }, 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => { logger.error({ err }, 'Uncaught exception'); process.exit(1); });
  process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'Unhandled rejection'); process.exit(1); });
}

bootstrap().catch((err) => { logger.error({ err }, 'Bootstrap failed'); process.exit(1); });