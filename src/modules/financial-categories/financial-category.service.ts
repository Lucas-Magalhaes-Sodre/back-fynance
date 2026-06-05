import { FinancialItemType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  FinancialCategoryInput,
  ListFinancialCategoriesInput,
  UpdateFinancialCategoryInput
} from './financial-category.schemas.js';

const defaultCategories = [
  { name: 'Salário', type: FinancialItemType.INCOME, color: '#2563EB' },
  { name: 'Freelance', type: FinancialItemType.INCOME, color: '#0F766E' },
  { name: 'Investimentos', type: FinancialItemType.INCOME, color: '#7C3AED' },
  { name: 'Renda Extra', type: FinancialItemType.INCOME, color: '#16A34A' },
  { name: 'Cashback/Reembolso', type: FinancialItemType.INCOME, color: '#0891B2' },
  { name: 'Vendas', type: FinancialItemType.INCOME, color: '#DB2777' },
  { name: 'Benefícios', type: FinancialItemType.INCOME, color: '#CA8A04' },
  { name: 'Outros', type: FinancialItemType.INCOME, color: '#64748B' },
  { name: 'Moradia', type: FinancialItemType.EXPENSE, color: '#DC2626' },
  { name: 'Alimentação', type: FinancialItemType.EXPENSE, color: '#CA8A04' },
  { name: 'Transporte', type: FinancialItemType.EXPENSE, color: '#0891B2' },
  { name: 'Cartão de Crédito', type: FinancialItemType.EXPENSE, color: '#EA580C' },
  { name: 'Saúde', type: FinancialItemType.EXPENSE, color: '#DB2777' },
  { name: 'Educação', type: FinancialItemType.EXPENSE, color: '#7C3AED' },
  { name: 'Assinaturas', type: FinancialItemType.EXPENSE, color: '#475569' },
  { name: 'Lazer', type: FinancialItemType.EXPENSE, color: '#16A34A' },
  { name: 'Impostos', type: FinancialItemType.EXPENSE, color: '#9333EA' },
  { name: 'Compras', type: FinancialItemType.EXPENSE, color: '#F59E0B' },
  { name: 'Outros', type: FinancialItemType.EXPENSE, color: '#64748B' }
];

function normalizeType(type: 'INCOME' | 'EXPENSE') {
  return type === 'INCOME' ? FinancialItemType.INCOME : FinancialItemType.EXPENSE;
}

function normalizeCategoryName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

async function assertUniqueCategoryName(userId: string, type: FinancialItemType, name: string, exceptId?: string) {
  const categories = await prisma.financialCategory.findMany({
    where: {
      userId,
      type,
      id: exceptId ? { not: exceptId } : undefined
    },
    select: { name: true }
  });

  const normalizedName = normalizeCategoryName(name);
  const duplicated = categories.some((category) => normalizeCategoryName(category.name) === normalizedName);
  if (!duplicated) return;

  const error = new Error('Ja existe uma categoria com este nome para este tipo') as Error & { statusCode: number };
  error.statusCode = 409;
  throw error;
}

function itemTypesForCategory(type: FinancialItemType) {
  return type === FinancialItemType.INCOME
    ? [FinancialItemType.INCOME]
    : [FinancialItemType.EXPENSE];
}

function serializeCategory(category: {
  id: string;
  userId: string;
  name: string;
  type: FinancialItemType;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...category, type: category.type === FinancialItemType.INCOME ? 'INCOME' : 'EXPENSE' };
}

async function ensureDefaultCategories(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { financialCategoriesInitialized: true }
  });
  if (!user || user.financialCategoriesInitialized) return;

  await prisma.$transaction([
    prisma.financialCategory.createMany({
      data: defaultCategories.map((category) => ({ userId, ...category })),
      skipDuplicates: true
    }),
    prisma.user.update({
      where: { id: userId },
      data: { financialCategoriesInitialized: true }
    })
  ]);
}

export async function listFinancialCategories(userId: string, filters: ListFinancialCategoriesInput) {
  await ensureDefaultCategories(userId);
  const categories = await prisma.financialCategory.findMany({
    where: {
      userId,
      type: filters.type ? normalizeType(filters.type) : undefined
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }]
  });

  return categories.map(serializeCategory);
}

export async function createFinancialCategory(userId: string, input: FinancialCategoryInput) {
  await ensureDefaultCategories(userId);
  const type = normalizeType(input.type);
  const name = input.name.trim();
  await assertUniqueCategoryName(userId, type, name);

  try {
    const category = await prisma.financialCategory.create({
      data: {
        userId,
        name,
        type,
        color: input.color.toUpperCase()
      }
    });
    return serializeCategory(category);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const conflict = new Error('Categoria ja cadastrada') as Error & { statusCode: number };
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

export async function updateFinancialCategory(userId: string, id: string, input: UpdateFinancialCategoryInput) {
  await ensureDefaultCategories(userId);
  const existing = await prisma.financialCategory.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Categoria nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const nextType = input.type ? normalizeType(input.type) : existing.type;
  const nextName = input.name?.trim() ?? existing.name;
  await assertUniqueCategoryName(userId, nextType, nextName, id);

  const category = await prisma.$transaction(async (tx) => {
    const updated = await tx.financialCategory.update({
      where: { id },
      data: {
        name: nextName,
        type: nextType,
        color: input.color?.toUpperCase()
      }
    });

    if (nextName !== existing.name || nextType !== existing.type) {
      await tx.financialItem.updateMany({
        where: { userId, category: existing.name, type: { in: itemTypesForCategory(existing.type) } },
        data: { category: nextName }
      });
    }

    return updated;
  });

  return serializeCategory(category);
}

export async function deleteFinancialCategory(userId: string, id: string) {
  await ensureDefaultCategories(userId);
  const existing = await prisma.financialCategory.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Categoria nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await prisma.financialCategory.delete({ where: { id } });
}
