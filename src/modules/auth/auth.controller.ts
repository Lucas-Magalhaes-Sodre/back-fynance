import type { FastifyReply, FastifyRequest } from 'fastify';
import { forgotPasswordSchema, loginSchema, registerSchema } from './auth.schemas.js';
import { loginUser, registerUser, requestPasswordRecovery } from './auth.service.js';

export async function registerController(request: FastifyRequest, reply: FastifyReply) {
  const data = registerSchema.parse(request.body);
  const result = await registerUser(request.server, data);
  return reply.status(201).send(result);
}

export async function loginController(request: FastifyRequest, reply: FastifyReply) {
  const data = loginSchema.parse(request.body);
  const result = await loginUser(request.server, data);
  return reply.send(result);
}

export async function forgotPasswordController(request: FastifyRequest, reply: FastifyReply) {
  const data = forgotPasswordSchema.parse(request.body);
  const result = await requestPasswordRecovery(data);
  return reply.send(result);
}

