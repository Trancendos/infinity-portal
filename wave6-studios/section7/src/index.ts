/**
 * Section7 — Entry Point
 *
 * Intelligence, Narrative & Research Layer for the Trancendos Studio ecosystem.
 * Ista: Bert-Joen Kater (The Storyista)
 *
 * Pipeline Stage: 1 — Intelligence
 * Port: 3050
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { app, sentimentEngine, loreEngine, marketScanner } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3050);
const HOST = process.env.HOST ?? '0.0.0.0';

// ── Startup ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('Section7 starting up...');

  const server = app.listen(PORT, HOST, () => {
    logger.info(
      { port: PORT, host: HOST, env: process.env.NODE_ENV ?? 'development' },
      '👁️  Section7 is online — Intelligence, Narrative & Research Layer ready',
    );
    logger.info('Ista: Bert-Joen Kater (The Storyista) — "Every story has data. Every data point has a story."');
  });

  // ── Periodic Intelligence Summary (every 15 minutes) ────────────────────
  const SUMMARY_INTERVAL = Number(process.env.SUMMARY_INTERVAL_MS ?? 15 * 60 * 1000);
  const summaryTimer = setInterval(() => {
    try {
      const iStats = sentimentEngine.getStats();
      const lStats = loreEngine.getStats();
      const mStats = marketScanner.getStats();
      logger.info(
        {
          intelligence: {
            dataPoints: iStats.totalDataPoints,
            trackedTopics: iStats.trackedTopics,
            activeIntelligence: iStats.activeIntelligence,
          },
          lore: {
            totalNodes: lStats.totalNodes,
            published: lStats.publishedNodes,
            avgEmpathy: lStats.avgEmpathyScore,
          },
          market: {
            competitors: mStats.competitors,
            pendingDrops: mStats.pendingDrops,
            criticalThreats: mStats.criticalThreats,
          },
        },
        '👁️  Section7 periodic intelligence summary',
      );
    } catch (err) {
      logger.error({ err }, 'Periodic summary failed');
    }
  }, SUMMARY_INTERVAL);

  // ── Graceful Shutdown ───────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(summaryTimer);
    server.close(() => {
      logger.info('Section7 shut down cleanly — The Storyista rests.');
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => { logger.error({ err }, 'Uncaught exception'); process.exit(1); });
  process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'Unhandled rejection'); process.exit(1); });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Bootstrap failed');
  process.exit(1);
});