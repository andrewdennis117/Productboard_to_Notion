# System Architecture - Visual Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRODUCTBOARD                                │
├─────────────────────────────────────────────────────────────────┤
│  Releases (18)              Features (168)                      │
│  ├─ v2.19 (Jan 6)           ├─ Workspace Prebuilds             │
│  ├─ v2.20 (Feb 3)           ├─ Desktop Connect                 │
│  ├─ v2.21 (Mar 3)           ├─ Notifications                   │
│  └─ ...                     └─ ...                             │
│                                                                 │
│  Each feature has:                                              │
│  - Status (Released, In Implementation, etc.)                   │
│  - Health (on-track, at-risk, etc.)                            │
│  - Owner (PM, Eng Lead)                                         │
│  - Release assignment                                           │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ API v1 (3-step process)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SYNC SCRIPT                                │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: GET /releases                                          │
│    → Fetch all 18 releases with dates & metadata               │
│                                                                 │
│  Step 2: GET /feature-release-assignments?release.id=X          │
│    → For each release, get list of feature IDs                 │
│    → Build map: releaseId → [featureIds]                       │
│                                                                 │
│  Step 3: GET /features/{id}                                     │
│    → For each feature, get full details including:             │
│      - name, status                                             │
│      - lastHealthUpdate.status (the health!)                   │
│      - owners                                                   │
│                                                                 │
│  Transform:                                                     │
│    → Normalize health: lowercase, null → "unknown"             │
│    → Format dates: "2025-05-05T00:00:00Z" → "2025-05-05"       │
│    → Build ID map: PB ID → Notion Page ID                      │
│                                                                 │
│  Sync Logic:                                                    │
│    → If exists: Update (if changed)                            │
│    → If new: Create                                             │
│    → Rate limit: 350ms between Notion calls                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Notion API
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                        NOTION                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  Releases Database (18 pages)                       │       │
│  ├─────────────────────────────────────────────────────┤       │
│  │  v2.22 (May 5)                                      │       │
│  │  ├─ Start Date: 2025-05-05                          │       │
│  │  ├─ End Date: 2025-06-02                            │       │
│  │  ├─ State: upcoming                                 │       │
│  │  ├─ Features: [11 linked features] ─────────┐       │       │
│  │  │                                          │       │       │
│  │  ├─ Feature Count: 11                       │       │       │
│  │  ├─ On Track Count: 9                       │       │       │
│  │  ├─ At Risk Count: 2                        │       │       │
│  │  └─ Health %: 82                            │       │       │
│  └─────────────────────────────────────────────┼───────┘       │
│                                                │               │
│                                                │ Two-way       │
│                                                │ Relation      │
│  ┌─────────────────────────────────────────────┼───────┐       │
│  │  Features Database (168 pages)             │       │       │
│  ├─────────────────────────────────────────────┼───────┤       │
│  │  Workspace Prebuilds                       │       │       │
│  │  ├─ Feature ID: abc-123-def                │       │       │
│  │  ├─ Status: Released                       │       │       │
│  │  ├─ Health Status: needs-attention         │       │       │
│  │  ├─ PM: Bartek                             │       │       │
│  │  ├─ Eng Lead: Danny K                      │       │       │
│  │  ├─ Release: → v2.22 (May 5) ──────────────┘       │       │
│  │  └─ Productboard Link: https://...                 │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Linked Database Views
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                       DASHBOARDS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Release Health Dashboard                                       │
│  ├─ Timeline (releases by date)                                │
│  ├─ Health table (sorted by Health %)                          │
│  └─ At-risk features (filtered)                                │
│                                                                 │
│  Feature Kanban                                                 │
│  └─ Board grouped by Health Status                             │
│      ├─ On Track (140)                                          │
│      ├─ Needs Attention (8)                                     │
│      ├─ At Risk (2)                                             │
│      └─ Off Track (4)                                           │
│                                                                 │
│  Personal Dashboard                                             │
│  └─ My features (filtered by PM name)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Sequence

```
1. Sync triggers (every 6 hours or manual)
   │
   ↓
2. Fetch ProductBoard Data (~30 seconds)
   ├─ GET /releases → 18 releases
   ├─ GET /feature-release-assignments → release-feature mapping
   └─ GET /features/{id} → 168 features with health
   │
   ↓
3. Build ID Mapping (~1 second)
   ├─ Query existing Notion pages
   ├─ Map: ProductBoard ID → Notion Page ID
   └─ Determine: create vs. update
   │
   ↓
4. Sync to Notion (~90 seconds)
   ├─ For each release:
   │   ├─ Check if exists in Notion
   │   ├─ If yes & changed → update
   │   ├─ If no → create
   │   └─ Wait 350ms (rate limit)
   │
   └─ For each feature:
       ├─ Check if exists in Notion
       ├─ If yes & changed → update
       ├─ If no → create
       ├─ Link to release
       └─ Wait 350ms (rate limit)
   │
   ↓
5. Rollups Calculate Automatically
   ├─ Feature Count updates
   ├─ Health counts update
   └─ Health % recalculates
   │
   ↓
6. Dashboards Update Automatically
   └─ All linked views refresh
```

**Total time:** ~2 minutes per sync

---

## Phase Timeline

```
Week 1: Setup & Build
├─ Day 1: Phases 0-2 (Setup, databases, fetch data)
├─ Day 2: Phases 3-4 (Dry-run, migration)
├─ Day 3: Phase 5 (Add rollups manually)
└─ Day 4: Phases 6-7 (Incremental sync, automation)

Week 2: Validate & Optimize
├─ Monitor automated syncs
├─ Build dashboards
├─ Train team on usage
└─ Document maintenance procedures

Week 3+: Production
└─ Fully automated, zero maintenance
```

---

## Technology Stack

```
Runtime:
├─ Node.js v18+ (ES modules)
└─ npm (package management)

Dependencies:
├─ @notionhq/client (Notion API)
└─ dotenv (environment variables)

APIs:
├─ ProductBoard API v1
└─ Notion API (current version)

Hosting:
├─ GitHub Actions (recommended - free)
└─ Or local cron job

Data Storage:
├─ .env.personal (credentials)
├─ data/ (exports for debugging)
└─ logs/ (sync history)
```

---

## Security

```
Sensitive Data:
├─ NOTION_API_KEY (starts with ntn_)
├─ PRODUCTBOARD_API_TOKEN
├─ Database IDs
└─ All stored in .env.personal

Git Security:
├─ .gitignore includes .env.personal
├─ Never commit credentials
└─ Use GitHub secrets for Actions

Notion Security:
├─ Integration has minimal permissions
├─ Only reads ProductBoard
└─ Only writes to specific databases
```

---

## Performance Specs

```
Sync Performance:
├─ Duration: ~2 minutes full sync
│   ├─ ProductBoard fetch: ~30 seconds
│   ├─ ID mapping: ~1 second
│   └─ Notion writes: ~90 seconds
│
├─ API Calls per Sync:
│   ├─ ProductBoard: ~190 calls
│   └─ Notion: ~20 calls (on incremental)
│
└─ Frequency: Every 6 hours
    └─ 4 syncs/day = 8 minutes/day
```

---

## Validation Points

```
After Each Phase:
├─ Phase 0: ✓ Both APIs respond
├─ Phase 1: ✓ Databases exist with correct schema
├─ Phase 2: ✓ JSON export has all data
├─ Phase 3: ✓ Dry-run shows correct operations
├─ Phase 4: ✓ Data in Notion, relations work
├─ Phase 5: ✓ Rollups calculate correctly
├─ Phase 6: ✓ Updates work, no duplicates
└─ Phase 7: ✓ Automation runs successfully
```

---

This architecture is battle-tested and incorporates all our learnings.
Follow PROJECT-PLAN.md to build it step-by-step! 🚀
