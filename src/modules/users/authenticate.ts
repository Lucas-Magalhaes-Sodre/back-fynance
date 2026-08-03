import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { accessInfo, canAccessProduct } from '../billing/access.service.js';

const accessFreePrefixes = [
  '/users/me',
  '/users/me/privacy-consent',
  '/users/me/export',
  '/billing',
  '/admin'
];

function productForPath(path: string) {
  if (path.startsWith('/credit-cards')) return ['cards'];
  if (path.startsWith('/savings')) return ['savings'];
  if (path.startsWith('/financial-goals')) return ['goals'];
  if (path.startsWith('/financial-categories')) return ['settings', 'financial-control', 'birthdays', 'savings'];
  if (path.startsWith('/financial-items') || path.startsWith('/financial-reminders') || path.startsWith('/push-notifications')) {
    return ['financial-control', 'birthdays', 'savings'];
  }
  if (
    path.startsWith('/financial-control') ||
    path.startsWith('/financial-summary') ||
    path.startsWith('/financial-calendar') ||
    path.startsWith('/financial-comparison') ||
    path.startsWith('/financial-insights')
  ) {
    return ['financial-control'];
  }
  return null;
}

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
      subscriptionPlan: true,
      subscriptionCurrentPeriodEnd: true,
      planProductKeysSnapshot: true
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

  const productKey = productForPath(path);
  if (!isFreeRoute && productKey && !productKey.some((key) => canAccessProduct(user, key))) {
    return reply.status(403).send({
      message: 'Seu plano atual nao inclui este recurso',
      code: 'PRODUCT_NOT_INCLUDED',
      productKey: productKey[0],
      access
    });
  }
}
