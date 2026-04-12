import { buildServer } from './server.js';
import { startImportInbox, stopImportInbox, INBOX_DIR } from './importInbox.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const app = await buildServer();

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`LaserFlow backend listening on ${HOST}:${PORT}`);

  // Start the file-based import inbox so Illustrator plugins that lack
  // networking (Socket / system.callSystem unavailable) can still send SVGs
  // by writing JSON files to ~/.laserflow/import/.
  startImportInbox();
  console.log(`Import inbox watching ${INBOX_DIR}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Clean up sentinel file on graceful shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopImportInbox();
    process.exit(0);
  });
}
