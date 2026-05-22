import { Hono } from 'hono';
import type { AppVariables } from '../types.js';
import { forwardRoutes } from './forward.js';
import { healthRoutes } from './health.js';

const app = new Hono<{ Variables: AppVariables }>();

export const proxyApp = app.route('/', healthRoutes).route('/', forwardRoutes);

export type AppType = typeof proxyApp;
