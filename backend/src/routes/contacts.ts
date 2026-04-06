import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getVisibilityScope, buildUserIdFilter } from '../lib/teamVisibility.js';
import '../types/auth.js';

const router = Router();

// ─── Contacts ────────────────────────────────────────────────

/** GET /contacts — list contacts with search, filter, pagination */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, contactType, page = '1', limit = '20' } = req.query;
    const scope = await getVisibilityScope(req.user!);
    const userFilter = buildUserIdFilter(scope);

    const where: any = { ...userFilter };
    if (contactType && typeof contactType === 'string' && contactType !== 'all') {
      where.contactType = contactType;
    }
    if (search && typeof search === 'string') {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        include: { company: { select: { id: true, name: true } } },
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({
      data: contacts,
      pagination: {
        total,
        page: pageNum,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Error listing contacts:', error);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

/** GET /contacts/:id — single contact */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      include: { company: true },
    });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ data: contact });
  } catch (error) {
    console.error('Error getting contact:', error);
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

/** POST /contacts — create contact */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, jobTitle, contactType, companyId, notes } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }

    const contact = await prisma.contact.create({
      data: {
        userId: req.user!.id,
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        jobTitle: jobTitle || null,
        contactType: contactType || 'client',
        companyId: companyId || null,
        notes: notes || null,
        lastContactedAt: new Date(),
      },
      include: { company: { select: { id: true, name: true } } },
    });

    res.status(201).json({ data: contact });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

/** PUT /contacts/:id — update contact */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, jobTitle, contactType, companyId, notes, lastContactedAt } = req.body;

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(email !== undefined && { email: email || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(jobTitle !== undefined && { jobTitle: jobTitle || null }),
        ...(contactType !== undefined && { contactType }),
        ...(companyId !== undefined && { companyId: companyId || null }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(lastContactedAt !== undefined && { lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null }),
      },
      include: { company: { select: { id: true, name: true } } },
    });

    res.json({ data: contact });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

/** DELETE /contacts/:id */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ─── Companies ───────────────────────────────────────────────

/** GET /contacts/companies/list — list companies */
router.get('/companies/list', requireAuth, async (req, res) => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const scope = await getVisibilityScope(req.user!);
    const userFilter = buildUserIdFilter(scope);

    const where: any = { ...userFilter };
    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { contacts: true } } },
      }),
      prisma.company.count({ where }),
    ]);

    res.json({
      data: companies,
      pagination: {
        total,
        page: pageNum,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Error listing companies:', error);
    res.status(500).json({ error: 'Failed to list companies' });
  }
});

/** GET /contacts/companies/:id — single company */
router.get('/companies/:id', requireAuth, async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: { orderBy: { createdAt: 'desc' } },
        _count: { select: { contacts: true } },
      },
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ data: company });
  } catch (error) {
    console.error('Error getting company:', error);
    res.status(500).json({ error: 'Failed to get company' });
  }
});

/** POST /contacts/companies — create company */
router.post('/companies', requireAuth, async (req, res) => {
  try {
    const { name, industry, size, location, website, notes, openJobs, totalPlaced } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const company = await prisma.company.create({
      data: {
        userId: req.user!.id,
        name,
        industry: industry || null,
        size: size || null,
        location: location || null,
        website: website || null,
        notes: notes || null,
        openJobs: openJobs || 0,
        totalPlaced: totalPlaced || 0,
      },
      include: { _count: { select: { contacts: true } } },
    });

    res.status(201).json({ data: company });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

/** PUT /contacts/companies/:id — update company */
router.put('/companies/:id', requireAuth, async (req, res) => {
  try {
    const { name, industry, size, location, website, notes, openJobs, totalPlaced } = req.body;

    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(industry !== undefined && { industry: industry || null }),
        ...(size !== undefined && { size: size || null }),
        ...(location !== undefined && { location: location || null }),
        ...(website !== undefined && { website: website || null }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(openJobs !== undefined && { openJobs }),
        ...(totalPlaced !== undefined && { totalPlaced }),
      },
      include: { _count: { select: { contacts: true } } },
    });

    res.json({ data: company });
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

/** DELETE /contacts/companies/:id */
router.delete('/companies/:id', requireAuth, async (req, res) => {
  try {
    await prisma.company.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
