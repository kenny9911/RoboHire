# GEMINI.md - RoboHire Project

This document provides a comprehensive overview of the RoboHire project, its structure, and development practices to be used as instructional context for Gemini.

## Project Overview

RoboHire is a full-stack AI-powered recruitment platform. It consists of a React frontend and a Node.js (Express) backend, structured as a monorepo using npm workspaces.

- **Backend:** Located in the `backend/` directory, it's a TypeScript application that serves a RESTful API for various recruitment tasks. It uses Prisma for database interaction (PostgreSQL), Passport.js for authentication (local, Google, GitHub, LinkedIn), and supports multiple LLM providers like OpenAI, OpenRouter, and Google Gemini for its AI features.

- **Frontend:** Located in the `frontend/` directory, it's a modern React application built with Vite and styled with Tailwind CSS. It provides a user interface for interacting with the backend API, including a dashboard for API testing and management.

- **Database:** The project uses Prisma as its ORM. The database schema is defined in `backend/prisma/schema.prisma`.

## Building and Running

### Prerequisites

- Node.js 18+
- npm

### Initial Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Environment:**
    Copy the example environment file and fill in the necessary API keys and database URLs.
    ```bash
    cp .env.example .env
    ```

### Development

To run both the frontend and backend servers in development mode with hot-reloading:

```bash
npm run dev
```

- The backend will run on `http://localhost:4607`.
- The frontend will run on `http://localhost:3607`.

You can also run them separately:
```bash
npm run dev:backend
npm run dev:frontend
```

### Database Management

Database commands are run from the root directory but are defined in the `backend` workspace.

- **Generate Prisma Client:**
  ```bash
  npm run db:generate --workspace=backend
  ```
- **Push Schema Changes (for development):**
  ```bash
  npm run db:push --workspace=backend
  ```
- **Run Migrations (for production):**
  ```bash
  npm run db:migrate:deploy --workspace=backend
  ```
- **Open Prisma Studio:**
  ```bash
  npm run db:studio --workspace=backend
  ```
- **Seed the database:**
  ```bash
  npm run db:seed --workspace=backend
  ```

### Production

1.  **Build the project:**
    This command builds both the frontend and backend.
    ```bash
    npm run build
    ```

2.  **Start the production server:**
    This command starts the backend server. The frontend is served statically.
    ```bash
    npm start
    ```

## Development Conventions

- **Monorepo:** The project is a monorepo with `frontend` and `backend` workspaces. Shared dependencies are in the root `package.json`.
- **Code Style:** The code is written in TypeScript. Follow the existing coding style and conventions in the respective workspaces.
- **API:** The backend provides a versioned REST API under `/api/v1`. The API routes are defined in `backend/src/routes/`.
- **Agents:** AI logic is encapsulated in "agents" located in `backend/src/agents/`. Each agent is responsible for a specific task (e.g., `ResumeMatchAgent`, `InterviewPromptAgent`).
- **Components:** The frontend uses a component-based architecture. Reusable components are in `frontend/src/components/`.
- **Environment Variables:** All configuration should be done through environment variables, following the template in `.env.example`.
- **Logging:** The backend has a `LoggerService` for logging. Pay attention to log levels and context.
- **Deployment:** The project is set up for deployment on Render, as indicated by the `render.yaml` file. The `deploy.sh` script might contain deployment logic.
