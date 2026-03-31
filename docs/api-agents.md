# Agents API Reference

Base URL: `https://api.robohire.io/api/v1/agents`

All endpoints require authentication via `Authorization: Bearer <token>` header or `X-API-Key: rh_<key>` header.

---

## 1. List Agents

Retrieve a paginated list of agents with optional filters.

```
GET /api/v1/agents
```

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | string | No | Filter by status: `active`, `paused`, `configuring`, `completed`, `failed`, `closed`, `out_of_leads` |
| `taskType` | string | No | Filter by agent type: `search`, `match` |
| `createdBefore` | ISO 8601 datetime | No | Only return agents created before this time (e.g. `2026-03-30T12:00:00Z`) |
| `createdAfter` | ISO 8601 datetime | No | Only return agents created after this time |
| `filterUserId` | string | No | Filter by creator user ID (admin only) |
| `filterTeamId` | string | No | Filter by team ID (admin only) |
| `teamView` | boolean | No | Include teammates' agents (default: `true` for team members) |
| `page` | integer | No | Page number (default: `1`) |
| `limit` | integer | No | Items per page (default: `20`, max: `100`) |

### Response

```json
{
  "data": [
    {
      "id": "clu1a2b3c4d5e6f7g",
      "userId": "user_abc123",
      "name": "SAP猎头",
      "description": "Search for SAP MM consultants with 5+ years experience",
      "taskType": "search",
      "instructions": "Focus on candidates in Shanghai and Shenzhen",
      "status": "active",
      "jobId": "job_xyz789",
      "config": {
        "location": "Shanghai",
        "skills": ["SAP MM", "SAP SD"],
        "experienceMin": 5
      },
      "totalSourced": 42,
      "totalApproved": 8,
      "totalRejected": 12,
      "totalContacted": 5,
      "lastRunAt": "2026-03-30T08:15:00Z",
      "createdAt": "2026-03-25T09:30:00Z",
      "updatedAt": "2026-03-30T08:15:00Z",
      "job": {
        "id": "job_xyz789",
        "title": "SAP MM Consultant"
      },
      "user": {
        "id": "user_abc123",
        "name": "Kenny Chien",
        "email": "kenny@robohire.io"
      },
      "_count": {
        "candidates": 42
      }
    }
  ],
  "pagination": {
    "total": 15,
    "page": 1,
    "totalPages": 1
  }
}
```

### Examples

**curl**
```bash
# List all active search agents created after March 1st
curl -X GET "https://api.robohire.io/api/v1/agents?status=active&taskType=search&createdAfter=2026-03-01T00:00:00Z" \
  -H "Authorization: Bearer YOUR_TOKEN"

# List agents with pagination
curl -X GET "https://api.robohire.io/api/v1/agents?page=2&limit=10" \
  -H "X-API-Key: rh_your_api_key"
```

**JavaScript**
```javascript
const response = await fetch(
  'https://api.robohire.io/api/v1/agents?status=active&taskType=search',
  {
    headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
  }
);
const { data, pagination } = await response.json();
console.log(`Found ${pagination.total} agents`);
```

**Python**
```python
import requests

response = requests.get(
    'https://api.robohire.io/api/v1/agents',
    params={
        'status': 'active',
        'taskType': 'search',
        'createdAfter': '2026-03-01T00:00:00Z',
        'limit': 50
    },
    headers={'Authorization': 'Bearer YOUR_TOKEN'}
)
agents = response.json()['data']
```

---

## 2. Get Agent

Retrieve a single agent by ID with full details.

```
GET /api/v1/agents/:id
```

### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Agent ID |

### Response

Returns the full agent object (same schema as list items) with `job`, `user`, and `_count` included.

### Examples

```bash
curl -X GET "https://api.robohire.io/api/v1/agents/clu1a2b3c4d5e6f7g" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 3. Create Agent

Create a new agent.

```
POST /api/v1/agents
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Agent name |
| `description` | string | Yes | Search criteria / description |
| `jobId` | string | No | Linked job ID |
| `taskType` | string | No | `search` (default) or `match` |
| `instructions` | string | No | Custom instructions for the agent |
| `config` | object | No | Search configuration |
| `config.location` | string | No | Target location |
| `config.skills` | string[] | No | Required skills |
| `config.experienceMin` | number | No | Minimum years of experience |
| `config.experienceMax` | number | No | Maximum years of experience |
| `config.keywords` | string[] | No | Search keywords |

### Response

```json
{
  "data": {
    "id": "clu1a2b3c4d5e6f7g",
    "name": "Backend Engineer Search",
    "description": "Find backend engineers with Go/Rust experience",
    "taskType": "search",
    "status": "active",
    "jobId": "job_xyz789",
    "config": { "skills": ["Go", "Rust"], "experienceMin": 3 },
    "totalSourced": 0,
    "totalApproved": 0,
    "totalRejected": 0,
    "totalContacted": 0,
    "createdAt": "2026-03-31T10:00:00Z",
    "updatedAt": "2026-03-31T10:00:00Z"
  }
}
```

### Examples

```bash
curl -X POST "https://api.robohire.io/api/v1/agents" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Backend Engineer Search",
    "description": "Find backend engineers with Go/Rust experience in Shanghai",
    "jobId": "job_xyz789",
    "taskType": "search",
    "config": {
      "skills": ["Go", "Rust", "Kubernetes"],
      "location": "Shanghai",
      "experienceMin": 3
    }
  }'
```

**JavaScript**
```javascript
const response = await fetch('https://api.robohire.io/api/v1/agents', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Backend Engineer Search',
    description: 'Find backend engineers with Go/Rust experience',
    taskType: 'search',
    config: { skills: ['Go', 'Rust'], experienceMin: 3 }
  })
});
const { data } = await response.json();
console.log('Created agent:', data.id);
```

**Python**
```python
import requests

response = requests.post(
    'https://api.robohire.io/api/v1/agents',
    json={
        'name': 'Backend Engineer Search',
        'description': 'Find backend engineers with Go/Rust experience',
        'taskType': 'search',
        'config': {'skills': ['Go', 'Rust'], 'experienceMin': 3}
    },
    headers={'Authorization': 'Bearer YOUR_TOKEN'}
)
agent = response.json()['data']
print(f"Created agent: {agent['id']}")
```

---

## 4. Update Agent

Update an existing agent's configuration.

```
PATCH /api/v1/agents/:id
```

### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Agent ID |

### Request Body

All fields are optional. Only provided fields are updated.

| Field | Type | Description |
|---|---|---|
| `name` | string | Agent name |
| `description` | string | Search criteria |
| `status` | string | `active`, `paused`, `closed` |
| `jobId` | string | Linked job ID |
| `config` | object | Search configuration (merged with existing) |
| `instructions` | string | Custom instructions |

### Response

Returns the updated agent object.

### Examples

```bash
# Pause an agent
curl -X PATCH "https://api.robohire.io/api/v1/agents/clu1a2b3c4d5e6f7g" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# Update search criteria
curl -X PATCH "https://api.robohire.io/api/v1/agents/clu1a2b3c4d5e6f7g" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated search: Go/Rust engineers, remote OK",
    "config": {"location": "Remote", "experienceMin": 5}
  }'
```

---

## 5. Delete Agent

Delete an agent and all its sourced candidates.

```
DELETE /api/v1/agents/:id
```

### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Agent ID |

### Response

```json
{
  "success": true
}
```

### Examples

```bash
curl -X DELETE "https://api.robohire.io/api/v1/agents/clu1a2b3c4d5e6f7g" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Agent Object Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique agent ID |
| `userId` | string | Creator's user ID |
| `name` | string | Agent display name |
| `description` | string | Natural language search criteria |
| `taskType` | string | `search` or `match` |
| `instructions` | string \| null | Custom instructions |
| `status` | string | `configuring`, `active`, `paused`, `completed`, `failed`, `closed`, `out_of_leads` |
| `jobId` | string \| null | Linked job ID |
| `config` | object \| null | Search configuration (location, skills, experience range, keywords) |
| `totalSourced` | integer | Total candidates sourced |
| `totalApproved` | integer | Approved candidates |
| `totalRejected` | integer | Rejected candidates |
| `totalContacted` | integer | Contacted candidates |
| `lastRunAt` | datetime \| null | Last execution timestamp |
| `createdAt` | datetime | Creation timestamp |
| `updatedAt` | datetime | Last update timestamp |
| `job` | object \| null | Linked job `{id, title}` |
| `user` | object | Creator `{id, name, email}` |
| `_count.candidates` | integer | Total candidate count |

## Error Responses

| Status | Code | Description |
|---|---|---|
| 400 | `validation_error` | Missing or invalid request parameters |
| 401 | `unauthorized` | Missing or invalid authentication |
| 404 | `not_found` | Agent not found or no access |
| 500 | `internal_error` | Server error |

## Rate Limits

API requests are rate-limited per user. Default: 100 requests/minute. Contact support for higher limits.
