# RoboHire API Documentation

Complete API reference for the RoboHire AI-Powered Recruitment Platform.

**Base URL:** `http://localhost:4607`

---

## Table of Contents

- [Authentication](#authentication)
  - [Sign Up](#sign-up)
  - [Login](#login)
  - [Logout](#logout)
  - [Get Current User](#get-current-user)
  - [Update Profile](#update-profile)
  - [Change Password](#change-password)
  - [OAuth Login](#oauth-login)
- [Hiring Requests](#hiring-requests)
  - [Create Hiring Request](#create-hiring-request)
  - [List Hiring Requests](#list-hiring-requests)
  - [Get Hiring Request](#get-hiring-request)
  - [Update Hiring Request](#update-hiring-request)
  - [Delete Hiring Request](#delete-hiring-request)
  - [List Candidates](#list-candidates)
  - [Update Candidate Status](#update-candidate-status)
- [AI Recruitment APIs](#ai-recruitment-apis)
  - [Match Resume](#match-resume)
  - [Parse Resume](#parse-resume)
  - [Parse Job Description](#parse-job-description)
  - [Invite Candidate](#invite-candidate)
  - [Evaluate Interview](#evaluate-interview)
- [System Endpoints](#system-endpoints)
  - [Health Check](#health-check)
  - [Usage Statistics](#usage-statistics)
  - [List Documents](#list-documents)
  - [Log Information](#log-information)

---

## Authentication

All authentication endpoints are prefixed with `/api/auth`.

### Demo Account

For testing purposes, a demo account is available:

| Field | Value |
|-------|-------|
| Email | `demo@robohire.io` |
| Password | `demo1234` |

### Sign Up

Create a new user account.

**Endpoint:** `POST /api/auth/signup`

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe",
  "company": "Acme Inc."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User's email address |
| password | string | Yes | Password (min 8 characters) |
| name | string | No | User's full name |
| company | string | No | Company name |

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx123abc",
      "email": "user@example.com",
      "name": "John Doe",
      "company": "Acme Inc.",
      "avatar": null,
      "provider": "email",
      "createdAt": "2026-02-04T12:00:00.000Z",
      "updatedAt": "2026-02-04T12:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**cURL:**

```bash
curl -X POST http://localhost:4607/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe",
    "company": "Acme Inc."
  }'
```

---

### Login

Authenticate with email and password.

**Endpoint:** `POST /api/auth/login`

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx123abc",
      "email": "user@example.com",
      "name": "John Doe",
      "company": "Acme Inc."
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**cURL:**

```bash
curl -X POST http://localhost:4607/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@robohire.io",
    "password": "demo1234"
  }'
```

---

### Logout

Log out the current user and invalidate the session.

**Endpoint:** `POST /api/auth/logout`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### Get Current User

Get the authenticated user's profile.

**Endpoint:** `GET /api/auth/me`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx123abc",
      "email": "user@example.com",
      "name": "John Doe",
      "company": "Acme Inc.",
      "avatar": null,
      "provider": "email",
      "createdAt": "2026-02-04T12:00:00.000Z",
      "updatedAt": "2026-02-04T12:00:00.000Z"
    }
  }
}
```

**cURL:**

```bash
curl -X GET http://localhost:4607/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Update Profile

Update the current user's profile information.

**Endpoint:** `PATCH /api/auth/profile`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |

**Request Body:**

```json
{
  "name": "John Smith",
  "company": "New Company Inc.",
  "avatar": "https://example.com/avatar.jpg"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx123abc",
      "email": "user@example.com",
      "name": "John Smith",
      "company": "New Company Inc.",
      "avatar": "https://example.com/avatar.jpg"
    }
  }
}
```

---

### Change Password

Change the current user's password.

**Endpoint:** `POST /api/auth/change-password`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |

**Request Body:**

```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### OAuth Login

Authenticate using OAuth providers.

**Google:** `GET /api/auth/google`
**GitHub:** `GET /api/auth/github`
**LinkedIn:** `GET /api/auth/linkedin`

These endpoints redirect to the respective OAuth provider. After authentication, users are redirected to `/dashboard` with a session cookie.

---

## Hiring Requests

All hiring request endpoints are prefixed with `/api/v1/hiring-requests` and require authentication.

### Create Hiring Request

Create a new hiring request.

**Endpoint:** `POST /api/v1/hiring-requests`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |
| Content-Type | application/json |

**Request Body:**

```json
{
  "title": "Senior Software Engineer",
  "requirements": "5+ years experience in Python and JavaScript. Strong system design skills. Experience with AWS or GCP.",
  "jobDescription": "Full job description text here...",
  "webhookUrl": "https://your-app.com/webhook/candidates"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Job title |
| requirements | string | Yes | Key requirements for the role |
| jobDescription | string | No | Full job description |
| webhookUrl | string | No | URL to receive candidate notifications |

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx456def",
    "userId": "clx123abc",
    "title": "Senior Software Engineer",
    "requirements": "5+ years experience...",
    "jobDescription": "Full job description...",
    "status": "active",
    "webhookUrl": "https://your-app.com/webhook/candidates",
    "createdAt": "2026-02-04T12:00:00.000Z",
    "updatedAt": "2026-02-04T12:00:00.000Z"
  }
}
```

**cURL:**

```bash
curl -X POST http://localhost:4607/api/v1/hiring-requests \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior Software Engineer",
    "requirements": "5+ years experience in Python and JavaScript"
  }'
```

---

### List Hiring Requests

Get all hiring requests for the authenticated user.

**Endpoint:** `GET /api/v1/hiring-requests`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | - | Filter by status (active, paused, closed) |
| limit | number | 20 | Number of results to return |
| offset | number | 0 | Number of results to skip |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx456def",
      "title": "Senior Software Engineer",
      "requirements": "5+ years experience...",
      "status": "active",
      "createdAt": "2026-02-04T12:00:00.000Z",
      "_count": {
        "candidates": 15
      }
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 20,
    "offset": 0
  }
}
```

**cURL:**

```bash
curl -X GET "http://localhost:4607/api/v1/hiring-requests?status=active&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get Hiring Request

Get a single hiring request with its candidates.

**Endpoint:** `GET /api/v1/hiring-requests/:id`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx456def",
    "title": "Senior Software Engineer",
    "requirements": "5+ years experience...",
    "jobDescription": "Full job description...",
    "status": "active",
    "webhookUrl": null,
    "createdAt": "2026-02-04T12:00:00.000Z",
    "updatedAt": "2026-02-04T12:00:00.000Z",
    "candidates": [
      {
        "id": "clx789ghi",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "matchScore": 85,
        "status": "shortlisted"
      }
    ]
  }
}
```

---

### Update Hiring Request

Update a hiring request.

**Endpoint:** `PATCH /api/v1/hiring-requests/:id`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |
| Content-Type | application/json |

**Request Body:**

```json
{
  "title": "Updated Job Title",
  "status": "paused"
}
```

| Field | Type | Description |
|-------|------|-------------|
| title | string | Updated job title |
| requirements | string | Updated requirements |
| jobDescription | string | Updated job description |
| webhookUrl | string | Updated webhook URL |
| status | string | Status: active, paused, or closed |

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx456def",
    "title": "Updated Job Title",
    "status": "paused",
    "updatedAt": "2026-02-04T13:00:00.000Z"
  }
}
```

---

### Delete Hiring Request

Delete a hiring request and all associated candidates.

**Endpoint:** `DELETE /api/v1/hiring-requests/:id`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |

**Response:**

```json
{
  "success": true,
  "message": "Hiring request deleted successfully"
}
```

---

### List Candidates

Get candidates for a specific hiring request.

**Endpoint:** `GET /api/v1/hiring-requests/:id/candidates`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | - | Filter by status |
| limit | number | 50 | Number of results |
| offset | number | 0 | Skip results |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx789ghi",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "resumeText": "Resume content...",
      "matchScore": 85,
      "status": "shortlisted",
      "evaluationReport": { ... },
      "createdAt": "2026-02-04T12:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Update Candidate Status

Update a candidate's status.

**Endpoint:** `PATCH /api/v1/hiring-requests/:id/candidates/:candidateId`

**Headers:**

| Header | Value |
|--------|-------|
| Authorization | Bearer {token} |
| Content-Type | application/json |

**Request Body:**

```json
{
  "status": "shortlisted"
}
```

**Valid statuses:** `pending`, `screening`, `interviewed`, `shortlisted`, `rejected`

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx789ghi",
    "status": "shortlisted",
    "updatedAt": "2026-02-04T13:00:00.000Z"
  }
}
```

---

## AI Recruitment APIs

These endpoints provide AI-powered recruitment analysis. All endpoints are under `/api/v1`.

### Match Resume

Analyze how well a candidate's resume matches a job description.

**Endpoint:** `POST /api/v1/match-resume`

**Request Body:**

```json
{
  "resume": "John Doe\nSenior Software Engineer\njohn@example.com\n\nEXPERIENCE:\nGoogle (2019-2024)\n- Led team of 5 engineers\n- Built React dashboard\n\nSKILLS: Python, JavaScript, React, Node.js, AWS",
  "jd": "Senior Software Engineer\n\nRequirements:\n- 5+ years experience\n- Python and JavaScript\n- React experience\n- AWS knowledge"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resume | string | Yes | Full resume text |
| jd | string | Yes | Full job description text |

**Response Structure:**

```json
{
  "success": true,
  "data": {
    "resumeAnalysis": {
      "candidateName": "John Doe",
      "totalYearsExperience": "5 years",
      "currentRole": "Senior Software Engineer",
      "technicalSkills": ["Python", "JavaScript", "React"],
      "softSkills": ["Leadership", "Communication"],
      "keyAchievements": ["Led team of 5", "Built dashboard for 10M+ users"]
    },
    "jdAnalysis": {
      "jobTitle": "Senior Software Engineer",
      "seniorityLevel": "Senior",
      "requiredYearsExperience": "5+ years",
      "mustHaveSkills": ["Python", "JavaScript", "React"],
      "niceToHaveSkills": ["AWS", "Machine Learning"]
    },
    "mustHaveAnalysis": {
      "extractedMustHaves": {
        "skills": [{"skill": "Python", "reason": "Core requirement"}],
        "experiences": [{"experience": "5+ years", "minimumYears": "5"}]
      },
      "candidateEvaluation": {
        "meetsAllMustHaves": true,
        "matchedSkills": [{"skill": "Python", "proficiency": "Expert"}],
        "missingSkills": []
      },
      "mustHaveScore": 95,
      "disqualified": false
    },
    "overallMatchScore": {
      "score": 87,
      "grade": "A",
      "confidence": "High"
    },
    "overallFit": {
      "verdict": "Strong Match",
      "summary": "Excellent candidate with all required skills...",
      "hiringRecommendation": "Strongly Recommend",
      "interviewFocus": ["System design depth", "Leadership experience"]
    },
    "suggestedInterviewQuestions": {
      "technical": [
        {
          "area": "Python",
          "questions": [
            {
              "question": "Describe your experience with Python async programming",
              "purpose": "Assess advanced Python knowledge",
              "difficulty": "Advanced"
            }
          ]
        }
      ],
      "behavioral": [...],
      "situational": [...]
    }
  },
  "requestId": "req_abc123"
}
```

**cURL:**

```bash
curl -X POST http://localhost:4607/api/v1/match-resume \
  -H "Content-Type: application/json" \
  -d '{
    "resume": "John Doe\nSoftware Engineer...",
    "jd": "Senior Software Engineer\nRequirements..."
  }'
```

**JavaScript:**

```javascript
const response = await fetch('http://localhost:4607/api/v1/match-resume', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resume: 'John Doe\nSoftware Engineer...',
    jd: 'Senior Software Engineer\nRequirements...'
  })
});
const data = await response.json();
```

**Python:**

```python
import requests

response = requests.post(
    'http://localhost:4607/api/v1/match-resume',
    json={
        'resume': 'John Doe\nSoftware Engineer...',
        'jd': 'Senior Software Engineer\nRequirements...'
    }
)
data = response.json()
```

---

### Parse Resume

Extract structured data from a resume PDF.

**Endpoint:** `POST /api/v1/parse-resume`

**Content-Type:** `multipart/form-data`

**Form Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | Resume PDF file |

**Response:**

```json
{
  "success": true,
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1-555-123-4567",
    "linkedin": "linkedin.com/in/johndoe",
    "github": "github.com/johndoe",
    "skills": {
      "technical": ["Python", "JavaScript", "React"],
      "soft": ["Leadership", "Communication"],
      "tools": ["Git", "Docker", "AWS"]
    },
    "experience": [
      {
        "company": "Google",
        "role": "Senior Software Engineer",
        "duration": "2019 - 2024",
        "achievements": [
          "Led team of 5 engineers",
          "Built React dashboard serving 10M+ users"
        ]
      }
    ],
    "education": [
      {
        "institution": "MIT",
        "degree": "BS Computer Science",
        "year": "2017"
      }
    ],
    "certifications": ["AWS Solutions Architect"],
    "rawText": "Full extracted text..."
  },
  "cached": false,
  "requestId": "req_def456"
}
```

**cURL:**

```bash
curl -X POST http://localhost:4607/api/v1/parse-resume \
  -F "file=@resume.pdf"
```

---

### Parse Job Description

Extract structured data from a job description PDF.

**Endpoint:** `POST /api/v1/parse-jd`

**Content-Type:** `multipart/form-data`

**Form Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | Job description PDF file |

**Response:**

```json
{
  "success": true,
  "data": {
    "title": "Senior Software Engineer",
    "company": "TechCorp",
    "location": "San Francisco, CA (Remote OK)",
    "employmentType": "Full-time",
    "experienceLevel": "Senior",
    "requirements": {
      "mustHave": [
        "5+ years software engineering experience",
        "Python and JavaScript expertise"
      ],
      "niceToHave": [
        "AWS experience",
        "Machine Learning background"
      ]
    },
    "responsibilities": [
      "Lead technical design decisions",
      "Mentor junior developers"
    ],
    "qualifications": {
      "education": ["BS in Computer Science or equivalent"],
      "skills": {
        "technical": ["Python", "JavaScript", "React"],
        "soft": ["Leadership", "Communication"]
      }
    },
    "compensation": {
      "salary": "$150,000 - $200,000",
      "bonus": "15% annual bonus",
      "equity": "Stock options available"
    },
    "benefits": [
      "Health insurance",
      "401k matching",
      "Unlimited PTO"
    ],
    "rawText": "Full extracted text..."
  },
  "cached": false,
  "requestId": "req_ghi789"
}
```

**cURL:**

```bash
curl -X POST http://localhost:4607/api/v1/parse-jd \
  -F "file=@job_description.pdf"
```

---

### Invite Candidate

Generate a personalized interview invitation email and create an interview session.

**Endpoint:** `POST /api/v1/invite-candidate`

**Request Body:**

```json
{
  "resume": "Jane Smith\nEmail: jane@example.com\nFrontend Developer with 3 years experience...",
  "jd": "Frontend Engineer at TechCorp\nRequirements: React, TypeScript...",
  "recruiter_email": "hr@techcorp.com",
  "interviewer_requirement": "Ask about remote work preferences and salary expectations"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resume | string | Yes | Resume text (must include name and email) |
| jd | string | Yes | Job description text |
| recruiter_email | string | No | Email for notifications and BCC |
| interviewer_requirement | string | No | Additional interview instructions |

**Response:**

```json
{
  "success": true,
  "data": {
    "email": "jane@example.com",
    "name": "Jane Smith",
    "login_url": "https://interview.robohire.io/session/abc123",
    "qrcode_url": "https://api.robohire.io/qr/abc123.png",
    "job_title": "Frontend Engineer",
    "company_name": "TechCorp",
    "message": "Invitation sent successfully"
  },
  "requestId": "req_jkl012"
}
```

**cURL:**

```bash
curl -X POST http://localhost:4607/api/v1/invite-candidate \
  -H "Content-Type: application/json" \
  -d '{
    "resume": "Jane Smith\nEmail: jane@example.com\nFrontend Developer...",
    "jd": "Frontend Engineer at TechCorp...",
    "recruiter_email": "hr@techcorp.com"
  }'
```

---

### Evaluate Interview

Evaluate an interview transcript against the resume and job description.

**Endpoint:** `POST /api/v1/evaluate-interview`

**Request Body:**

```json
{
  "resume": "Candidate resume text...",
  "jd": "Job description text...",
  "interviewScript": "Interviewer: Tell me about yourself?\nCandidate: I'm a software engineer with 5 years of experience...\nInterviewer: Describe a challenging project?\nCandidate: ...",
  "includeCheatingDetection": true,
  "userInstructions": "Focus on system design skills"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resume | string | Yes | Candidate's resume text |
| jd | string | Yes | Job description text |
| interviewScript | string | Yes | Full interview transcript |
| includeCheatingDetection | boolean | No | Include AI-assisted answer detection |
| userInstructions | string | No | Special evaluation instructions |

**Response:**

```json
{
  "success": true,
  "data": {
    "score": 78,
    "summary": "Strong technical candidate with solid problem-solving skills...",
    "hiringDecision": "Hire",
    "strengths": [
      "Deep knowledge of React ecosystem",
      "Clear communication",
      "Strong problem-solving approach"
    ],
    "weaknesses": [
      "Limited experience with distributed systems",
      "Could improve on system design explanations"
    ],
    "recommendation": "Recommend hiring for mid-level position with mentorship on system design",
    "mustHaveAnalysis": {
      "mustHaveScore": 85,
      "passRate": "4/5 must-haves verified",
      "disqualified": false,
      "interviewVerification": {
        "verified": [
          {
            "requirement": "React experience",
            "verifiedBy": "Q3: React hooks question",
            "evidence": "Demonstrated deep understanding of useEffect cleanup",
            "confidenceLevel": "High"
          }
        ],
        "failed": [],
        "notTested": [
          {
            "requirement": "AWS experience",
            "recommendation": "Ask about deployment experience in follow-up"
          }
        ]
      }
    },
    "technicalAnalysis": {
      "summary": "Solid mid-to-senior level technical skills",
      "depthRating": "Advanced",
      "provenSkills": ["React", "JavaScript", "REST APIs"],
      "claimedButUnverified": ["Python", "Docker"]
    },
    "questionAnswerAssessment": [
      {
        "question": "Tell me about yourself?",
        "answer": "I'm a software engineer with 5 years...",
        "score": 80,
        "correctness": "Correct",
        "clarity": "High"
      }
    ],
    "cheatingAnalysis": {
      "suspicionScore": 15,
      "riskLevel": "Low",
      "summary": "Responses appear genuine with natural hesitations and personal examples",
      "indicators": [],
      "authenticitySignals": [
        "Personal anecdotes included",
        "Natural thinking pauses",
        "Admitted uncertainty appropriately"
      ]
    },
    "interviewersKit": {
      "suggestedQuestions": [
        "Can you walk through deploying an application to AWS?",
        "Describe your experience with Docker in production"
      ],
      "focusAreas": ["Cloud infrastructure", "CI/CD pipelines"]
    },
    "levelAssessment": "Senior",
    "expertAdvice": "Candidate shows strong potential for senior role. Consider for team lead track with mentorship."
  },
  "requestId": "req_mno345"
}
```

**cURL:**

```bash
curl -X POST http://localhost:4607/api/v1/evaluate-interview \
  -H "Content-Type: application/json" \
  -d '{
    "resume": "Candidate resume...",
    "jd": "Job description...",
    "interviewScript": "Q: Tell me about yourself?\nA: ...",
    "includeCheatingDetection": true
  }'
```

---

## System Endpoints

### Health Check

Check API health and get system statistics.

**Endpoint:** `GET /api/v1/health`

**Response:**

```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2026-02-04T12:00:00.000Z",
  "provider": "openrouter",
  "model": "google/gemini-3-flash-preview",
  "stats": {
    "totalRequests": 150,
    "totalTokens": 500000,
    "estimatedCost": 0.25
  }
}
```

**cURL:**

```bash
curl http://localhost:4607/api/v1/health
```

---

### Usage Statistics

Get detailed usage statistics.

**Endpoint:** `GET /api/v1/stats`

**Response:**

```json
{
  "success": true,
  "data": {
    "endpoints": {
      "match-resume": {
        "calls": 50,
        "tokens": 200000,
        "avgLatency": 5200
      },
      "parse-resume": {
        "calls": 30,
        "tokens": 50000,
        "avgLatency": 3100
      }
    },
    "totalRequests": 150,
    "totalTokens": 500000,
    "estimatedCost": 0.25,
    "uptime": 3600
  }
}
```

---

### List Documents

List all cached documents and match results.

**Endpoint:** `GET /api/v1/documents`

**Response:**

```json
{
  "success": true,
  "data": {
    "resumes": [
      {
        "filename": "John_Doe_Resume.json",
        "name": "John Doe",
        "parsedAt": "2026-02-04T12:00:00.000Z"
      }
    ],
    "jds": [
      {
        "filename": "Senior_Engineer_JD.json",
        "title": "Senior Software Engineer",
        "parsedAt": "2026-02-04T12:00:00.000Z"
      }
    ],
    "matchResults": [
      {
        "filename": "John_Doe_Senior_Engineer_2026-02-04.json",
        "candidate": "John Doe",
        "job": "Senior Software Engineer",
        "score": 87,
        "matchedAt": "2026-02-04T12:00:00.000Z"
      }
    ]
  }
}
```

---

### Log Information

Get log file information.

**Endpoint:** `GET /api/v1/logs`

**Response:**

```json
{
  "success": true,
  "data": {
    "logDirectory": "./logs",
    "files": [
      {
        "name": "all-2026-02-04.jsonl",
        "size": 1024000,
        "entries": 5000
      },
      {
        "name": "error-2026-02-04.jsonl",
        "size": 2048,
        "entries": 5
      },
      {
        "name": "llm-2026-02-04.jsonl",
        "size": 512000,
        "entries": 150
      }
    ]
  }
}
```

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_REQUIRED | 401 | Authentication required |
| INVALID_TOKEN | 401 | Invalid or expired token |
| RATE_LIMITED | 429 | Too many requests |
| VALIDATION_ERROR | 400 | Invalid request data |
| NOT_FOUND | 404 | Resource not found |
| INTERNAL_ERROR | 500 | Internal server error |

---

## Rate Limiting

Authentication endpoints are rate-limited to **5 requests per minute** per IP address.

When rate-limited, you'll receive:

```json
{
  "success": false,
  "error": "Too many requests. Please try again later.",
  "code": "RATE_LIMITED",
  "retryAfter": 45
}
```

---

## Webhooks

When a `webhookUrl` is configured for a hiring request, RoboHire will send POST requests with candidate updates:

```json
{
  "event": "candidate.screened",
  "hiringRequestId": "clx456def",
  "candidate": {
    "id": "clx789ghi",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "matchScore": 85,
    "status": "screening"
  },
  "evaluationReport": {
    "summary": "Strong candidate...",
    "recommendation": "Proceed to interview"
  },
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

### Webhook Events

| Event | Description |
|-------|-------------|
| `candidate.received` | New candidate application received |
| `candidate.screened` | AI screening completed |
| `candidate.interviewed` | AI interview completed |
| `candidate.shortlisted` | Candidate shortlisted |
| `candidate.rejected` | Candidate rejected |

---

## SDKs and Libraries

### JavaScript/TypeScript

```typescript
import { RoboHireClient } from '@robohire/sdk';

const client = new RoboHireClient({
  baseUrl: 'http://localhost:4607',
  token: 'your_jwt_token'
});

// Match resume
const match = await client.matchResume({
  resume: 'John Doe...',
  jd: 'Senior Engineer...'
});

// Create hiring request
const request = await client.hiringRequests.create({
  title: 'Senior Engineer',
  requirements: '5+ years experience...'
});
```

### Python

```python
from robohire import RoboHireClient

client = RoboHireClient(
    base_url='http://localhost:4607',
    token='your_jwt_token'
)

# Match resume
match = client.match_resume(
    resume='John Doe...',
    jd='Senior Engineer...'
)

# Create hiring request
request = client.hiring_requests.create(
    title='Senior Engineer',
    requirements='5+ years experience...'
)
```

---

## Support

For issues, feature requests, or questions:

- **GitHub Issues:** [github.com/robohire/api/issues](https://github.com/robohire/api/issues)
- **Email:** support@robohire.io
- **Documentation:** [docs.robohire.io](https://docs.robohire.io)
