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

  console.log('\n========================================');
  console.log('Demo Account Credentials:');
  console.log('========================================');
  console.log(`Email:    ${demoEmail}`);
  console.log(`Password: ${demoPassword}`);
  console.log('========================================\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
