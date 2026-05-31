import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/prisma.js';

export async function meController(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { id: true, name: true, email: true, createdAt: true, updatedAt: true }
  });

  if (!user) {
    return reply.status(404).send({ message: 'Usuario nao encontrado' });
  }

  return reply.send({ user });
}

