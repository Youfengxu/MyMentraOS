import { AuthenticatedRequest, AppServer } from '@mentra/sdk';
import path from 'path';
import { DashboardHub } from './dashboard';

/**
 * Sets up all Express routes and middleware for the custom dashboard webview.
 */
export function setupExpressRoutes(server: AppServer, dashboardHub: DashboardHub): void {
  const app = server.getExpressApp();

  app.set('view engine', 'ejs');
  app.engine('ejs', require('ejs').__express);
  app.set('views', path.join(__dirname, 'views'));

  dashboardHub.setupRoutes(app);

  app.get('/', (_req, res) => {
    res.redirect('/webview');
  });

  app.get('/webview', (req: AuthenticatedRequest, res) => {
    res.render('webview', {
      userId: req.authUserId,
      assistantConfigured: Boolean(process.env.HOMELAB_ASSISTANT_URL),
      rssFeedLabel: process.env.RSS_FEED_LABEL || 'RSS',
      appTitle: process.env.DASHBOARD_TITLE || 'Mentra Command Dashboard',
    });
  });
}
