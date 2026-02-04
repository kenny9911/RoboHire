# RoboHire API

AI-Powered Recruitment APIs with multi-LLM provider support.

## Features

### Platform
- **Start Hiring Service**: AI-powered hiring agent that screens candidates, conducts interviews, and delivers evaluation reports
- **User Authentication**: Email/password login with Google, GitHub, and LinkedIn OAuth
- **Hiring Dashboard**: Manage hiring requests and track candidates
- **Modern Landing Page**: SEO-optimized marketing page with i18n support (7 languages)

### AI-Powered APIs
- **5 AI-Powered APIs** for recruitment automation
- **Multi-LLM Provider Support**: OpenAI, OpenRouter, Google Gemini
- **Language Detection**: Automatically responds in the same language as the job description
- **PDF Parsing**: Extract structured data from resume and JD PDFs with intelligent caching
- **React Admin Dashboard**: Test and manage APIs through a modern UI with code examples
- **Comprehensive Logging**: File-based JSON Lines logging with daily rotation
- **Document Storage**: Automatic caching of parsed documents and match results
- **Interview Questions Generator**: Technical, behavioral, and situational questions with probing areas
- **Cheating Detection**: AI analysis to detect AI-assisted interview answers

## Screenshots

### Admin Dashboard
The admin dashboard provides an easy way to test all APIs with built-in code examples in cURL, JavaScript, and Python.

## Documentation

📚 **[Full API Documentation](./API_DOCUMENTATION.md)** - Complete API reference with examples in cURL, JavaScript, and Python.

## API Endpoints

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/signup` | POST | Register a new user |
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/logout` | POST | Logout current user |
| `/api/auth/me` | GET | Get current user profile |
| `/api/auth/google` | GET | Google OAuth login |
| `/api/auth/github` | GET | GitHub OAuth login |
| `/api/auth/linkedin` | GET | LinkedIn OAuth login |

**Demo Account:** `demo@robohire.io` / `demo1234`

### Hiring Requests (Protected)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/hiring-requests` | POST | Create hiring request |
| `/api/v1/hiring-requests` | GET | List user's hiring requests |
| `/api/v1/hiring-requests/:id` | GET | Get hiring request with candidates |
| `/api/v1/hiring-requests/:id` | PATCH | Update hiring request |
| `/api/v1/hiring-requests/:id` | DELETE | Delete hiring request |
| `/api/v1/hiring-requests/:id/candidates` | GET | List candidates |

### AI Recruitment APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/match-resume` | POST | Match resume against job description with detailed scoring |
| `/api/v1/invite-candidate` | POST | Generate personalized interview invitation email |
| `/api/v1/parse-resume` | POST | Parse resume PDF to structured JSON (with caching) |
| `/api/v1/parse-jd` | POST | Parse job description PDF to structured JSON (with caching) |
| `/api/v1/evaluate-interview` | POST | Evaluate interview transcript |

### System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check endpoint |
| `/api/v1/stats` | GET | Detailed usage statistics |
| `/api/v1/documents` | GET | List all stored documents and match results |
| `/api/v1/logs` | GET | Log file information |

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/RoboHireAPI.git
cd RoboHireAPI

# Install dependencies for all workspaces
npm install
```

### Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and add your API keys:

```env
# LLM Provider: openai, openrouter, or google
LLM_PROVIDER=openrouter

# LLM Model
LLM_MODEL=google/gemini-3-flash

# API Keys (add the ones you need)
OPENROUTER_API_KEY=your_openrouter_key
# OPENAI_API_KEY=your_openai_key
# GOOGLE_API_KEY=your_google_key

# Logging
LOG_LEVEL=INFO
FILE_LOGGING=true
```

See [.env.example](./.env.example) for all available configuration options.

### Running the Application

```bash
# Run both backend and frontend in development mode
npm run dev

# Or run separately
npm run dev --workspace=backend   # Starts backend on port 4607
npm run dev --workspace=frontend  # Starts frontend on port 3607
```

### Access the Application

- **Landing Page**: http://localhost:3607
- **Login**: http://localhost:3607/login
- **Start Hiring**: http://localhost:3607/start-hiring
- **Dashboard**: http://localhost:3607/dashboard (requires login)
- **API Playground**: http://localhost:3607/api-playground (requires login)
- **API Server**: http://localhost:4607
- **API Documentation**: http://localhost:4607 (root endpoint)

## API Usage Examples

### Match Resume with JD

```bash
curl -X POST http://localhost:4607/api/v1/match-resume \
  -H "Content-Type: application/json" \
  -d '{
    "resume": "John Doe\nSoftware Engineer with 5 years experience in Python, JavaScript...",
    "jd": "Senior Software Engineer\nRequirements: 5+ years experience, Python, AWS..."
  }'
```

**Response includes:**
- Overall match score and grade (A+ to F)
- Must-have and nice-to-have skill analysis
- Experience validation
- Candidate potential assessment
- Hiring recommendation
- Suggested interview questions (technical, behavioral, situational)
- Areas to probe deeper with green/red flags

### Parse Resume PDF

```bash
curl -X POST http://localhost:4607/api/v1/parse-resume \
  -F "file=@resume.pdf"
```

**Response includes:**
- Personal information (name, email, phone, LinkedIn, GitHub)
- Work experience with achievements
- Education history
- Skills (technical, soft, languages, tools)
- Certifications, projects, awards
- Full extracted text

### Parse JD PDF

```bash
curl -X POST http://localhost:4607/api/v1/parse-jd \
  -F "file=@job_description.pdf"
```

**Response includes:**
- Job title, company, department
- Requirements (must-have and nice-to-have)
- Responsibilities
- Skills required
- Compensation details
- Benefits

### Generate Interview Invitation

```bash
curl -X POST http://localhost:4607/api/v1/invite-candidate \
  -H "Content-Type: application/json" \
  -d '{
    "resume": "Jane Smith\nEmail: jane@example.com\nFrontend Developer...",
    "jd": "Frontend Engineer at TechCorp..."
  }'
```

### Evaluate Interview

```bash
curl -X POST http://localhost:4607/api/v1/evaluate-interview \
  -H "Content-Type: application/json" \
  -d '{
    "resume": "Candidate resume text...",
    "jd": "Job description text...",
    "interviewScript": "Interviewer: Tell me about yourself?\nCandidate: ..."
  }'
```

## Project Structure

```
RoboHireAPI/
├── backend/
│   ├── src/
│   │   ├── index.ts                    # Express server entry
│   │   ├── routes/
│   │   │   └── api.ts                  # API route definitions
│   │   ├── agents/
│   │   │   ├── BaseAgent.ts            # Abstract base agent
│   │   │   ├── ResumeMatchAgent.ts     # Resume-JD matching
│   │   │   ├── InviteAgent.ts          # Invitation email generation
│   │   │   ├── ResumeParseAgent.ts     # Resume parsing
│   │   │   ├── JDParseAgent.ts         # JD parsing
│   │   │   └── EvaluationAgent.ts      # Interview evaluation
│   │   ├── services/
│   │   │   ├── llm/
│   │   │   │   ├── LLMService.ts       # LLM abstraction layer
│   │   │   │   ├── OpenAIProvider.ts
│   │   │   │   ├── OpenRouterProvider.ts
│   │   │   │   └── GoogleProvider.ts
│   │   │   ├── PDFService.ts           # PDF text extraction
│   │   │   ├── LanguageService.ts      # Language detection
│   │   │   ├── LoggerService.ts        # Comprehensive logging
│   │   │   └── DocumentStorageService.ts # Document caching
│   │   └── types/
│   │       └── index.ts                # TypeScript type definitions
│   ├── logs/                           # JSON Lines log files (daily rotation)
│   ├── parsed-documents/               # Cached documents
│   │   ├── resumes/
│   │   ├── jds/
│   │   └── match-results/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ApiInfoPanel.tsx        # API code examples (cURL, JS, Python)
│   │   │   ├── MatchResultDisplay.tsx  # Rich match result visualization
│   │   │   ├── JsonViewer.tsx          # JSON viewer with search
│   │   │   ├── TextArea.tsx            # Textarea with copy/paste buttons
│   │   │   └── ResultViewer.tsx        # Result display with copy/download
│   │   ├── pages/
│   │   │   ├── MatchResume.tsx
│   │   │   ├── ParseResume.tsx
│   │   │   ├── ParseJD.tsx
│   │   │   ├── InviteCandidate.tsx
│   │   │   └── EvaluateInterview.tsx
│   │   └── context/
│   │       └── FormDataContext.tsx     # Shared form state (synced resume/JD)
│   └── package.json
├── API_DOCUMENTATION.md                # Full API documentation
├── .env.example                        # Environment variable template
├── .env                                # Your local configuration
├── .gitignore
└── package.json                        # Monorepo configuration
```

## Key Features Explained

### Document Caching

Parsed resumes and JDs are automatically cached based on content hash. If you upload the same document twice, the cached result is returned instantly.

```
parsed-documents/
├── resumes/
│   ├── John_Doe_Resume.json
│   └── _index.json              # Hash-to-filename mapping
├── jds/
│   └── Senior_Engineer_JD.json
└── match-results/
    └── John_Doe_Senior_Engineer_2026-02-01T12-30-45.json
```

### Match Result Persistence

Match results are automatically saved with meaningful filenames:
- Format: `{CandidateName}_{JobTitle}_{Timestamp}.json`
- Example: `John_Doe_Senior_Software_Engineer_2026-02-01T12-30-45.json`

### Logging

Comprehensive logging with JSON Lines format:
- `all-YYYY-MM-DD.jsonl` - All logs
- `error-YYYY-MM-DD.jsonl` - Errors only
- `llm-YYYY-MM-DD.jsonl` - LLM calls with token usage and cost
- `requests-YYYY-MM-DD.jsonl` - API request summaries

### Language Detection

The system automatically detects the primary language in the Job Description and instructs the LLM to respond in that language:

- English
- Chinese (中文)
- Japanese (日本語)
- Korean (한국어)
- German (Deutsch)
- French (Français)
- Spanish (Español)
- Portuguese (Português)
- Russian (Русский)
- Arabic (العربية)
- Thai (ไทย)

## LLM Provider Configuration

### OpenRouter (Recommended)

Access multiple LLMs through a single API:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
LLM_MODEL=google/gemini-2.0-flash
```

### OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key
LLM_MODEL=gpt-4o
```

### Google AI

```env
LLM_PROVIDER=google
GOOGLE_API_KEY=your_key
LLM_MODEL=gemini-1.5-pro
```

## Development

### Building for Production

```bash
# Build both backend and frontend
npm run build

# Start production server
npm start
```

### Running Tests

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

For issues and feature requests, please create an issue in the repository.
