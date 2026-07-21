import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { cookieConsentSchema } from './privacy.schemas.js';

export async function createCookieConsentController(request: FastifyRequest, reply: FastifyReply) {
  const data = cookieConsentSchema.parse(request.body);

  const consent = await prisma.cookieConsent.create({
    data: {
      visitorId: data.visitorId,
      version: data.version,
      necessary: true,
      preferences: data.preferences,
      analytics: data.analytics,
      marketing: data.marketing,
      sourcePath: data.sourcePath ?? null
    }
  });

  return reply.status(201).send({
    consent: {
      id: consent.id,
      visitorId: consent.visitorId,
      version: consent.version,
      createdAt: consent.createdAt
    }
  });
}
