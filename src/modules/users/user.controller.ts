import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { LGPD_CONSENT_VERSION } from '../auth/auth.service.js';

const profileSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  occupation: z.string().optional().nullable()
});

const privacyConsentSchema = z.object({
  lgpdAccepted: z.literal(true),
  marketingConsent: z.boolean().optional().default(false)
});

const deleteAccountSchema = z.object({
  password: z.string().min(1)
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  city: true,
  occupation: true,
  lgpdAcceptedAt: true,
  lgpdConsentVersion: true,
  marketingConsent: true,
  dataDeletionRequestedAt: true,
  createdAt: true,
  updatedAt: true
};

export async function meController(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: userSelect
  });

  if (!user) {
    return reply.status(404).send({ message: 'Usuario nao encontrado' });
  }

  return reply.send({ user });
}

export async function updateProfileController(request: FastifyRequest, reply: FastifyReply) {
  const data = profileSchema.parse(request.body);
  const user = await prisma.user.update({
    where: { id: request.user.sub },
    data,
    select: userSelect
  });

  return reply.send({ user });
}

export async function updatePrivacyConsentController(request: FastifyRequest, reply: FastifyReply) {
  const data = privacyConsentSchema.parse(request.body);
  const user = await prisma.user.update({
    where: { id: request.user.sub },
    data: {
      lgpdAcceptedAt: new Date(),
      lgpdConsentVersion: LGPD_CONSENT_VERSION,
      marketingConsent: data.marketingConsent
    },
    select: userSelect
  });

  return reply.send({ user });
}

export async function exportMyDataController(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.sub;
  const [
    user,
    categories,
    financialItems,
    savings,
    goals,
    creditCards,
    creditCardPurchases
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: userSelect }),
    prisma.financialCategory.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.financialItem.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.savings.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.financialGoal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.creditCard.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.creditCardPurchase.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  ]);

  if (!user) {
    return reply.status(404).send({ message: 'Usuario nao encontrado' });
  }

  return reply
    .header('Content-Disposition', 'attachment; filename="minha-receita-dados.json"')
    .send({
      exportedAt: new Date().toISOString(),
      privacy: {
        legalBasis: 'Execucao de contrato e consentimento do titular',
        consentVersion: user.lgpdConsentVersion,
        lgpdAcceptedAt: user.lgpdAcceptedAt,
        marketingConsent: user.marketingConsent
      },
      user,
      data: {
        categories,
        financialItems,
        savings,
        goals,
        creditCards,
        creditCardPurchases
      }
    });
}

export async function deleteMyAccountController(request: FastifyRequest, reply: FastifyReply) {
  const data = deleteAccountSchema.parse(request.body);
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { id: true, password_hash: true }
  });

  if (!user) {
    return reply.status(404).send({ message: 'Usuario nao encontrado' });
  }

  const validPassword = await bcrypt.compare(data.password, user.password_hash);
  if (!validPassword) {
    return reply.status(401).send({ message: 'Senha invalida' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { dataDeletionRequestedAt: new Date() }
  });
  await prisma.user.delete({ where: { id: user.id } });

  return reply.status(204).send();
}
