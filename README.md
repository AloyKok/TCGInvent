# CardPulse Transaction

Mobile-first PWA for a One Piece TCG seller booth: shared Supabase-backed inventory, printable QR labels, scan-to-sell checkout, immutable sales history, and offline-tolerant queued checkout.

## Local Demo Mode

The app runs without Supabase when `.env` is absent. In this mode it:

- Skips login and opens as a local owner.
- Seeds five realistic One Piece inventory lines and one active show event.
- Persists inventory, sales, settings, events, and invites in browser `localStorage`.
- Supports checkout, void/restock, labels, reports, CSV import/export, and JSON backup.
- Shows a `Local demo` badge in the header.
- Provides `More -> Settings -> Reset local demo` to restore the original seed data.

Run it with:

```bash
npm run dev
```

Local mode is for product testing only. It does not provide secure multi-user access or cross-device atomic stock control. Adding both Supabase environment variables automatically switches the same UI back to the Supabase backend.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- React Router
- Zustand cart state
- TanStack Query with local query persistence
- vite-plugin-pwa
- Supabase Auth, Postgres, RLS, Realtime, RPC functions
- html5-qrcode for camera scanning
- qrcode for labels
- papaparse for CSV import/export

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project.

3. Apply migrations:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

5. Fill in:

   ```bash
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

6. Run:

   ```bash
   npm run dev
   ```

Only the Supabase anon key belongs in the frontend. Never prefix a service-role key with `VITE_`, and never add it to source files or frontend environment variables.

For the daily Yuyutei market refresh cron on Vercel, configure these server-only
environment variables in the Vercel project:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
CRON_SECRET=replace-with-a-long-random-string
MARKET_REFRESH_LIMIT=150
MARKET_REFRESH_CONCURRENCY=2
```

The cron is defined in `vercel.json` as `0 13 * * *`, which runs at 9:00pm
Singapore time. It refreshes linked Yuyutei cards and writes new
`market_price_snapshots`; Inventory displays the latest saved snapshot.

## Accounts

Public signup is disabled. Accounts are provisioned centrally in Supabase Auth,
and the app signs in with the assigned username. Do not add passwords to source
files, migrations, or frontend environment variables.

## Database Contract

All reproducible SQL is in `supabase/migrations/`. Apply every migration with
`supabase db push`; do not copy individual table definitions into the dashboard.

Important guarantees:

- Every org-scoped table has RLS enabled.
- Members can only read/write rows for their organization.
- Owner-only membership/settings actions are enforced in RLS and helper functions.
- Transactions are not directly insertable/updatable through table policies.
- `complete_sale(...)` is the only checkout path and performs idempotency, guarded stock decrement, cost/profit snapshot calculation from server-side inventory rows, line-item creation, and transaction insert in one server-side transaction.
- `void_sale(...)` marks a completed transaction as voided and restocks its lines. It does not rewrite original sale totals.

## Seed Data

After creating a user and organization, run:

```bash
psql "$DATABASE_URL" \
  -v org_id="'YOUR_ORG_UUID'" \
  -v user_id="'YOUR_AUTH_USER_UUID'" \
  -f supabase/seed/seed.sql
```

The seed includes an alt-art Leader, a Secret Rare, a JP manga-art graded example, and commons with quantity greater than one.

## Realtime

The app subscribes to Supabase Realtime changes for inventory, transactions, settings, and events. When another admin sells or edits inventory, the local TanStack Query cache is invalidated and refreshed.

Migration `0002_cloud_hardening.sql` adds these tables to the
`supabase_realtime` publication automatically:

- `inventory_items`
- `transactions`
- `show_events`
- `settings`

## Offline Checkout

The Sell screen keeps a local IndexedDB inventory cache and pending-sale queue.

- If checkout is offline, the sale is queued with a `clientRef`.
- When the device comes back online, queued sales retry through `complete_sale`.
- The RPC returns an existing transaction for a duplicate `clientRef`.
- If stock is no longer available when syncing, the queued sale is marked failed and remains visible via the pending sync indicator.
- Shared stock is never decremented locally as authoritative state; Supabase/Postgres remains the source of truth.

## QR Labels

Inventory labels encode the stable inventory item UUID. The printed label also includes the item number, card name, card number, rarity, art, category, condition, language, and asking price. Reprinting an item produces the same QR because the ID is stable.

The Labels screen can copy a QR as an image, share it from a phone, or download a 1024px PNG with either a transparent or white background. Use the white-background PNG for the most predictable thermal-printer contrast. The inventory CSV also includes `qr_value`, which can be mapped to a QR element when using CLabel Trade's spreadsheet/batch-print workflow.

Sales can be recorded either as daily transactions or under a card show. Monthly reporting attributes daily sales to the transaction's local calendar month. Every sale under a card show is attributed to the month in which that show starts, including multi-day shows that continue into the next month.

Profit reporting is locked at sale time. Each sale line stores the item rarity snapshot, unit cost, line total, and line profit. The transaction stores cost total and gross profit. Historical sales created before this profit schema are marked `cost_unknown` and shown as cost unknown in reports instead of being treated as 100% profit.

Item numbers can be entered manually or generated by the system. Generated values use:

```text
OP-<CARD_NUMBER>-<CONDITION>-<SEQUENCE>
```

Example:

```text
OP-OP04-123-NM-001
```

The sequence increments for matching card number and condition values. Item numbers are unique within the organization, and duplicate manual values are rejected.

Use the Labels screen, filter the items, then print. The default sheet preset is `30-up-avery-5160` and CSS uses print media rules.

## CSV Import Format

Inventory CSV columns:

```text
item_number,item_type,product_category,item_name,card_number,set_name,rarity,art,language,category,condition,grade_company,grade,cert_number,quantity,cost_basis,floor_price,asking_price,market_price,location,acquisition_source,acquisition_date,listed_online,tags,image_url,notes
```

Required:

- `item_type`: `single_card`, `sealed_product`, or `mystery_pack`
- `item_name`
- `language`
- `asking_price`

For `single_card`, also provide `card_number`, `set_name`, `rarity`, `art`, and `category`.

For `sealed_product`, provide `product_category`: `booster_box`, `booster_pack`, `starter_deck`, `special_promo_set`, `collection`, or `other_sealed`.

Recommended One Piece values:

- `language`: `EN`, `JP`, or `OTHER`
- `condition`: `MINT`, `NM`, `LP`, `MP`, `HP`, `DMG`, or `GRADED`
- `rarity`: `C`, `UC`, `R`, `SR`, `SEC`, `Leader`, or `Promo`
- `art`: `Base`, `Parallel`, or `Manga`
- `category`: `Character`, `Leader`, `Event`, `Stage`, or `DON`
- `floor_price`: optional walk-away price used for checkout warnings
- `tags`: optional labels separated with `|`

Leave `item_number` blank during import to use system auto-generation.

Import validates each row and reports row-level errors without stopping the whole import.

## Export and Backups

The Import / Export screen downloads:

- Inventory CSV
- Sales CSV
- Owner-only JSON backup of inventory and sales snapshots

For database-level backups, use Supabase dashboard backups or:

```bash
supabase db dump --linked --file backup.sql
```

Keep backups out of the public client bundle and source control if they contain real customer/business data.

## Invite Flow

1. Owner opens More -> Users.
2. Owner creates an invite for an email and role.
3. Send the generated `/accept/<token>` link to the invited admin.
4. Invitee signs up/signs in with the invited email.
5. Invitee opens the link and joins the organization.
6. Removing the membership revokes access immediately through RLS.

## PWA Installation

Build and deploy the static frontend to Vercel, Netlify, or Cloudflare Pages:

```bash
npm run build
```

Configure only:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

If deploying to Vercel and using daily market refresh, also configure the
server-only variables listed in Local Setup. Do not expose
`SUPABASE_SERVICE_ROLE_KEY` to the browser.

On a phone, open the deployed URL and use the browser's "Add to Home Screen" install action.

## Future Work

- Integrated payment processing/card reader.
- Buying-from-customers and trade-in workflows.
- Live paid pricing APIs. The app currently includes a no-op pricing provider seam.
- Multi-organization switching UI. The schema supports multiple orgs, but this app chooses the first membership.
