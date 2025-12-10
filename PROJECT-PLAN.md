# ProductBoard → Notion Sync - Master Implementation Plan

**Goal:** Sync ProductBoard releases and features into two Notion databases with health metrics and rollups.

**Strategy:** Build incrementally with testing at each phase.

---

## 📋 Project Overview

### What We're Building:

```
ProductBoard API
       ↓
  [Sync Script]
       ↓
   Notion API
       ↓
  ┌─────────────────┐
  │  Two Databases  │
  ├─────────────────┤
  │ 1. Releases     │ ~18 releases (v2.19, v2.20, etc.)
  │ 2. Features     │ ~168 features with health status
  └─────────────────┘
       ↓
  [Two-way relation]
       ↓
  Automatic rollups: Feature Count, Health %, etc.
```

---

## 🎯 Success Criteria

**Phase 1:** Notion databases exist with correct schema ✅  
**Phase 2:** Sample data syncs successfully ✅  
**Phase 3:** Full sync completes without errors ✅  
**Phase 4:** Rollups calculate automatically ✅  
**Phase 5:** Ongoing syncs update existing data ✅

---

## 📦 Phases

### Phase 0: Setup & Verification (10 min)
- Set up repository
- Configure environment
- Test API connections
- **Checkpoint:** Both APIs respond successfully

### Phase 1: Database Creation (20 min)
- Create Releases database in Notion
- Create Features database in Notion
- Set up two-way relation
- **Checkpoint:** Can manually add test data

### Phase 2: Schema Validation (10 min)
- Verify all properties exist
- Test property types
- Document database IDs
- **Checkpoint:** Schema matches spec exactly

### Phase 3: Fetch ProductBoard Data (15 min)
- Query ProductBoard API
- Parse responses
- Save to JSON for inspection
- **Checkpoint:** Can see all releases and features locally

### Phase 4: One-Time Migration (30 min)
- Parse existing ProductBoard data
- Create pages in Notion
- Link features to releases
- **Checkpoint:** All data in Notion, relations work

### Phase 5: Rollup Configuration (10 min - MANUAL)
- Add rollup properties in Notion UI
- Test calculations
- **Checkpoint:** Health % calculates correctly

### Phase 6: Incremental Sync (20 min)
- Build update vs. create logic
- Test with changes
- **Checkpoint:** Updates work without duplicates

### Phase 7: Production Setup (10 min)
- Schedule sync (cron/GitHub Actions)
- Add error notifications
- Document maintenance
- **Checkpoint:** Runs automatically

---

## 🔧 Phase Breakdown

---

## Phase 0: Setup & Verification

### Objectives:
- Clean repository
- Working API connections
- Environment configured

### Steps:

1. **Create new repository:**
```bash
mkdir productboard-notion-sync-v2
cd productboard-notion-sync-v2
npm init -y
git init
```

2. **Install dependencies:**
```bash
npm install @notionhq/client dotenv
npm install --save-dev @types/node
```

3. **Create .env.personal:**
```bash
# Notion
NOTION_API_KEY=ntn_your_token_here
NOTION_WORKSPACE_ID=your_workspace_id

# ProductBoard
PRODUCTBOARD_API_TOKEN=your_pb_token_here

# Will be filled in Phase 2
NOTION_RELEASES_DB_ID=
NOTION_FEATURES_DB_ID=
```

4. **Test script:**
```javascript
// test-connections.js
// Verifies both API connections work
```

5. **Run test:**
```bash
node test-connections.js
```

### Success Criteria:
- ✅ Both API tokens valid
- ✅ Can reach ProductBoard API
- ✅ Can reach Notion API
- ✅ No connection errors

### Rollback:
- N/A (fresh start)

---

## Phase 1: Database Creation

### Objectives:
- Create two databases in Notion
- Correct schema (properties)
- Two-way relation configured

### Option A: Manual Creation (Recommended for first time)

**1. Create Releases Database:**

In Notion:
1. Create new page: "ProductBoard Sync"
2. Type `/database` → "Table - Inline"
3. Name it: "Releases"
4. Add properties:

| Property Name | Type | Configuration |
|---------------|------|---------------|
| Name | Title | (default) |
| Productboard ID | Text | |
| Start Date | Date | |
| End Date | Date | |
| State | Select | Options: upcoming, in-progress, completed, archived |
| Release Group | Text | |
| Product Manager | Text | |
| Engineering Lead | Text | |
| Features | Relation | → (will link to Features DB) |

**2. Create Features Database:**

Below Releases:
1. Type `/database` → "Table - Inline"
2. Name it: "Features"
3. Add properties:

| Property Name | Type | Configuration |
|---------------|------|---------------|
| Name | Title | (default) |
| Feature ID | Text | |
| Status | Select | Options: Released, In Implementation, Being shaped, Prioritized, Road-mapped, Created, Challenged, Celebration, Will not implement |
| Health Status | Select | Options: on-track, needs-attention, at-risk, off-track, unknown |
| Product Manager | Text | |
| Engineering Lead | Text | |
| Release | Relation | → Link to Releases database, enable two-way |
| Productboard Link | URL | |
| Last Updated | Last edited time | |

**3. Configure Two-Way Relation:**

When creating the "Release" relation in Features:
- Select "Releases" database
- Toggle ON: "Show on Releases"
- Name on Releases side: "Features"

### Option B: Script Creation

Run:
```bash
node scripts/create-databases.js
```

This creates both databases with correct schema.

### Testing Phase 1:

**Test 1: Manual data entry**
```
1. Open Releases database
2. Add a test release: "Test Release"
3. Set Start Date: today
4. Set End Date: +1 month
```

**Test 2: Relation works**
```
1. Open Features database
2. Add a test feature: "Test Feature"
3. Link it to "Test Release"
4. Go back to Releases
5. Verify "Test Feature" shows in Features column
```

**Test 3: Get database IDs**
```bash
node scripts/get-database-ids.js
```

Copy IDs to `.env.personal`:
```
NOTION_RELEASES_DB_ID=abc123...
NOTION_FEATURES_DB_ID=def456...
```

### Success Criteria:
- ✅ Two databases exist
- ✅ All properties present with correct types
- ✅ Two-way relation works
- ✅ Database IDs in .env.personal
- ✅ Integration has access to both databases

### Rollback:
- Delete test data
- Or delete databases and recreate

---

## Phase 2: Fetch ProductBoard Data

### Objectives:
- Get all releases from ProductBoard
- Get all features from ProductBoard
- Save to JSON for inspection
- No Notion writes yet

### Steps:

1. **Run fetch script:**
```bash
node scripts/fetch-productboard.js
```

This:
- Queries ProductBoard API v1 (the working endpoints)
- Gets all releases
- For each release, gets feature assignments
- For each feature, gets full details including health
- Saves to `data/productboard-export.json`

2. **Inspect the data:**
```bash
cat data/productboard-export.json | jq '.releases | length'
cat data/productboard-export.json | jq '.features | length'
```

### Testing Phase 2:

**Test 1: Data structure**
```bash
node scripts/validate-productboard-data.js
```

Should show:
```
✅ Found 18 releases
✅ Found 168 features
✅ All releases have dates
✅ All features have health status
✅ Release IDs match
```

**Test 2: Manual inspection**

Open `data/productboard-export.json` and verify:
- Releases have: id, name, startDate, endDate, state
- Features have: id, name, status, health, releaseId

### Success Criteria:
- ✅ JSON file created
- ✅ Contains all releases (18)
- ✅ Contains all features (168)
- ✅ Data structure correct
- ✅ No API errors

### Rollback:
- Delete JSON file
- N/A (no writes to Notion yet)

---

## Phase 3: Dry-Run Migration

### Objectives:
- Parse ProductBoard data
- Map to Notion format
- Show what WOULD be created
- No actual writes yet

### Steps:

1. **Run dry-run:**
```bash
node scripts/migrate-to-notion.js --dry-run
```

Output should show:
```
📊 Dry Run - No Changes Will Be Made

Releases to Create: 18
├─ v2.19 (Jan 6) → Start: 2025-01-06, End: 2025-02-03
├─ v2.20 (Feb 3) → Start: 2025-02-03, End: 2025-03-03
├─ ...

Features to Create: 168
├─ Workspace Prebuilds → Release: v2.22, Health: needs-attention
├─ Desktop Connect → Release: v2.23, Health: on-track
├─ ...

Relations to Create: 168
Feature → Release links
```

2. **Review output:**
- All 18 releases listed?
- All 168 features listed?
- Health statuses look right?
- Release links correct?

### Testing Phase 3:

**Test 1: Validate counts**
```bash
node scripts/migrate-to-notion.js --dry-run --summary
```

Should show:
```
Summary:
- Releases: 18
- Features: 168
- Health breakdown:
  - on-track: 140
  - needs-attention: 8
  - at-risk: 2
  - off-track: 4
  - unknown: 14
```

**Test 2: Spot check**

Pick 3 random releases and verify:
- Dates are correct
- Feature count matches ProductBoard
- Health status matches ProductBoard

### Success Criteria:
- ✅ All data parsed correctly
- ✅ Counts match ProductBoard
- ✅ No errors in dry-run
- ✅ Output looks correct

### Rollback:
- N/A (no writes yet)

---

## Phase 4: One-Time Migration (THE BIG ONE)

### Objectives:
- Write releases to Notion
- Write features to Notion
- Link features to releases
- First actual data in Notion

### Pre-flight Checks:

```bash
# 1. Backup (if you have existing data)
node scripts/export-notion.js --backup

# 2. Verify database IDs
node scripts/verify-setup.js

# 3. Test with ONE release
node scripts/migrate-to-notion.js --test-one
```

### Steps:

1. **Run migration:**
```bash
node scripts/migrate-to-notion.js
```

This will:
- Create all 18 releases
- Wait 500ms between each (Notion rate limit)
- Create all 168 features
- Wait 350ms between each
- Link features to releases

Expected time: ~2-3 minutes

2. **Monitor output:**
```
🚀 Starting Migration...

Phase 1/3: Creating Releases
✅ v2.19 (Jan 6) - Created
✅ v2.20 (Feb 3) - Created
... (18 total)

Phase 2/3: Creating Features
✅ Workspace Prebuilds - Created, linked to v2.22
✅ Desktop Connect - Created, linked to v2.23
... (168 total)

Phase 3/3: Verification
✅ 18 releases in Notion
✅ 168 features in Notion
✅ All relations verified

🎉 Migration Complete!
```

### Testing Phase 4:

**Test 1: Visual check**
```
1. Open Releases database in Notion
2. Count rows (should be 18)
3. Click on v2.22
4. Verify "Features" column shows feature names
```

**Test 2: Verify relations**
```
1. Open Features database
2. Click on "Workspace Prebuilds"
3. Verify "Release" shows v2.22
4. Try 3 more random features
```

**Test 3: Verify data**
```bash
node scripts/verify-migration.js
```

Should output:
```
✅ All 18 releases present
✅ All 168 features present
✅ All 168 relations created
✅ No orphaned features
✅ Health statuses correct
✅ Dates correct
```

**Test 4: Spot check health**
```
In Features database:
1. Filter by Health Status = "at-risk"
2. Should see 2 features
3. Verify they match ProductBoard
```

### Success Criteria:
- ✅ 18 releases in Notion
- ✅ 168 features in Notion
- ✅ All features linked to releases
- ✅ Can see features from release pages
- ✅ Can see release from feature pages
- ✅ Health statuses correct
- ✅ Dates correct

### Rollback:

If something goes wrong:
```bash
# Delete all created pages
node scripts/cleanup-notion.js

# Or manually in Notion:
# 1. Select all in Releases → Delete
# 2. Select all in Features → Delete
```

---

## Phase 5: Configure Rollups (MANUAL)

### Objectives:
- Add rollup properties to Releases
- Enable automatic health calculations
- Add Health % formula

### Steps:

**This MUST be done manually in Notion UI** (API doesn't support rollups with filters)

1. **Open Releases database**

2. **Add Feature Count rollup:**
   - Click "+" to add property
   - Name: `Feature Count`
   - Type: Rollup
   - Relation: `Features`
   - Property: `Name`
   - Calculate: `Count all`

3. **Add On Track Count rollup:**
   - Name: `On Track Count`
   - Type: Rollup
   - Relation: `Features`
   - Property: `Health Status`
   - Calculate: `Count values`
   - Filter: Only count `on-track`

4. **Add Needs Attention Count:**
   - Same as above
   - Filter: Only count `needs-attention`

5. **Add At Risk Count:**
   - Same as above
   - Filter: Only count `at-risk`

6. **Add Off Track Count:**
   - Same as above
   - Filter: Only count `off-track`

7. **Add Health % formula:**
   - Name: `Health %`
   - Type: Formula
   - Formula:
   ```
   if(prop("Feature Count") > 0, 
     round(prop("On Track Count") / prop("Feature Count") * 100), 
     0
   )
   ```

### Testing Phase 5:

**Test 1: Manual verification**
```
1. Open Releases database
2. Look at v2.22 row
3. Verify:
   - Feature Count = 11
   - On Track Count = 9
   - At Risk Count = 2
   - Health % = 82
```

**Test 2: Verify calculations**
```
For each release:
✅ Feature Count = number of linked features
✅ Health counts = correct by status
✅ Health % = (On Track / Total) * 100
```

### Success Criteria:
- ✅ All 5 rollup properties exist
- ✅ Formula property exists
- ✅ Values calculate correctly
- ✅ Match manual counts

### Rollback:
- Delete the properties if incorrect
- Recreate with correct settings

---

## Phase 6: Incremental Sync

### Objectives:
- Update existing pages (not create duplicates)
- Only update what changed
- Handle new features
- Handle deleted features

### Steps:

1. **Build ID mapping:**
```javascript
// Map ProductBoard IDs → Notion page IDs
const idMap = {
  releases: new Map(),  // PB release ID → Notion page ID
  features: new Map()   // PB feature ID → Notion page ID
};
```

2. **Implement update logic:**
```javascript
// For each feature:
if (notionPageExists) {
  if (dataChanged) {
    await updateNotion(pageId, newData);
  }
} else {
  await createNotion(newData);
}
```

3. **Test incremental sync:**
```bash
# Make a change in ProductBoard (change health status)
# Run sync
node scripts/sync-productboard-to-notion.js

# Should show:
# ✅ 0 releases created
# ✅ 1 release updated (changed data)
# ✅ 17 releases unchanged
# ✅ 0 features created
# ✅ 1 feature updated (changed health)
# ✅ 167 features unchanged
```

### Testing Phase 6:

**Test 1: No changes**
```bash
# Run sync twice with no PB changes
node scripts/sync-productboard-to-notion.js
node scripts/sync-productboard-to-notion.js

# Should show:
# ✅ All pages unchanged
# ✅ No API writes (read-only)
```

**Test 2: Update detection**
```
1. In ProductBoard, change a feature health
2. Run sync
3. Verify only that feature updated in Notion
4. Verify no duplicates created
```

**Test 3: New feature**
```
1. Add new feature in ProductBoard
2. Assign to a release
3. Run sync
4. Verify new feature appears in Notion
5. Verify linked to correct release
```

### Success Criteria:
- ✅ Doesn't create duplicates
- ✅ Updates only changed data
- ✅ Handles new features
- ✅ Handles deleted features (optional)
- ✅ Fast (skips unchanged pages)

### Rollback:
- N/A (updates are non-destructive)
- If bad data, re-run from Phase 4

---

## Phase 7: Production Setup

### Objectives:
- Automated scheduling
- Error notifications
- Logging
- Maintenance procedures

### Option A: GitHub Actions (Recommended)

Create `.github/workflows/sync.yml`:
```yaml
name: ProductBoard Sync

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: node scripts/sync-productboard-to-notion.js
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          PRODUCTBOARD_API_TOKEN: ${{ secrets.PRODUCTBOARD_API_TOKEN }}
          NOTION_RELEASES_DB_ID: ${{ secrets.NOTION_RELEASES_DB_ID }}
          NOTION_FEATURES_DB_ID: ${{ secrets.NOTION_FEATURES_DB_ID }}
```

### Option B: Local Cron

```bash
# Add to crontab
0 */6 * * * cd /path/to/repo && node scripts/sync-productboard-to-notion.js >> logs/sync.log 2>&1
```

### Testing Phase 7:

**Test 1: Manual run**
```bash
# Trigger GitHub Action manually
# Or run cron script manually
# Verify completes successfully
```

**Test 2: Check logs**
```bash
# View sync logs
cat logs/sync.log

# Should show:
# [2024-12-05 10:00:00] Starting sync
# [2024-12-05 10:00:15] Releases: 0 created, 1 updated, 17 unchanged
# [2024-12-05 10:02:30] Features: 0 created, 3 updated, 165 unchanged
# [2024-12-05 10:02:31] Sync complete
```

**Test 3: Error handling**
```bash
# Simulate error (bad token)
# Verify error is logged
# Verify doesn't crash
# Verify retry logic works
```

### Success Criteria:
- ✅ Runs automatically every 6 hours
- ✅ Logs to file
- ✅ Errors don't crash system
- ✅ Can trigger manually
- ✅ Notifications work (optional)

---

## 📊 Final Verification Checklist

After all phases complete:

- [ ] Releases database has 18 releases
- [ ] Features database has 168 features
- [ ] All features linked to releases
- [ ] Rollups calculate correctly
- [ ] Health % shows accurate percentages
- [ ] Can create dashboard views
- [ ] Incremental sync works
- [ ] No duplicate pages
- [ ] Automated sync runs
- [ ] Logs are captured

---

## 🚨 Troubleshooting

### Issue: Duplicate pages created

**Cause:** ID mapping not working

**Fix:**
```bash
node scripts/deduplicate.js
# Removes duplicates based on Feature ID / Productboard ID
```

### Issue: Relations not working

**Cause:** Relation property not two-way

**Fix:**
1. Open Features database
2. Click on "Release" property
3. Toggle ON "Show on Releases"

### Issue: Rollups not calculating

**Cause:** Filter might be wrong

**Fix:**
1. Open Releases database
2. Edit rollup property
3. Verify filter matches exact health status name

### Issue: API rate limits

**Cause:** Too many requests too fast

**Fix:**
- Increase delay between requests (currently 350ms)
- Notion limit: 3 req/sec
- ProductBoard limit: 50 req/sec

---

## 📁 Project Structure

```
productboard-notion-sync-v2/
├── .env.personal              # API tokens & database IDs
├── .gitignore                 # Ignore .env.personal
├── package.json               # Dependencies
├── README.md                  # This file
│
├── .cursorrules               # Instructions for Cursor AI
│
├── scripts/
│   ├── test-connections.js          # Phase 0
│   ├── create-databases.js          # Phase 1
│   ├── get-database-ids.js          # Phase 1
│   ├── fetch-productboard.js        # Phase 2
│   ├── validate-productboard-data.js # Phase 2
│   ├── migrate-to-notion.js         # Phase 4
│   ├── verify-migration.js          # Phase 4
│   ├── sync-productboard-to-notion.js # Phase 6
│   ├── cleanup-notion.js            # Rollback helper
│   └── deduplicate.js               # Troubleshooting
│
├── data/
│   ├── productboard-export.json     # Phase 2 output
│   └── notion-backup.json           # Backups
│
└── logs/
    └── sync.log                     # Production logs
```

---

## 🎯 Quick Start Commands

```bash
# Phase 0: Setup
npm install
node scripts/test-connections.js

# Phase 1: Create databases (manual in Notion UI)
# Then:
node scripts/get-database-ids.js

# Phase 2: Fetch data
node scripts/fetch-productboard.js
node scripts/validate-productboard-data.js

# Phase 3: Dry run
node scripts/migrate-to-notion.js --dry-run

# Phase 4: Migrate
node scripts/migrate-to-notion.js --test-one  # Test first
node scripts/migrate-to-notion.js             # Full migration

# Phase 5: Configure rollups (manual in Notion UI)

# Phase 6: Test incremental
node scripts/sync-productboard-to-notion.js

# Phase 7: Production
# Set up GitHub Actions or cron
```

---

## 📚 Key Learnings Applied

1. **ProductBoard API:** Use v1 endpoints (v2 filters don't work)
2. **Three-step fetch:** releases → assignments → features
3. **Notion relations:** Must be two-way for rollups
4. **Notion rollups:** Must be added manually (API limitation)
5. **Rate limiting:** 350ms between Notion calls
6. **ID mapping:** Essential for incremental sync
7. **Health normalization:** Lowercase, null → "unknown"
8. **Composite IDs:** Use `${releaseId}:${index}` for deduplication

---

## 🎉 Success Metrics

**After completion:**
- 18 releases with dates and health metrics
- 168 features with status and health
- Automatic rollups showing health percentages
- Working dashboards for visualization
- Automated sync every 6 hours
- Zero manual data entry needed

---

## 📞 Support

**Issues:** Document in GitHub issues
**Questions:** Check .cursorrules file
**Updates:** Run `node scripts/sync-productboard-to-notion.js`
