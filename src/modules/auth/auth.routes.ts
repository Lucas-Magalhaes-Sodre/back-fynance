import type { FastifyInstance } from 'fastify';
import { forgotPasswordController, googleLoginController, loginController, registerController } from './auth.controller.js';

const authRateLimit = {
  max: 8,
  timeWindow: '1 minute'
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', { config: { rateLimit: authRateLimit } }, registerController);
  app.post('/login', { config: { rateLimit: authRateLimit } }, loginController);
  app.post('/google', { config: { rateLimit: authRateLimit } }, googleLoginController);
  app.post('/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } }, forgotPasswordController);
}
