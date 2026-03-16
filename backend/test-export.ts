import { jobToPdf, jobToText, jobToMarkdown } from './src/services/JobExportService.js';
const fakeJob = { title: 'Test', description: 'desc', companyName: 'comp' };
try {
  console.log('---TEXT---');
  console.log(jobToText(fakeJob));
  console.log('---MARKDOWN---');
  console.log(jobToMarkdown(fakeJob));
  console.log('---PDF---');
  const pdf = jobToPdf(fakeJob);
  console.log('PDF Generated');
} catch(e) {
  console.error(e);
}

