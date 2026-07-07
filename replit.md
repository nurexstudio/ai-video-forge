# AI Video Forge (CLIPFORGE)

An AI-powered video production studio that takes ideas to finished videos — from Shorts to documentaries.

## Stack
- **Frontend**: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui
- **Backend/DB**: Convex (`https://blessed-poodle-745.convex.cloud/`)
- **Auth**: Convex Auth — Email OTP + anonymous users
- **Package Manager**: Bun

## Running the app
```bash
bun run dev
```
Runs on port 5000. Workflow: `Start application`.

## Environment Variables
Set in `.replit` / Replit Secrets:

| Variable | Where | Notes |
|---|---|---|
| `VITE_CONVEX_URL` | shared env | Convex deployment URL |
| `CONVEX_DEPLOYMENT` | shared env | `prod:blessed-poodle-745` |
| `CONVEX_DEPLOY_KEY` | secret | Prod deploy key |
| `JWT_PRIVATE_KEY` | secret | Convex auth — RS256 private key |
| `JWKS` | secret | Convex auth — JSON Web Key Set |
| `SITE_URL` | shared env | Public URL of the app |
| `VITE_PEXELS_API_KEY` | secret | Stock footage search |
| `VITE_HUGGINGFACE_API_KEY` | secret | AI features |
| `GROQ_API_KEY` | Convex dashboard | LLM provider |
| `OPENAI_API_KEY` | Convex dashboard | LLM provider |
| `GEMINI_API_KEY` | Convex dashboard | LLM provider |

## Key Pages
- `/` — Landing page
- `/auth` — Login/signup (Email OTP)
- `/dashboard` — User projects
- `/studio` — Video editor
- `/agent` — AI agent
- `/chat` — OmniChat

## User Preferences
- Use Bun as the package manager
- Convex functions live in `src/convex/`
- Do not modify `src/convex/auth.ts`, `src/convex/auth.config.ts`, `src/convex/auth/emailOtp.ts`
