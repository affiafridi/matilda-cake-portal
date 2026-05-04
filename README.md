# WhatsApp Order Tracking

Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Prisma + PostgreSQL.

## Prerequisites

- Node.js 20+ and npm
- A reachable PostgreSQL instance

## Setup

1. Install dependencies (this also runs `prisma generate` via the `postinstall` hook):

   ```bash
   npm install
   ```

2. Set your database URL in `.env`:

   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/tracking_portal?schema=public
   ```

3. Once you have models in `prisma/schema.prisma`, create the first migration:

   ```bash
   npx prisma migrate dev --name init
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

   App is served at http://localhost:3000.

## Project structure

```
tracking-portal/
├── prisma/
│   └── schema.prisma         # Prisma data model
├── src/
│   ├── app/                  # Next.js App Router pages & layouts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       └── prisma.ts         # Shared Prisma client (singleton)
├── .env                      # Local secrets (gitignored)
├── .env.example              # Template for collaborators
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```

## Scripts

| Command         | What it does                  |
| --------------- | ----------------------------- |
| `npm run dev`   | Start the Next.js dev server  |
| `npm run build` | Production build              |
| `npm start`     | Run the production build      |
| `npm run lint`  | ESLint                        |
