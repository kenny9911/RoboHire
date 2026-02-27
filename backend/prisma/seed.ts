import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  console.log('Seeding database...');

  // Demo user credentials
  const demoEmail = 'demo@robohire.io';
  const demoPassword = 'demo1234';
  const demoName = 'Demo User';
  const demoCompany = 'RoboHire Demo';

  // Check if demo user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: demoEmail },
  });

  if (existingUser) {
    console.log('Demo user already exists:', demoEmail);
  } else {
    // Hash password
    const passwordHash = await bcrypt.hash(demoPassword, 12);

    // Create demo user
    const demoUser = await prisma.user.create({
      data: {
        email: demoEmail,
        passwordHash,
        name: demoName,
        company: demoCompany,
        provider: 'email',
      },
    });

    console.log('Created demo user:', {
      id: demoUser.id,
      email: demoUser.email,
      name: demoUser.name,
    });

    // Create a sample hiring request for the demo user
    const sampleHiringRequest = await prisma.hiringRequest.create({
      data: {
        userId: demoUser.id,
        title: 'Senior Software Engineer',
        requirements: `We are looking for a Senior Software Engineer with:
- 5+ years of experience in software development
- Strong proficiency in TypeScript/JavaScript
- Experience with React and Node.js
- Knowledge of cloud services (AWS/GCP)
- Excellent problem-solving skills
- Strong communication abilities`,
        jobDescription: `About the Role:
Join our engineering team to build cutting-edge AI-powered recruitment tools.

Responsibilities:
- Design and implement scalable backend services
- Lead technical discussions and code reviews
- Mentor junior developers
- Collaborate with product team on new features

Benefits:
- Competitive salary
- Remote-first culture
- Health insurance
- Learning budget`,
        status: 'active',
      },
    });

    console.log('Created sample hiring request:', {
      id: sampleHiringRequest.id,
      title: sampleHiringRequest.title,
    });
  }

  // Admin user
  const adminEmail = 'admin@robohire.io';
  const adminPassword = 'Lightark@1';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    // Ensure role is admin
    if (existingAdmin.role !== 'admin') {
      await prisma.user.update({
        where: { email: adminEmail },
        data: { role: 'admin' },
      });
      console.log('Updated existing user to admin:', adminEmail);
    } else {
      console.log('Admin user already exists:', adminEmail);
    }
  } else {
    const adminHash = await bcrypt.hash(adminPassword, 12);
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: adminHash,
        name: 'Admin',
        company: 'RoboHire',
        provider: 'email',
        role: 'admin',
      },
    });
    console.log('Created admin user:', { id: adminUser.id, email: adminUser.email });
  }

  // Seed default pricing config
  const defaultPricing: Record<string, string> = {
    price_starter_monthly: '29',
    price_growth_monthly: '199',
    price_business_monthly: '399',
  };

  for (const [key, value] of Object.entries(defaultPricing)) {
    await prisma.appConfig.upsert({
      where: { key },
      update: {},  // Don't overwrite if already set
      create: { key, value },
    });
  }
  console.log('Pricing config seeded (defaults preserved if already set)');

  console.log('\n========================================');
  console.log('Account Credentials:');
  console.log('========================================');
  console.log(`Demo:  ${demoEmail} / ${demoPassword}`);
  console.log(`Admin: ${adminEmail} / ${adminPassword}`);
  console.log('========================================\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
