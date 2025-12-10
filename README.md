# ProductBoard → Notion Sync

Automated synchronization of ProductBoard releases and features into Notion databases with health tracking and rollups.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- ProductBoard API token
- Notion API integration token
- Two Notion databases (Releases and Features)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.personal.example .env.personal
   # Edit .env.personal with your API tokens and database IDs
   ```

3. **Test connections:**
   ```bash
   node scripts/test-connections.js
   ```

4. **Fetch ProductBoard data:**
   ```bash
   node scripts/fetch-productboard.js
   ```

5. **Dry-run migration:**
   ```bash
   node scripts/migrate-to-notion.js --dry-run
   ```

6. **Run migration:**
   ```bash
   node scripts/migrate-to-notion.js
   ```

## 📋 Scripts

- `scripts/test-connections.js` - Test API connections
- `scripts/fetch-productboard.js` - Fetch data from ProductBoard
- `scripts/migrate-to-notion.js` - One-time migration (with `--dry-run` support)
- `scripts/sync-productboard-to-notion.js` - Incremental sync (updates only changed items)
- `scripts/verify-setup.js` - Verify Notion database access
- `scripts/get-database-id.js` - Extract database ID from Notion URL

## 🔄 Automated Sync

### GitHub Actions (Recommended)

1. **Set up secrets in GitHub:**
   - Go to your repository → Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `NOTION_API_KEY`
     - `PRODUCTBOARD_API_TOKEN`
     - `NOTION_RELEASES_DB_ID`
     - `NOTION_FEATURES_DB_ID`

2. **The workflow runs automatically:**
   - Every 6 hours (scheduled)
   - On manual trigger (workflow_dispatch)

3. **View logs:**
   - Go to Actions tab in GitHub
   - Click on the latest sync run
   - Download logs artifact if needed

### Local Cron (Alternative)

Add to your crontab:
```bash
0 */6 * * * cd /path/to/repo && node scripts/sync-productboard-to-notion.js >> logs/sync.log 2>&1
```

## 📊 Logs

Sync logs are written to `logs/sync.log` with timestamps. Each sync includes:
- Start time
- ID mapping results
- Created/updated/unchanged counts
- Duration
- Any errors

## 🏗️ Architecture

See `ARCHITECTURE.md` for detailed system architecture.

## 📖 Documentation

- `PROJECT-PLAN.md` - Complete implementation plan with all phases
- `ARCHITECTURE.md` - System architecture and data flow
- `.cursorrules` - Development guidelines and patterns

## 🔧 Troubleshooting

### Database not found
- Run `node scripts/verify-setup.js` to diagnose
- Ensure databases are shared with your Notion integration
- Verify database IDs in `.env.personal`

### API rate limits
- Script includes 350ms delays between Notion API calls
- ProductBoard API: 50 req/sec (50ms delay)
- Notion API: 3 req/sec (350ms delay)

### Duplicate pages
- Run `node scripts/sync-productboard-to-notion.js` (incremental sync)
- It will detect existing pages and update instead of creating duplicates

## 📝 License

ISC

