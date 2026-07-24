import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { accessInfo } from '../billing/access.service.js';

const accessFreePrefixes = [
  '/users/me',
  '/users/me/privacy-consent',
  '/users/me/export',
  '/billing',
  '/admin'
];

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: 'Token invalido ou ausente' });
  }

  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: {
      role: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      manualAccessUntil: true,
      accessBlockedAt: true,
      subscriptionCurrentPeriodEnd: true
    }
  });

  if (!user) {
    return reply.status(401).send({ message: 'Usuario nao encontrado' });
  }

  const path = request.url.split('?')[0];
  const isFreeRoute = accessFreePrefixes.some((prefix) => path.startsWith(prefix));
  const access = accessInfo(user);
  if (!isFreeRoute && !access.canAccess) {
    return reply.status(402).send({
      message: 'Assinatura necessaria para continuar',
      code: 'SUBSCRIPTION_REQUIRED',
      access
    });
  }
}
