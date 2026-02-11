# Frontend - LIIMS UI

## MANDATORY: Use /frontend-design skill
**BEFORE building any page or component**, you MUST invoke the `/frontend-design` skill using the Skill tool. This is a hard requirement — no exceptions.

## Stack
- React 19, TypeScript, Vite
- Tailwind CSS v4 (via @tailwindcss/vite plugin)
- TanStack Query for server state
- Zustand for client state
- react-hook-form + zod for forms
- react-router-dom for routing
- lucide-react for icons
- axios for API calls

## Structure

- `src/components/ui/` - Reusable UI primitives (shadcn/ui style)
- `src/lib/utils.ts` - `cn()` helper (clsx + tailwind-merge)
- `src/lib/api.ts` - Axios instance with JWT interceptor
- `src/pages/` - Route-level page components
- `src/stores/` - Zustand stores (auth, UI state)
- `src/hooks/` - Custom React hooks

## Patterns

- Path alias: `@/` maps to `./src/`
- API calls via `@/lib/api` axios instance (auto-attaches JWT)
- Server state: TanStack Query hooks per domain
- Forms: react-hook-form + zod schema validation
- Styling: Tailwind utility classes, `cn()` for conditional classes
- Colors: `--color-primary`, `--color-success`, `--color-warning`, `--color-danger`
- Font: Inter (sans), monospace for sample codes/IDs

## Running

```bash
npm install
npm run dev        # Dev server on port 3000
npm run build      # Production build
npm run lint       # ESLint
```
