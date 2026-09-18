import type { Connect, Plugin, ViteDevServer, PreviewServer } from 'vite';
import { handleApiRequest } from './crawlApi';

const middleware: Connect.NextHandleFunction = (req, res, next) => {
  handleApiRequest(req, res)
    .then((handled) => {
      if (!handled) next();
    })
    .catch(next);
};

/** Exposes /api/dataset and /api/crawl so the dashboard can trigger a crawl itself. */
export function crawlApiPlugin(): Plugin {
  return {
    name: 'it-cert-ranking:crawl-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(middleware);
    },
  };
}
