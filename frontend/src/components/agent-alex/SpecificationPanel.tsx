import React from 'react';
import { HiringRequirements } from './types';
import { Briefcase, ListChecks, GraduationCap, DollarSign, MapPin, Users, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface Props {
  data: HiringRequirements;
}

const Section = ({ title, icon: Icon, children }: { title: string, icon: React.ElementType, children: React.ReactNode }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4 sm:mb-6"
  >
    <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 bg-slate-50 border-b border-slate-100">
      <Icon className="w-4 h-4 text-indigo-600 shrink-0" />
      <h3 className="font-semibold text-slate-800 text-xs sm:text-sm uppercase tracking-wider">{title}</h3>
    </div>
    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
      {children}
    </div>
  </motion.div>
);

const Field = ({ label, value }: { label: string, value?: string | string[] }) => {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      {Array.isArray(value) ? (
        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
          {value.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      ) : (
        <div className="text-sm text-slate-700">{value}</div>
      )}
    </div>
  );
};

export function SpecificationPanel({ data }: Props) {
  const { t } = useTranslation();
  const hasOverview = data.jobTitle || data.department || data.reportingLine || data.roleType || data.headcount;
  const hasResponsibilities = data.primaryResponsibilities?.length || data.secondaryResponsibilities?.length;
  const hasQualifications = data.hardSkills?.length || data.softSkills?.length || data.yearsOfExperience || data.education || data.industryExperience;
  const hasPreferred = data.preferredQualifications?.length;
  const hasComp = data.salaryRange || data.equityBonus || data.benefits?.length;
  const hasLogistics = data.workLocation || data.geographicRestrictions || data.startDate || data.travelRequirements;
  const hasProcess = data.interviewStages?.length || data.keyStakeholders?.length || data.timelineExpectations;
  const hasContext = data.teamCulture || data.reasonForOpening || data.dealBreakers?.length;

  const isEmpty = !hasOverview && !hasResponsibilities && !hasQualifications && !hasPreferred && !hasComp && !hasLogistics && !hasProcess && !hasContext;

  if (isEmpty) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-4 sm:p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
        <Briefcase className="w-10 h-10 sm:w-12 sm:h-12 mb-3 sm:mb-4 text-slate-300" />
        <p className="text-base sm:text-lg font-medium text-slate-600">{t('agentAlex.spec.empty', 'No requirements captured yet.')}</p>
        <p className="text-xs sm:text-sm mt-2">{t('agentAlex.spec.emptyHint', 'Start chatting with the agent to build your hiring specification.')}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-2 pb-20 custom-scrollbar">
      {hasOverview && (
        <Section title={t('agentAlex.spec.sections.roleOverview', '1. Role Overview')} icon={Briefcase}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('agentAlex.spec.fields.jobTitle', 'Job Title')} value={data.jobTitle} />
            <Field label={t('agentAlex.spec.fields.department', 'Department/Team')} value={data.department} />
            <Field label={t('agentAlex.spec.fields.reportingLine', 'Reporting Line')} value={data.reportingLine} />
            <Field label={t('agentAlex.spec.fields.roleType', 'Role Type')} value={data.roleType} />
            <Field label={t('agentAlex.spec.fields.headcount', 'Headcount')} value={data.headcount} />
          </div>
        </Section>
      )}

      {hasResponsibilities && (
        <Section title={t('agentAlex.spec.sections.responsibilities', '2. Core Responsibilities')} icon={ListChecks}>
          <Field label={t('agentAlex.spec.fields.primaryResponsibilities', 'Primary Responsibilities')} value={data.primaryResponsibilities} />
          <Field label={t('agentAlex.spec.fields.secondaryResponsibilities', 'Secondary / Stretch')} value={data.secondaryResponsibilities} />
        </Section>
      )}

      {hasQualifications && (
        <Section title={t('agentAlex.spec.sections.requiredQualifications', '3. Required Qualifications (Must-Haves)')} icon={GraduationCap}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Field label={t('agentAlex.spec.fields.yearsOfExperience', 'Years of Experience')} value={data.yearsOfExperience} />
            <Field label={t('agentAlex.spec.fields.education', 'Education')} value={data.education} />
            <Field label={t('agentAlex.spec.fields.industryExperience', 'Industry Experience')} value={data.industryExperience} />
          </div>
          <div className="space-y-4">
            <Field label={t('agentAlex.spec.fields.hardSkills', 'Hard Skills')} value={data.hardSkills} />
            <Field label={t('agentAlex.spec.fields.softSkills', 'Soft Skills')} value={data.softSkills} />
          </div>
        </Section>
      )}

      {hasPreferred && (
        <Section title={t('agentAlex.spec.sections.preferredQualifications', '4. Preferred Qualifications (Nice-to-Haves)')} icon={GraduationCap}>
          <Field label={t('agentAlex.spec.fields.niceToHave', 'Nice-to-have Skills & Credentials')} value={data.preferredQualifications} />
        </Section>
      )}

      {hasComp && (
        <Section title={t('agentAlex.spec.sections.compensation', '5. Compensation & Benefits')} icon={DollarSign}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Field label={t('agentAlex.spec.fields.salaryRange', 'Salary Range')} value={data.salaryRange} />
            <Field label={t('agentAlex.spec.fields.equityBonus', 'Equity / Bonus')} value={data.equityBonus} />
          </div>
          <Field label={t('agentAlex.spec.fields.benefits', 'Key Benefits')} value={data.benefits} />
        </Section>
      )}

      {hasLogistics && (
        <Section title={t('agentAlex.spec.sections.logistics', '6. Logistics')} icon={MapPin}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('agentAlex.spec.fields.workLocation', 'Work Location')} value={data.workLocation} />
            <Field label={t('agentAlex.spec.fields.geographicRestrictions', 'Geographic Restrictions')} value={data.geographicRestrictions} />
            <Field label={t('agentAlex.spec.fields.startDate', 'Start Date / Urgency')} value={data.startDate} />
            <Field label={t('agentAlex.spec.fields.travelRequirements', 'Travel Requirements')} value={data.travelRequirements} />
          </div>
        </Section>
      )}

      {hasProcess && (
        <Section title={t('agentAlex.spec.sections.hiringProcess', '7. Hiring Process')} icon={Users}>
          <Field label={t('agentAlex.spec.fields.interviewStages', 'Interview Stages')} value={data.interviewStages} />
          <Field label={t('agentAlex.spec.fields.keyStakeholders', 'Key Stakeholders')} value={data.keyStakeholders} />
          <Field label={t('agentAlex.spec.fields.timelineExpectations', 'Timeline Expectations')} value={data.timelineExpectations} />
        </Section>
      )}

      {hasContext && (
        <Section title={t('agentAlex.spec.sections.additionalContext', '8. Additional Context')} icon={Info}>
          <Field label={t('agentAlex.spec.fields.teamCulture', 'Team Culture')} value={data.teamCulture} />
          <Field label={t('agentAlex.spec.fields.reasonForOpening', 'Reason for Opening')} value={data.reasonForOpening} />
          <Field label={t('agentAlex.spec.fields.dealBreakers', 'Deal Breakers')} value={data.dealBreakers} />
        </Section>
      )}
    </div>
  );
}
