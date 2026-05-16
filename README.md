# Holiday Home Booking System

A zero-cost booking system for a holiday home, built with a static frontend (deployable on GitHub Pages) and a Supabase backend.

## Features

- **Custom Multi-Month Calendar View**: Horizontal scrolling calendar showing 12 months ahead with visual availability indicators
- **Room Booking Management**: Book individual rooms (Master, Twin, Bunk) or the entire house
- **Smart Conflict Detection**: Prevents double-booking with real-time availability checking
- **Password Protection**: Family and Admin password authentication (Edge Function secrets)
- **PIN-Based Booking Security**: Optional PIN codes for individual bookings to protect edits/deletes
- **Activity Logging**: Admin-accessible activity log stored in Supabase
- **Responsive Design**: Mobile-optimized with bottom-sheet modals and touch-friendly interactions
- **Coastal Theme**: Beautiful ocean-inspired color palette with local photography

## Supabase setup (overview)

- **Database (Postgres)** stores bookings and activity log in the **`rnr`** schema.
- **Edge Function** `rnr-api` is your API: `{ error, data }` responses with action-based routing.

The frontend only needs the **function URL** in [`assets/js/config.js`](assets/js/config.js). It does **not** need your Supabase anon key or service role key in the browser.

RnR backend queries are schema-scoped to `rnr` (same pattern as Splitify uses `splitify`).

---

## Step-by-step: Supabase setup

### Step 1 — Project

This app uses the existing Supabase project **Apps** (ref `yzyipxvlsoxfphwobfkb`) in org **ZarleyLtd** — the same project as Splitify.

### Step 2 — Database schema and API exposure

The `rnr` schema is created by migration [`supabase/migrations/20260517120000_rnr_schema.sql`](supabase/migrations/20260517120000_rnr_schema.sql).

In **Project Settings** → **API** → **Exposed Schemas**, add **`rnr`** (alongside `splitify` and any other app schemas).

**Check:** Table Editor shows tables in schema `rnr`: `bookings`, `activity_log`.

### Step 3 — Install Supabase CLI and log in

```bash
supabase login
supabase --version
```

### Step 4 — Link and deploy the API

```bash
cd path/to/RnR
supabase link --project-ref yzyipxvlsoxfphwobfkb
supabase functions deploy rnr-api --no-verify-jwt
```

`--no-verify-jwt` matches how the frontend calls the API (no Supabase login required for family users).

**Check:** Dashboard → **Edge Functions** lists **`rnr-api`**.

Function URL:

`https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/rnr-api`

### Step 5 — Set Edge Function secrets

Dashboard → **Edge Functions** → **rnr-api** → **Secrets**:

| Secret name | Value |
|-------------|--------|
| `SUPABASE_URL` | `https://yzyipxvlsoxfphwobfkb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project **service_role** key (never expose in frontend) |
| `RNR_FAMILY_PASSWORD` | Family access password (e.g. `rnr`) |
| `RNR_ADMIN_PASSWORD` | Admin access password (e.g. `rnrAdmin`) |

Project-level secrets apply to all Edge Functions on this project. `SUPABASE_DB_URL` is not required for RnR.

### Step 6 — Point the frontend at your function

Edit [`assets/js/config.js`](assets/js/config.js):

```javascript
global.RNR_CONFIG = {
  API_URL: "https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/rnr-api"
};
```

Deploy static files to GitHub Pages (or any static host).

### Step 7 — Smoke test

1. Open `index.html`, enter family or admin password.
2. Select dates, create a booking.
3. Confirm it appears on the calendar and in Current Bookings.
4. As admin, open **Activity Log** and confirm entries appear after changes.

If something fails, check **Edge Functions** → **rnr-api** → **Logs** in the dashboard.

---

## Usage

1. Access the booking system through your deployed frontend URL
2. Enter the family or admin password when prompted
3. Click on dates in the calendar to select check-in and check-out dates
4. Click "Proceed" to open the booking form
5. Fill in guest name, room(s), dates, notes, and optional PIN
6. Submit the booking
7. Click any booking in **Current Bookings** to edit or delete (PIN required if set; admin bypasses PIN)

## Technical Details

- **Frontend**: HTML, Vanilla JavaScript, Tailwind CSS (via CDN)
- **Backend**: Supabase Edge Function (`rnr-api`)
- **Data Storage**: Postgres schema `rnr` (`bookings`, `activity_log`)
- **Date Format**: ISO 8601 (YYYY-MM-DD)
- **Authentication**: Family/Admin passwords (Edge Function secrets)
- **Security**: Optional PIN per booking; session-based role in `sessionStorage`

## Files

- `index.html` — Main page with calendar and booking modals
- `app.js` — Frontend logic
- `assets/js/config.js` — API URL configuration
- `supabase/functions/rnr-api/index.ts` — Edge Function API
- `supabase/migrations/` — Database schema
- `house-info.html`, `local-info.html` — Info pages
- `images/` — Photography assets

## Architecture

```
User Action → app.js → fetch → rnr-api (Edge Function) → Postgres (schema: rnr)
```

## Legacy reference

The previous Google Sheets + Apps Script backend is preserved in [`backend/code.gs`](backend/code.gs) for reference only. It is no longer used by the frontend.
