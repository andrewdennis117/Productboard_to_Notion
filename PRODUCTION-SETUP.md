# Production Setup Guide

## Phase 7: Automated Sync Setup

This guide covers setting up automated synchronization between ProductBoard and Notion.

---

## Option A: GitHub Actions (Recommended)

### Benefits
- ✅ Free for public repositories
- ✅ No server maintenance
- ✅ Built-in logging and monitoring
- ✅ Easy manual triggers
- ✅ Automatic retries on failure

### Setup Steps

1. **Push code to GitHub:**
   ```bash
   git add .
   git commit -m "Add sync automation"
   git push origin main
   ```

2. **Configure GitHub Secrets:**
   - Go to your repository on GitHub
   - Navigate to: **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret** and add:
     - `NOTION_API_KEY` - Your Notion integration token
     - `PRODUCTBOARD_API_TOKEN` - Your ProductBoard API token
     - `NOTION_RELEASES_DB_ID` - Releases database ID
     - `NOTION_FEATURES_DB_ID` - Features database ID

3. **Test the workflow:**
   - Go to **Actions** tab in GitHub
   - Click on **ProductBoard Sync** workflow
   - Click **Run workflow** → **Run workflow** (manual trigger)
   - Watch it execute and verify it completes successfully

4. **Verify automatic runs:**
   - The workflow runs every 6 hours automatically
   - Check the Actions tab to see scheduled runs
   - Each run creates a log artifact you can download

### Workflow Configuration

The workflow (`.github/workflows/sync.yml`) is configured to:
- Run every 6 hours: `0 */6 * * *`
- Support manual triggers via GitHub UI
- Upload logs as artifacts for debugging
- Use Node.js 18+ with npm caching

To change the schedule, edit `.github/workflows/sync.yml`:
```yaml
schedule:
  - cron: '0 */6 * * *'  # Change this line
```

Common schedules:
- Every hour: `'0 * * * *'`
- Every 12 hours: `'0 */12 * * *'`
- Daily at midnight: `'0 0 * * *'`
- Every weekday at 9 AM: `'0 9 * * 1-5'`

---

## Option B: Local Cron Job

### Benefits
- ✅ Full control over execution
- ✅ No GitHub dependency
- ✅ Can run more frequently
- ✅ Direct access to logs

### Setup Steps

1. **Create a wrapper script** (optional but recommended):
   ```bash
   # Create scripts/run-sync.sh
   #!/bin/bash
   cd /path/to/productboard_notion_sync_v2
   node scripts/sync-productboard-to-notion.js >> logs/sync.log 2>&1
   ```

2. **Make it executable:**
   ```bash
   chmod +x scripts/run-sync.sh
   ```

3. **Add to crontab:**
   ```bash
   crontab -e
   ```

4. **Add this line:**
   ```bash
   # Run sync every 6 hours
   0 */6 * * * /path/to/productboard_notion_sync_v2/scripts/run-sync.sh
   ```

5. **Verify cron is running:**
   ```bash
   # Check cron logs (location varies by OS)
   tail -f /var/log/cron  # Linux
   tail -f /var/log/system.log | grep cron  # macOS
   ```

---

## Monitoring & Logs

### Log Location
- **Local:** `logs/sync.log`
- **GitHub Actions:** Download from workflow run artifacts

### Log Format
```
[2024-12-05T10:00:00.000Z] 🚀 Starting Incremental Sync
[2024-12-05T10:00:00.100Z] ==================================================
[2024-12-05T10:00:00.200Z] 📋 Building ID mapping from Notion...
[2024-12-05T10:00:05.500Z]    ✅ Found 17 existing releases
[2024-12-05T10:00:10.800Z]    ✅ Found 230 existing features
...
[2024-12-05T10:02:30.000Z] 📊 Sync Summary:
[2024-12-05T10:02:30.100Z] Releases:
[2024-12-05T10:02:30.200Z]   ✅ Created: 0
[2024-12-05T10:02:30.300Z]   ✅ Updated: 1
[2024-12-05T10:02:30.400Z]   ✅ Unchanged: 16
[2024-12-05T10:02:30.500Z] ⏱️  Duration: 150.5s
[2024-12-05T10:02:30.600Z] 🎉 Sync Complete!
```

### Monitoring Best Practices

1. **Check logs regularly:**
   ```bash
   tail -f logs/sync.log
   ```

2. **Set up log rotation** (optional):
   ```bash
   # Add to crontab to rotate logs weekly
   0 0 * * 0 mv logs/sync.log logs/sync-$(date +%Y%m%d).log
   ```

3. **Monitor for errors:**
   ```bash
   grep "Fatal error\|Error:" logs/sync.log
   ```

4. **Track sync frequency:**
   ```bash
   grep "Sync Complete" logs/sync.log | tail -10
   ```

---

## Error Handling

The sync script includes robust error handling:

- ✅ **API errors:** Logged and script continues with next item
- ✅ **Missing data:** Logged as warnings, script continues
- ✅ **Fatal errors:** Logged and script exits with error code
- ✅ **Rate limits:** Automatic delays prevent hitting limits

### Common Issues

**Issue: Database not found**
- **Solution:** Run `node scripts/verify-setup.js` to diagnose
- **Check:** Database IDs in `.env.personal` or GitHub secrets

**Issue: API rate limit exceeded**
- **Solution:** Script already includes delays, but if persistent:
  - Increase delays in script (currently 350ms for Notion)
  - Reduce sync frequency

**Issue: Authentication failed**
- **Solution:** Verify API tokens are correct and not expired
- **Check:** Run `node scripts/test-connections.js`

---

## Maintenance

### Regular Tasks

1. **Weekly:** Review sync logs for errors
2. **Monthly:** Verify data accuracy in Notion
3. **Quarterly:** Update dependencies (`npm update`)

### Updating the Sync

1. **Pull latest changes:**
   ```bash
   git pull origin main
   npm install  # If dependencies changed
   ```

2. **Test locally:**
   ```bash
   node scripts/sync-productboard-to-notion.js
   ```

3. **Deploy:**
   - GitHub Actions: Push to main branch (auto-deploys)
   - Cron: No action needed (uses latest code)

---

## Troubleshooting

### Sync not running

**GitHub Actions:**
- Check Actions tab for failed runs
- Verify secrets are set correctly
- Check workflow file syntax

**Cron:**
- Verify cron service is running: `systemctl status cron` (Linux)
- Check cron logs for errors
- Verify script path is absolute

### Sync creating duplicates

- This shouldn't happen with incremental sync
- If it does, run `node scripts/sync-productboard-to-notion.js` again
- It will detect existing pages and update instead of creating

### Performance issues

- Sync takes ~2-3 minutes for 17 releases + 230 features
- If slower, check network connectivity
- Consider reducing sync frequency if needed

---

## Success Criteria

✅ **Automated sync runs every 6 hours**  
✅ **Logs are captured and accessible**  
✅ **Errors don't crash the system**  
✅ **Can trigger manually when needed**  
✅ **Data stays in sync between ProductBoard and Notion**

---

## Next Steps

After setup is complete:

1. ✅ Monitor first few automated runs
2. ✅ Verify data accuracy
3. ✅ Set up alerts (optional - GitHub Actions sends email on failure)
4. ✅ Document any customizations

For questions or issues, refer to:
- `PROJECT-PLAN.md` - Complete implementation guide
- `ARCHITECTURE.md` - System architecture
- `.cursorrules` - Development patterns

