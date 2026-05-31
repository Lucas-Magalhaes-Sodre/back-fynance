import { FinancialItemType, PrismaClient, RecurrenceType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password_hash = await bcrypt.hash('12345678', 10);

  const user = await prisma.user.upsert({
    where: { email: 'demo@minhareceita.com' },
    update: {},
    create: {
      name: 'Usuaria Demo',
      email: 'demo@minhareceita.com',
      password_hash
    }
  });

  await prisma.financialItem.deleteMany({ where: { userId: user.id } });

  await prisma.financialItem.createMany({
    data: [
      ...Array.from({ length: 12 }, (_, index) => {
        const date = new Date(new Date().getFullYear(), index, 5);
        return {
          userId: user.id,
          title: 'Salario 1',
          name: 'Salario 1',
          category: 'Salario 1',
          amount: 6200,
          type: FinancialItemType.INCOME,
          date,
          month: index + 1,
          year: date.getFullYear(),
          isFixed: true,
          recurrenceType: RecurrenceType.MONTHLY
        };
      }),
      ...Array.from({ length: 12 }, (_, index) => {
        const date = new Date(new Date().getFullYear(), index, 10);
        return {
          userId: user.id,
          title: 'Parcela casa',
          name: 'Parcela casa',
          category: 'Parcela casa',
          amount: 1800,
          type: FinancialItemType.EXPENSE,
          date,
          month: index + 1,
          year: date.getFullYear(),
          dueDay: 10,
          isFixed: true,
          recurrenceType: RecurrenceType.MONTHLY
        };
      }),
      {
        userId: user.id,
        title: 'Investimentos',
        name: 'Investimentos',
        category: 'Investimentos',
        amount: 850,
        type: FinancialItemType.INCOME,
        date: new Date(),
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      },
      {
        userId: user.id,
        title: 'Cartoes',
        name: 'Cartoes',
        category: 'Cartoes',
        amount: 940,
        type: FinancialItemType.EXPENSE,
        date: new Date(),
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      }
    ]
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
