/**
 * TateKing Studios — Entry Point
 * Ista: Benji & Sam (The Movistas)
 * Pipeline Stage: 3 — Spatial Logic | Port: 3054
 */
import { app, timelineEngine, lightingEngine, swarmOrchestrator } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3054);
const HOST = process.env.HOST ?? '0.0.0.0';

async function bootstrap(): Promise<void> {
  logger.info('TateKing starting up...');
  const server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, '🎥 TateKing is online — Serverless Cinematic Rendering Engine ready');
    logger.info('Ista: Benji & Sam — "We don\'t render frames. We render emotions."');
  });

  const SUMMARY_INTERVAL = Number(process.env.SUMMARY_INTERVAL_MS ?? 15 * 60 * 1000);
  const summaryTimer = setInterval(() => {
    try {
      logger.info({ timeline: timelineEngine.getStats(), lighting: lightingEngine.getStats(), swarm: swarmOrchestrator.getStats() }, '🎥 TateKing periodic summary');
    } catch (err) { logger.error({ err }, 'Summary failed'); }
  }, SUMMARY_INTERVAL);

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(summaryTimer);
    server.close(() => { logger.info('TateKing shut down — That\'s a wrap!'); process.exit(0); });
    setTimeout(() => { process.exit(1); }, 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => { logger.error({ err }, 'Uncaught exception'); process.exit(1); });
  process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'Unhandled rejection'); process.exit(1); });
}
bootstrap().catch((err) => { logger.error({ err }, 'Bootstrap failed'); process.exit(1); });
