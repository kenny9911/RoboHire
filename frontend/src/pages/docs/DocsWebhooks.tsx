import { useTranslation } from 'react-i18next';
import { CodeBlock, ParamTable } from '../../components/docs';

export default function DocsWebhooks() {
  const { t } = useTranslation();

  const eventTypes = [
    { name: 'candidate.matched', type: 'string', description: 'Triggered when a candidate is matched against a job' },
    { name: 'candidate.screened', type: 'string', description: 'Triggered when candidate screening is complete' },
    { name: 'interview.scheduled', type: 'string', description: 'Triggered when an interview is scheduled' },
    { name: 'interview.evaluated', type: 'string', description: 'Triggered when interview evaluation is complete' },
    { name: 'resume.parsed', type: 'string', description: 'Triggered when a resume has been parsed' },
  ];

  const payloadFields = [
    { name: 'event', type: 'string', required: true, description: 'The event type' },
    { name: 'timestamp', type: 'string', required: true, description: 'ISO 8601 timestamp of the event' },
    { name: 'data', type: 'object', required: true, description: 'Event-specific data payload' },
    { name: 'webhookId', type: 'string', required: true, description: 'Unique identifier for this webhook delivery' },
  ];

  const examplePayload = `{
  "event": "candidate.matched",
  "timestamp": "2024-02-15T10:30:00Z",
  "webhookId": "wh_abc123xyz",
  "data": {
    "candidateId": "cand_12345",
    "candidateName": "John Doe",
    "candidateEmail": "john.doe@email.com",
    "jobId": "job_67890",
    "jobTitle": "Senior Frontend Developer",
    "matchScore": 85,
    "recommendation": "STRONG_MATCH"
  }
}`;

  const verificationCode = `import crypto from 'crypto';

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook handler:
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-robohire-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process the webhook
  const { event, data } = req.body;
  console.log(\`Received event: \${event}\`, data);
  
  res.status(200).send('OK');
});`;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.webhooks.title', 'Webhooks')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.webhooks.intro', 'Receive real-time notifications when events occur in RoboHire. Webhooks allow you to integrate with your existing systems and automate workflows.')}
      </p>

      {/* Setup */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.webhooks.setup.title', 'Setting Up Webhooks')}
      </h2>
      <ol className="list-decimal list-inside space-y-2 text-gray-600 mb-6">
        <li>{t('docs.webhooks.setup.step1', 'Configure your webhook URL in the dashboard settings')}</li>
        <li>{t('docs.webhooks.setup.step2', 'Select which events you want to receive')}</li>
        <li>{t('docs.webhooks.setup.step3', 'Copy your webhook secret for signature verification')}</li>
        <li>{t('docs.webhooks.setup.step4', 'Implement an endpoint to receive webhook payloads')}</li>
      </ol>

      {/* Event Types */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.webhooks.events.title', 'Event Types')}
      </h2>
      <ParamTable title={t('docs.webhooks.events.tableTitle', 'Available Events')} params={eventTypes} />

      {/* Payload Structure */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.webhooks.payload.title', 'Payload Structure')}
      </h2>
      <ParamTable title={t('docs.webhooks.payload.tableTitle', 'Payload Fields')} params={payloadFields} />

      <CodeBlock code={examplePayload} language="json" title={t('docs.webhooks.payload.exampleTitle', 'Example Webhook Payload')} />

      {/* Signature Verification */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.webhooks.verification.title', 'Signature Verification')}
      </h2>
      <p className="text-gray-600 mb-4">
        {t('docs.webhooks.verification.desc', 'All webhook requests include an X-RoboHire-Signature header containing an HMAC-SHA256 signature of the payload. Always verify this signature to ensure the webhook is from RoboHire.')}
      </p>

      <CodeBlock code={verificationCode} language="javascript" title={t('docs.webhooks.verification.exampleTitle', 'Verification Example (Node.js)')} />

      {/* Best Practices */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.webhooks.bestPractices.title', 'Best Practices')}
      </h2>
      <div className="bg-blue-50 rounded-xl p-6">
        <ul className="space-y-3 text-blue-800 text-sm">
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t('docs.webhooks.bestPractices.respond', 'Respond quickly: Return a 200 status within 5 seconds to avoid timeouts')}</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t('docs.webhooks.bestPractices.async', 'Process asynchronously: Queue webhook processing for heavy operations')}</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t('docs.webhooks.bestPractices.duplicates', 'Handle duplicates: Use webhookId to detect and handle duplicate deliveries')}</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t('docs.webhooks.bestPractices.verify', 'Always verify: Check the signature on every request')}</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t('docs.webhooks.bestPractices.https', 'Use HTTPS: Always use HTTPS endpoints for security')}</span>
          </li>
        </ul>
      </div>

      {/* Retry Policy */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.webhooks.retries.title', 'Retry Policy')}
      </h2>
      <p className="text-gray-600 mb-4">
        {t('docs.webhooks.retries.desc', 'If your endpoint returns an error or times out, we will retry the webhook delivery:')}
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-1">
        <li>{t('docs.webhooks.retries.r1', '1st retry: After 1 minute')}</li>
        <li>{t('docs.webhooks.retries.r2', '2nd retry: After 5 minutes')}</li>
        <li>{t('docs.webhooks.retries.r3', '3rd retry: After 30 minutes')}</li>
        <li>{t('docs.webhooks.retries.r4', '4th retry: After 2 hours')}</li>
        <li>{t('docs.webhooks.retries.r5', '5th retry: After 24 hours')}</li>
      </ul>
    </div>
  );
}
