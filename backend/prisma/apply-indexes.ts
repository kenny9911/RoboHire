import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS "Resume_parsedData_gin" ON "Resume" USING GIN ("parsedData" jsonb_path_ops)`,
    `CREATE INDEX IF NOT EXISTS "Resume_parsedData_skills_gin" ON "Resume" USING GIN (("parsedData"->'skills'))`,
    `CREATE INDEX IF NOT EXISTS "Resume_parsedData_education_gin" ON "Resume" USING GIN (("parsedData"->'education'))`,
    `CREATE INDEX IF NOT EXISTS "Resume_parsedData_experience_gin" ON "Resume" USING GIN (("parsedData"->'experience'))`,
  ];

  for (const sql of indexes) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('OK:', sql.slice(0, 80));
    } catch (err: any) {
      console.error('SKIP:', err.message?.slice(0, 120));
    }
  }
  await prisma.$disconnect();
}

main();
