import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { modulesRouter } from './modules.routes.js';
import { authRouter } from './auth.routes.js';
import { protectedRouter } from './protected.routes.js';
import { franchiseRouter } from './franchise.routes.js';
import { serviceRouter } from './service.routes.js';
import { commissionRouter } from './commission.routes.js';
import { campaignRouter } from './campaign.routes.js';
import { leadRouter } from './lead.routes.js';
import { ownLeadCenterRouter } from './ownLeadCenter.routes.js';
import { clientRouter } from './client.routes.js';
import { reportRouter } from './report.routes.js';
import { ticketRouter } from './ticket.routes.js';
import { kbRouter } from './kb.routes.js';
import { offerRouter } from './offer.routes.js';
import { marketingRouter } from './marketing.routes.js';
import { serviceApplicationRouter } from './serviceApplication.routes.js';
import { advertisementRouter } from './advertisement.routes.js';
import { notificationRouter } from './notification.routes.js';
import { jobRouter } from './job.routes.js';
import { efilinggRouter } from './efilingg.routes.js';
import { leadIntakeRouter } from './leadIntake.routes.js';
import type { ApiResponse } from '../types/index.js';

export const apiRouter = Router();

// Root health endpoint
apiRouter.use('/health', healthRouter);

// Version 1 router
export const v1Router = Router();

v1Router.get('/', (req, res) => {
  const response: ApiResponse<{ message: string; phase: string; status: string }> = {
    success: true,
    data: {
      message: 'LBSC Platform Core API Foundation',
      phase: 'Phase 20A - Secure Lead Intake Gateway',
      status: 'operational',
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  };
  res.json(response);
});

// Modular sub-routes
v1Router.use('/modules', modulesRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/protected', protectedRouter);
v1Router.use('/franchise', franchiseRouter);
v1Router.use('/services', serviceRouter);
v1Router.use('/commissions', commissionRouter);
v1Router.use('/campaigns', campaignRouter);
v1Router.use('/leads', leadRouter);
v1Router.use('/own-lead-center', ownLeadCenterRouter);
v1Router.use('/clients', clientRouter);
v1Router.use('/reports', reportRouter);
v1Router.use('/tickets', ticketRouter);
v1Router.use('/knowledgebase', kbRouter);
v1Router.use('/offers', offerRouter);
v1Router.use('/marketing-materials', marketingRouter);
v1Router.use('/service-applications', serviceApplicationRouter);
v1Router.use('/advertisement-requests', advertisementRouter);
v1Router.use('/advertisements', advertisementRouter);
v1Router.use('/notifications', notificationRouter);
v1Router.use('/jobs', jobRouter);
v1Router.use('/integrations/efilingg', efilinggRouter);
v1Router.use('/integrations/lead-intake', leadIntakeRouter);

// Future modular routes will mount here:
// v1Router.use('/franchise', franchiseRouter);
// v1Router.use('/campaigns', campaignRouter);
// v1Router.use('/leads', leadRouter);
// v1Router.use('/commissions', commissionRouter);
// v1Router.use('/admin', adminRouter);

apiRouter.use('/v1', v1Router);
