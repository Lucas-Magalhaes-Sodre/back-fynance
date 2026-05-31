import type { FastifyInstance } from 'fastify';
import { forgotPasswordController, loginController, registerController } from './auth.controller.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', registerController);
  app.post('/login', loginController);
  app.post('/forgot-password', forgotPasswordController);
}

