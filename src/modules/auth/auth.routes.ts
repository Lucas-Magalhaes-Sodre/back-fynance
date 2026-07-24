import type { FastifyInstance } from 'fastify';
import { forgotPasswordController, googleLoginController, loginController, registerController } from './auth.controller.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', registerController);
  app.post('/login', loginController);
  app.post('/google', googleLoginController);
  app.post('/forgot-password', forgotPasswordController);
}
