import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import type { ForgotPasswordInput, LoginInput, RegisterInput } from './auth.schemas.js';

function sanitizeUser(user: { id: string; name: string; email: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function registerUser(app: FastifyInstance, input: RegisterInput) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) {
    const error = new Error('E-mail ja cadastrado') as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }

  const password_hash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, password_hash }
  });

  const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '7d' });
  return { user: sanitizeUser(user), token };
}

export async function loginUser(app: FastifyInstance, input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    const error = new Error('Credenciais invalidas') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  const validPassword = await bcrypt.compare(input.password, user.password_hash);
  if (!validPassword) {
    const error = new Error('Credenciais invalidas') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '7d' });
  return { user: sanitizeUser(user), token };
}

export async function requestPasswordRecovery(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  return {
    message: user
      ? 'Se o e-mail existir, enviaremos instrucoes de recuperacao.'
      : 'Se o e-mail existir, enviaremos instrucoes de recuperacao.'
  };
}
