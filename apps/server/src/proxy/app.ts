import { Hono } from 'hono';
import type { AppVariables } from '../types';
import { forwardRoutes } from './forward';
import { healthRoutes } from './health';

const app = new Hono<{ Variables: AppVariables }>();

export const proxyApp = app.route('/', healthRoutes).route('/', forwardRoutes);

export type AppType = typeof proxyApp;
