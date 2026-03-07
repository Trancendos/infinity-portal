/**
 * TranceFlow Studio's — Entry Point
 * Ista: Junior Cesar (The Gamingista)
 * Pipeline Stage: 3 — Spatial Logic | Port: 3053
 */
import { app, physicsEngine, avatarEngine, meshEngine } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3053);
const HOST = process.env.HOST ?? '0.0.0.0';

async function bootstrap(): Promise<void> {
  logger.info('TranceFlow starting up...');
  const server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, '🕹️  TranceFlow is online — 3D Spatial & Avatar Engine ready');
    logger.info('Ista: Junior Cesar — "If the physics don\'t feel right, the world doesn\'t exist."');
  });

  const SUMMARY_INTERVAL = Number(process.env.SUMMARY_INTERVAL_MS ?? 15 * 60 * 1000);
  const summaryTimer = setInterval(() => {
    try {
      logger.info({ physics: physicsEngine.getStats(), avatars: avatarEngine.getStats(), meshes: meshEngine.getStats() }, '🕹️  TranceFlow periodic summary');
    } catch (err) { logger.error({ err }, 'Summary failed'); }
  }, SUMMARY_INTERVAL);

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(summaryTimer);
    server.close(() => { logger.info('TranceFlow shut down — Junior Cesar saves game state.'); process.exit(0); });
    setTimeout(() => { process.exit(1); }, 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => { logger.error({ err }, 'Uncaught exception'); process.exit(1); });
  process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'Unhandled rejection'); process.exit(1); });
}
bootstrap().catch((err) => { logger.error({ err }, 'Bootstrap failed'); process.exit(1); });
