# Implementation Checklist - One Page Reference

**Print this or keep on second monitor** 📋

---

## ☐ PHASE 0: Setup (10 min)

```bash
mkdir productboard-notion-sync-v2 && cd $_
npm init -y
npm install @notionhq/client dotenv
```

- [ ] Copy .cursorrules-v2 → .cursorrules
- [ ] Copy PROJECT-PLAN.md
- [ ] Create .env.personal with tokens
- [ ] Create .gitignore
- [ ] `node scripts/test-connections.js` → ✅ Both APIs work

---

## ☐ PHASE 1: Create Databases (20 min - MANUAL in Notion)

### Releases Database:
- [ ] Create page "ProductBoard Sync"
- [ ] Add table database "Releases"
- [ ] Add properties: Name (title), Productboard ID, Start Date, End Date, State (select), Release Group, Product Manager, Engineering Lead
- [ ] Share page with integration
- [ ] Get database ID → .env.personal

### Features Database:
- [ ] Add table database "Features"  
- [ ] Add properties: Name (title), Feature ID, Status (select with 9 options), Health Status (select with 5 options), Product Manager, Engineering Lead, Productboard Link (URL), Last Updated
- [ ] Add Release relation → Link to Releases, toggle "Show on Releases" ON
- [ ] Get database ID → .env.personal

**Test:** Manually add test release, add test feature, link them together

---

## ☐ PHASE 2: Fetch Data (15 min)

```bash
# Cursor: "Create scripts/fetch-productboard.js following Phase 2"
node scripts/fetch-productboard.js
```

- [ ] data/productboard-export.json created
- [ ] Contains ~18 releases
- [ ] Contains ~168 features
- [ ] `node scripts/validate-productboard-data.js` → ✅ All valid

---

## ☐ PHASE 3: Dry Run (10 min)

```bash
# Cursor: "Create scripts/migrate-to-notion.js with --dry-run"
node scripts/migrate-to-notion.js --dry-run
```

- [ ] Shows 18 releases to create
- [ ] Shows 168 features to create
- [ ] Shows 168 relations to create
- [ ] No errors

---

## ☐ PHASE 4: Migrate (30 min)

```bash
node scripts/migrate-to-notion.js --test-one  # Test with 1 release
node scripts/migrate-to-notion.js             # Full migration
```

- [ ] 18 releases in Notion
- [ ] 168 features in Notion
- [ ] Features linked to releases
- [ ] Can navigate release → features
- [ ] Can navigate feature → release
- [ ] No duplicates

---

## ☐ PHASE 5: Rollups (10 min - MANUAL in Notion)

### In Releases Database:

**Add 5 Rollup Properties:**
1. [ ] Feature Count (Rollup → Features → Name → Count all)
2. [ ] On Track Count (Rollup → Features → Health Status → Count values → filter: on-track)
3. [ ] Needs Attention Count (filter: needs-attention)
4. [ ] At Risk Count (filter: at-risk)
5. [ ] Off Track Count (filter: off-track)

**Add 1 Formula:**
6. [ ] Health % (Formula: `if(prop("Feature Count") > 0, round(prop("On Track Count") / prop("Feature Count") * 100), 0)`)

**Test:** v2.22 should show ~11 features, ~82% health

---

## ☐ PHASE 6: Incremental Sync (20 min)

```bash
# Cursor: "Create scripts/sync-productboard-to-notion.js following Phase 6"
node scripts/sync-productboard-to-notion.js
```

- [ ] Run twice → Second run shows "0 created, 0 updated" (all unchanged)
- [ ] Change health in PB → Run sync → Only that feature updates
- [ ] No duplicates created

---

## ☐ PHASE 7: Automate (10 min)

```bash
# Option A: GitHub Actions
# Cursor: "Create .github/workflows/sync.yml"

# Option B: Cron
crontab -e
# Add: 0 */6 * * * cd /path && node scripts/sync-productboard-to-notion.js
```

- [ ] Runs automatically
- [ ] Logs captured
- [ ] Can trigger manually
- [ ] Errors handled gracefully

---

## ✅ FINAL VERIFICATION

- [ ] 18 releases in Releases database
- [ ] 168 features in Features database
- [ ] Rollups calculating automatically
- [ ] Health % showing for each release
- [ ] Can filter features by health status
- [ ] Can group features by release
- [ ] Re-running sync doesn't duplicate
- [ ] Automated sync working

---

## 🎯 SUCCESS = All boxes checked above ✅

**Time spent:** ~2 hours  
**Value:** Saves hours/week + $800/year  
**Result:** Automated ProductBoard → Notion sync

---

## 🚨 Quick Troubleshooting

| Error | Fix |
|-------|-----|
| API token invalid | Regenerate + share page |
| Relation error | Use dual_property format |
| Duplicates | Check ID mapping logic |
| Rate limit | Increase sleep to 350ms+ |
| Rollup not working | Must add manually in UI |

---

## 📞 Reference Docs

- Detailed steps: PROJECT-PLAN.md
- Cursor context: .cursorrules
- Architecture: ARCHITECTURE.md
- Dashboards: DASHBOARD-WALKTHROUGH.md

---

**Print Date:** December 5, 2024  
**Version:** 2.0 (Fresh Start)
