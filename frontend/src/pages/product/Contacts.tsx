import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';

// ─── Types ───────────────────────────────────────────────────

interface CompanyRef {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  contactType: string;
  companyId: string | null;
  company: CompanyRef | null;
  notes: string | null;
  lastContactedAt: string | null;
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  location: string | null;
  website: string | null;
  notes: string | null;
  openJobs: number;
  totalPlaced: number;
  _count: { contacts: number };
  createdAt: string;
}

interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Constants ───────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
];

const CONTACT_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  hiring_manager: { bg: 'bg-blue-100', text: 'text-blue-700' },
  client: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  vendor: { bg: 'bg-purple-100', text: 'text-purple-700' },
  reference: { bg: 'bg-amber-100', text: 'text-amber-700' },
};

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function formatContactType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatLastContacted(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────

export default function Contacts() {
  const { t } = useTranslation();

  // Tab state
  const [activeTab, setActiveTab] = useState<'contacts' | 'companies'>('contacts');

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsPagination, setContactsPagination] = useState<Pagination | null>(null);
  const [contactsLoading, setContactsLoading] = useState(true);

  // Companies state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesPagination, setCompaniesPagination] = useState<Pagination | null>(null);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Modal state
  const [showContactModal, setShowContactModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  // Form state for contact
  const [contactForm, setContactForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    jobTitle: '',
    contactType: 'client',
    companyId: '',
    notes: '',
  });

  // Form state for company
  const [companyForm, setCompanyForm] = useState({
    name: '',
    industry: '',
    size: '',
    location: '',
    website: '',
    notes: '',
    openJobs: 0,
    totalPlaced: 0,
  });

  const [saving, setSaving] = useState(false);

  // ─── Data fetching ───────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (search) params.search = search;
      if (typeFilter !== 'all') params.contactType = typeFilter;
      const { data } = await axios.get('/api/v1/contacts', { params });
      setContacts(data.data);
      setContactsPagination(data.pagination);
    } catch {
      console.error('Failed to fetch contacts');
    } finally {
      setContactsLoading(false);
    }
  }, [search, typeFilter]);

  const fetchCompanies = useCallback(async () => {
    setCompaniesLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (search) params.search = search;
      const { data } = await axios.get('/api/v1/contacts/companies/list', { params });
      setCompanies(data.data);
      setCompaniesPagination(data.pagination);
    } catch {
      console.error('Failed to fetch companies');
    } finally {
      setCompaniesLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    if (activeTab === 'companies') {
      fetchCompanies();
    }
  }, [activeTab, fetchCompanies]);

  // ─── Contact CRUD ────────────────────────────────────────

  function openAddContact() {
    setEditingContact(null);
    setContactForm({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', contactType: 'client', companyId: '', notes: '' });
    setShowContactModal(true);
  }

  function openEditContact(c: Contact) {
    setEditingContact(c);
    setContactForm({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email || '',
      phone: c.phone || '',
      jobTitle: c.jobTitle || '',
      contactType: c.contactType,
      companyId: c.companyId || '',
      notes: c.notes || '',
    });
    setShowContactModal(true);
  }

  async function saveContact() {
    setSaving(true);
    try {
      if (editingContact) {
        await axios.put(`/api/v1/contacts/${editingContact.id}`, contactForm);
      } else {
        await axios.post('/api/v1/contacts', contactForm);
      }
      setShowContactModal(false);
      fetchContacts();
    } catch {
      console.error('Failed to save contact');
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(id: string) {
    if (!confirm(t('contacts.confirmDelete', 'Are you sure you want to delete this contact?'))) return;
    try {
      await axios.delete(`/api/v1/contacts/${id}`);
      fetchContacts();
    } catch {
      console.error('Failed to delete contact');
    }
  }

  // ─── Company CRUD ────────────────────────────────────────

  function openAddCompany() {
    setEditingCompany(null);
    setCompanyForm({ name: '', industry: '', size: '', location: '', website: '', notes: '', openJobs: 0, totalPlaced: 0 });
    setShowCompanyModal(true);
  }

  function openEditCompany(c: Company) {
    setEditingCompany(c);
    setCompanyForm({
      name: c.name,
      industry: c.industry || '',
      size: c.size || '',
      location: c.location || '',
      website: c.website || '',
      notes: c.notes || '',
      openJobs: c.openJobs,
      totalPlaced: c.totalPlaced,
    });
    setShowCompanyModal(true);
  }

  async function saveCompany() {
    setSaving(true);
    try {
      if (editingCompany) {
        await axios.put(`/api/v1/contacts/companies/${editingCompany.id}`, companyForm);
      } else {
        await axios.post('/api/v1/contacts/companies', companyForm);
      }
      setShowCompanyModal(false);
      fetchCompanies();
    } catch {
      console.error('Failed to save company');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCompany(id: string) {
    if (!confirm(t('contacts.confirmDeleteCompany', 'Are you sure you want to delete this company?'))) return;
    try {
      await axios.delete(`/api/v1/contacts/companies/${id}`);
      fetchCompanies();
    } catch {
      console.error('Failed to delete company');
    }
  }

  // ─── Render ──────────────────────────────────────────────

  const contactCount = contactsPagination?.total ?? contacts.length;
  const companyCount = companiesPagination?.total ?? companies.length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('contacts.title', 'Contacts & Companies')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('contacts.subtitle', 'Manage your hiring managers, clients, references, and partner companies.')}
          </p>
        </div>
        <button
          onClick={activeTab === 'contacts' ? openAddContact : openAddCompany}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {activeTab === 'contacts'
            ? t('contacts.addContact', 'Add Contact')
            : t('contacts.addCompany', 'Add Company')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex items-center gap-2 pb-3 text-sm font-medium transition-colors relative ${
            activeTab === 'contacts'
              ? 'text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t('contacts.contactsTab', 'Contacts')}
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            activeTab === 'contacts'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-slate-100 text-slate-600'
          }`}>
            {contactCount}
          </span>
          {activeTab === 'contacts' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('companies')}
          className={`flex items-center gap-2 pb-3 text-sm font-medium transition-colors relative ${
            activeTab === 'companies'
              ? 'text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          {t('contacts.companiesTab', 'Companies')}
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            activeTab === 'companies'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-slate-100 text-slate-600'
          }`}>
            {companyCount}
          </span>
          {activeTab === 'companies' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
          )}
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === 'contacts'
                ? t('contacts.searchPlaceholder', 'Search contacts by name, email, or company...')
                : t('contacts.searchCompanyPlaceholder', 'Search companies by name, industry, or location...')
            }
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors"
          />
        </div>
        {activeTab === 'contacts' && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors"
          >
            <option value="all">{t('contacts.allTypes', 'All Types')}</option>
            <option value="hiring_manager">{t('contacts.type.hiringManager', 'Hiring Manager')}</option>
            <option value="client">{t('contacts.type.client', 'Client')}</option>
            <option value="vendor">{t('contacts.type.vendor', 'Vendor')}</option>
            <option value="reference">{t('contacts.type.reference', 'Reference')}</option>
          </select>
        )}
      </div>

      {/* Content */}
      {activeTab === 'contacts' ? (
        contactsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16">
            <svg className="h-10 w-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-slate-900">{t('contacts.noContacts', 'No contacts yet')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('contacts.noContactsDesc', 'Add your first contact to get started.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onEdit={() => openEditContact(contact)}
                onDelete={() => deleteContact(contact.id)}
              />
            ))}
          </div>
        )
      ) : (
        companiesLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16">
            <svg className="h-10 w-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-sm font-medium text-slate-900">{t('contacts.noCompanies', 'No companies yet')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('contacts.noCompaniesDesc', 'Add your first company to get started.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {companies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                onEdit={() => openEditCompany(company)}
                onDelete={() => deleteCompany(company.id)}
              />
            ))}
          </div>
        )
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <Modal
          title={editingContact ? t('contacts.editContact', 'Edit Contact') : t('contacts.addContact', 'Add Contact')}
          onClose={() => setShowContactModal(false)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.firstName', 'First Name')} *</label>
                <input
                  type="text"
                  value={contactForm.firstName}
                  onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.lastName', 'Last Name')} *</label>
                <input
                  type="text"
                  value={contactForm.lastName}
                  onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.email', 'Email')}</label>
              <input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.phone', 'Phone')}</label>
              <input
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.jobTitle', 'Job Title')}</label>
              <input
                type="text"
                value={contactForm.jobTitle}
                onChange={(e) => setContactForm({ ...contactForm, jobTitle: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.type', 'Type')}</label>
              <select
                value={contactForm.contactType}
                onChange={(e) => setContactForm({ ...contactForm, contactType: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              >
                <option value="hiring_manager">{t('contacts.type.hiringManager', 'Hiring Manager')}</option>
                <option value="client">{t('contacts.type.client', 'Client')}</option>
                <option value="vendor">{t('contacts.type.vendor', 'Vendor')}</option>
                <option value="reference">{t('contacts.type.reference', 'Reference')}</option>
              </select>
            </div>
            {companies.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.company', 'Company')}</label>
                <select
                  value={contactForm.companyId}
                  onChange={(e) => setContactForm({ ...contactForm, companyId: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                >
                  <option value="">{t('contacts.form.noCompany', 'No company')}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.notes', 'Notes')}</label>
              <textarea
                value={contactForm.notes}
                onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowContactModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {t('contacts.cancel', 'Cancel')}
              </button>
              <button
                onClick={saveContact}
                disabled={!contactForm.firstName || !contactForm.lastName || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t('contacts.saving', 'Saving...') : editingContact ? t('contacts.update', 'Update') : t('contacts.create', 'Create')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Company Modal */}
      {showCompanyModal && (
        <Modal
          title={editingCompany ? t('contacts.editCompany', 'Edit Company') : t('contacts.addCompany', 'Add Company')}
          onClose={() => setShowCompanyModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.companyName', 'Company Name')} *</label>
              <input
                type="text"
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.industry', 'Industry')}</label>
                <input
                  type="text"
                  value={companyForm.industry}
                  onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.size', 'Company Size')}</label>
                <input
                  type="text"
                  value={companyForm.size}
                  onChange={(e) => setCompanyForm({ ...companyForm, size: e.target.value })}
                  placeholder="e.g. 50-200"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.location', 'Location')}</label>
              <input
                type="text"
                value={companyForm.location}
                onChange={(e) => setCompanyForm({ ...companyForm, location: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.website', 'Website')}</label>
              <input
                type="url"
                value={companyForm.website}
                onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.openJobs', 'Open Jobs')}</label>
                <input
                  type="number"
                  value={companyForm.openJobs}
                  onChange={(e) => setCompanyForm({ ...companyForm, openJobs: parseInt(e.target.value) || 0 })}
                  min={0}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.totalPlaced', 'Total Placed')}</label>
                <input
                  type="number"
                  value={companyForm.totalPlaced}
                  onChange={(e) => setCompanyForm({ ...companyForm, totalPlaced: parseInt(e.target.value) || 0 })}
                  min={0}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contacts.form.notes', 'Notes')}</label>
              <textarea
                value={companyForm.notes}
                onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCompanyModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {t('contacts.cancel', 'Cancel')}
              </button>
              <button
                onClick={saveCompany}
                disabled={!companyForm.name || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t('contacts.saving', 'Saving...') : editingCompany ? t('contacts.update', 'Update') : t('contacts.create', 'Create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function ContactCard({ contact, onEdit, onDelete }: { contact: Contact; onEdit: () => void; onDelete: () => void }) {
  const fullName = `${contact.firstName} ${contact.lastName}`;
  const avatarColor = getAvatarColor(fullName);
  const initials = getInitials(contact.firstName, contact.lastName);
  const typeStyle = CONTACT_TYPE_STYLES[contact.contactType] || CONTACT_TYPE_STYLES.client;

  return (
    <div
      className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`h-11 w-11 rounded-full ${avatarColor} flex items-center justify-center shrink-0`}>
            <span className="text-xs font-medium text-white">{initials}</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
              {fullName}
            </h3>
            {contact.jobTitle && (
              <p className="text-xs text-slate-500 truncate">{contact.jobTitle}</p>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}>
          {formatContactType(contact.contactType)}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {contact.company && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="truncate">{contact.company.name}</span>
          </div>
        )}
        {contact.email && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="truncate text-blue-600">{contact.email}</span>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span>{contact.phone}</span>
          </div>
        )}
      </div>

      {contact.lastContactedAt && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Last contacted: {formatLastContacted(contact.lastContactedAt)}
          </p>
        </div>
      )}

      {/* Hover action buttons */}
      <div className="absolute top-3 right-3 hidden group-hover:flex gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onDelete}
          className="rounded-md p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CompanyCard({ company, onEdit, onDelete }: { company: Company; onEdit: () => void; onDelete: () => void }) {
  const avatarColor = getAvatarColor(company.name);
  const initial = company.name.charAt(0).toUpperCase();

  return (
    <div
      className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative"
      onClick={onEdit}
    >
      <div className="flex items-start gap-3">
        <div className={`h-11 w-11 rounded-lg ${avatarColor} flex items-center justify-center shrink-0`}>
          <span className="text-sm font-semibold text-white">{initial}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
            {company.name}
          </h3>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {company.industry && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="truncate">{company.industry}</span>
          </div>
        )}
        {company.size && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{company.size} employees</span>
          </div>
        )}
        {company.location && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{company.location}</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs">
          <svg className="h-3.5 w-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-slate-600">{company.openJobs} open jobs</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-slate-600">{company.totalPlaced} placed</span>
        </div>
      </div>

      {/* Hover delete button */}
      <div className="absolute top-3 right-3 hidden group-hover:flex gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onDelete}
          className="rounded-md p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
