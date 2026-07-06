# Order Portal

A white-label WhatsApp order-tracking portal. Staff manage orders through this web app. Customers get updates via WhatsApp.

Built with Next.js 15, TypeScript, Tailwind CSS v4, Prisma, PostgreSQL.

---

## How the databases work

The app uses two separate PostgreSQL databases on Google Cloud SQL:

| Database        | Used for                                          |
|-----------------|---------------------------------------------------|
| `matilda_portal`| Orders, users, sessions, brand settings (Prisma)  |
| `matilda_bot`   | WhatsApp keywords, AI config, campaigns           |

---

## Setting up a new client (local dev)

### 1. Clone the repo and install

```bash
git clone https://github.com/your-org/tracking-portal.git
cd tracking-portal
npm install
```

### 2. Connect to the database

Start the Cloud SQL proxy so your laptop can talk to Google Cloud SQL:

```bash
./cloud-sql-proxy.exe PROJECT:REGION:PORTAL-INSTANCE --port=5433 &
./cloud-sql-proxy.exe PROJECT:REGION:BOT-INSTANCE    --port=5434 &
```

Replace `PROJECT:REGION:PORTAL-INSTANCE` with the values from Google Cloud Console → SQL → your instance → Connection name.

### 3. Create your `.env` file

```bash
copy .env.example .env
```

Open `.env` and fill in at minimum:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5433/matilda_portal?schema=public
BOT_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5434/matilda_bot
```

See `.env.example` for all other variables with explanations.

### 4. Apply database migrations

```bash
npx prisma migrate deploy
```

This creates all tables including `portal_settings`. Run this once on first setup, and again after any deployment that includes new migrations.

### 5. Start the app

```bash
npm run dev
```

Open http://localhost:3000 — on a fresh database you'll be taken straight to the setup wizard.

---

## First time on a new database: Setup Wizard

When there are no users in the database, the app redirects to `/setup` automatically.

The wizard has two steps:
1. **Create your admin account** — name, email, password
2. **Brand the portal** — portal name and brand color

After finishing, log in with the account you just created.

You can also add the first user via the seed script instead (useful for staging):

```bash
# Add these to your .env first:
# SEED_SUPER_ADMIN_NAME=Your Name
# SEED_SUPER_ADMIN_EMAIL=you@company.com
# SEED_SUPER_ADMIN_PASSWORD=YourStr0ng!Pass

npm run seed
```

---

## Deploying to Google Cloud Run

No Docker needed — Cloud Run builds and deploys from your source code directly.

### First deployment

```bash
gcloud run deploy order-portal \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

You'll be asked a few questions (project, region). Say yes to building and deploying.

### Setting environment variables on Cloud Run

In Google Cloud Console → Cloud Run → your service → Edit → Variables & Secrets, add each variable from your `.env`. The `DATABASE_URL` for Cloud SQL uses this format:

```
postgresql://USER:PASSWORD@localhost/matilda_portal?host=/cloudsql/PROJECT:REGION:INSTANCE
```

Note: on Cloud Run the proxy runs automatically — you don't need to start it manually.

### After each code update

```bash
git push origin main
```

Then redeploy:

```bash
gcloud run deploy order-portal --source . --region us-central1
```

Or set up automatic deployments from GitHub in Cloud Run settings (Cloud Run → your service → Triggers → Connect to GitHub).

### Run migrations on the live database

After deploying a version that has new migrations, run from your local machine (with cloud-sql-proxy running):

```bash
npx prisma migrate deploy
```

---

## Handing off to a client

1. Give client the Cloud Run URL (e.g. `https://order-portal-xxx-uc.a.run.app`)
2. On first visit they are redirected to `/setup` — they create their admin account and set their brand color/name
3. Done — they manage everything from the portal itself

Brand settings (name, color, logo) are changed in **Admin → Settings** — no code changes needed.

---

## User roles

| Role          | Can do                                                       |
|---------------|--------------------------------------------------------------|
| SUPER\_ADMIN  | Everything — settings, all sections, manage users            |
| ADMIN         | Orders, customers, dashboard. WhatsApp/AI if enabled         |
| CHEF          | Chef queue only                                              |
| COORDINATOR   | Create and manage orders                                     |

---

## Common commands

| Command                       | What it does                                    |
|-------------------------------|-------------------------------------------------|
| `npm run dev`                 | Start local dev server (localhost:3000)         |
| `npm run build`               | Build for production                            |
| `npm start`                   | Run the production build locally                |
| `npm run seed`                | Create branches + first admin (if env vars set) |
| `npx prisma migrate deploy`   | Apply any new database migrations               |
| `npx prisma studio`           | Open visual database browser (localhost:5555)   |
| `npx prisma generate`         | Regenerate Prisma types after schema changes    |

---

## Project structure (where things live)

```
src/
├── app/
│   ├── setup/          ← First-run wizard
│   ├── login/          ← Login page
│   ├── dashboard/      ← Dashboard
│   ├── orders/         ← Order list + detail
│   ├── new-order/      ← Create order
│   ├── chef/           ← Chef queue
│   ├── customers/      ← Customer list
│   ├── admin/
│   │   └── settings/   ← Brand config, access controls
│   └── wa/             ← WhatsApp: keywords, AI, campaigns
├── components/
│   └── app-shell/      ← Sidebar navigation
└── lib/
    ├── portalSettings.ts ← Reads brand settings, generates CSS
    ├── prisma.ts         ← Database connection (portal DB)
    └── botdb.ts          ← Database connection (bot DB)

prisma/
├── schema.prisma       ← Database models
├── seed.ts             ← First data seed
└── migrations/         ← Database change history
```
