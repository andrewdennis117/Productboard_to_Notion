// sync-productboard-to-notion.js
// Phase 6: Incremental sync - updates existing pages, creates new ones

import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: '.env.personal' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup logging
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'sync.log');

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  // Write to file
  fs.appendFileSync(logFile, logMessage, 'utf8');
  
  // Also output to console
  if (type === 'error') {
    console.error(message);
  } else {
    console.log(message);
  }
}

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_RELEASES_DB_ID = process.env.NOTION_RELEASES_DB_ID;
const NOTION_FEATURES_DB_ID = process.env.NOTION_FEATURES_DB_ID;
const PRODUCTBOARD_API_TOKEN = process.env.PRODUCTBOARD_API_TOKEN;
const PRODUCTBOARD_API_BASE = 'https://api.productboard.com';

// Import fetch functions from fetch-productboard.js
// We'll inline them here for simplicity

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(dateString) {
  if (!dateString) return null;
  return dateString.split('T')[0];
}

function normalizeHealth(health) {
  if (!health) return 'unknown';
  return String(health).toLowerCase();
}

async function fetchProductBoardAPI(endpoint) {
  const url = `${PRODUCTBOARD_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Version': '1',
      'Authorization': `Bearer ${PRODUCTBOARD_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ProductBoard API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

async function fetchAllReleases() {
  const response = await fetchProductBoardAPI('/releases');
  const releases = response.data || [];
  
  return releases.map(release => ({
    id: release.id,
    name: release.name,
    startDate: formatDate(release.startDate),
    endDate: formatDate(release.endDate),
    state: release.state,
    releaseGroup: release.releaseGroup?.id || null,
    productManager: release.productManager?.name || null,
    engineeringLead: release.engineeringLead?.name || null
  }));
}

async function fetchFeatureAssignments(releaseId) {
  try {
    const response = await fetchProductBoardAPI(`/feature-release-assignments?release.id=${releaseId}`);
    const assignments = response.data || [];
    return assignments.map(assignment => assignment.feature?.id).filter(Boolean);
  } catch (error) {
    console.error(`   ⚠️  Failed to fetch assignments for release ${releaseId}: ${error.message}`);
    return [];
  }
}

async function fetchFeatureDetails(featureId) {
  try {
    const response = await fetchProductBoardAPI(`/features/${featureId}`);
    const feature = response.data;
    
    if (!feature) return null;
    
    const health = feature.lastHealthUpdate?.status || null;
    
    return {
      id: feature.id,
      name: feature.name,
      status: feature.status?.name || null,
      health: normalizeHealth(health),
      productManager: feature.productManager?.name || null,
      engineeringLead: feature.engineeringLead?.name || null,
      productboardLink: feature.links?.html || null
    };
  } catch (error) {
    console.error(`   ⚠️  Failed to fetch feature ${featureId}: ${error.message}`);
    return null;
  }
}

// Build ID mapping from existing Notion pages
async function buildIdMapping(notionClient) {
  log('📋 Building ID mapping from Notion...');
  
  // Debug: Check if notionClient is valid
  if (!notionClient || !notionClient.databases) {
    const error = 'Invalid Notion client passed to buildIdMapping';
    log(error, 'error');
    throw new Error(error);
  }
  
  const idMap = {
    releases: new Map(), // PB release ID → Notion page ID
    features: new Map()   // PB feature ID → Notion page ID
  };
  
  // Query releases using direct API call (databases.query endpoint)
  let hasMore = true;
  let startCursor = undefined;
  
  while (hasMore) {
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_RELEASES_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start_cursor: startCursor,
        page_size: 100
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to query releases database: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    data.results.forEach(page => {
      const pbId = page.properties['Productboard ID']?.rich_text?.[0]?.plain_text;
      if (pbId) {
        idMap.releases.set(pbId, page.id);
      }
    });
    
    hasMore = data.has_more;
    startCursor = data.next_cursor;
    await sleep(350);
  }
  
  log(`   ✅ Found ${idMap.releases.size} existing releases`);
  
  // Query features using direct API call
  hasMore = true;
  startCursor = undefined;
  
  while (hasMore) {
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_FEATURES_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start_cursor: startCursor,
        page_size: 100
      })
    });
    
    if (!response.ok) {
      const error = `Failed to query features database: ${response.status} ${response.statusText}`;
      log(error, 'error');
      throw new Error(error);
    }
    
    const data = await response.json();
    
    data.results.forEach(page => {
      const pbId = page.properties['Feature ID']?.rich_text?.[0]?.plain_text;
      if (pbId) {
        idMap.features.set(pbId, page.id);
      }
    });
    
    hasMore = data.has_more;
    startCursor = data.next_cursor;
    await sleep(350);
  }
  
  log(`   ✅ Found ${idMap.features.size} existing features`);
  
  return idMap;
}

// Get current Notion page data for comparison
async function getNotionPageData(notion, pageId, type) {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    const props = page.properties;
    
    if (type === 'release') {
      return {
        name: props['Name']?.title?.[0]?.plain_text || '',
        startDate: props['Start Date']?.date?.start || null,
        endDate: props['End Date']?.date?.start || null,
        state: props['State']?.select?.name || null,
        releaseGroup: props['Release Group']?.rich_text?.[0]?.plain_text || null,
        productManager: props['Product Manager']?.rich_text?.[0]?.plain_text || null,
        engineeringLead: props['Engineering Lead']?.rich_text?.[0]?.plain_text || null
      };
    } else {
      return {
        name: props['Name']?.title?.[0]?.plain_text || '',
        status: props['Status']?.select?.name || null,
        health: props['Health Status']?.select?.name || null,
        productManager: props['Product Manager']?.rich_text?.[0]?.plain_text || null,
        engineeringLead: props['Engineering Lead']?.rich_text?.[0]?.plain_text || null,
        productboardLink: props['Productboard Link']?.url || null,
        releaseId: props['Release']?.relation?.[0]?.id || null
      };
    }
  } catch (error) {
    console.error(`   ⚠️  Failed to retrieve page ${pageId}: ${error.message}`);
    return null;
  }
}

// Compare two objects and return changed properties
function detectChanges(oldData, newData) {
  const changes = {};
  
  for (const [key, newValue] of Object.entries(newData)) {
    const oldValue = oldData[key];
    
    // Normalize null/undefined
    const normalizedOld = oldValue === null || oldValue === undefined ? null : String(oldValue);
    const normalizedNew = newValue === null || newValue === undefined ? null : String(newValue);
    
    if (normalizedOld !== normalizedNew) {
      changes[key] = { old: oldValue, new: newValue };
    }
  }
  
  return Object.keys(changes).length > 0 ? changes : null;
}

// Map release to Notion properties format
function mapReleaseToNotion(release) {
  return {
    'Name': {
      title: [{ text: { content: release.name } }]
    },
    'Productboard ID': {
      rich_text: [{ text: { content: release.id } }]
    },
    'Start Date': release.startDate ? {
      date: { start: release.startDate }
    } : undefined,
    'End Date': release.endDate ? {
      date: { start: release.endDate }
    } : undefined,
    'State': release.state ? {
      select: { name: release.state }
    } : undefined,
    'Release Group': release.releaseGroup ? {
      rich_text: [{ text: { content: release.releaseGroup } }]
    } : undefined,
    'Product Manager': release.productManager ? {
      rich_text: [{ text: { content: release.productManager } }]
    } : undefined,
    'Engineering Lead': release.engineeringLead ? {
      rich_text: [{ text: { content: release.engineeringLead } }]
    } : undefined
  };
}

// Map feature to Notion properties format
function mapFeatureToNotion(feature, releasePageId) {
  return {
    'Name': {
      title: [{ text: { content: feature.name } }]
    },
    'Feature ID': {
      rich_text: [{ text: { content: feature.id } }]
    },
    'Status': feature.status ? {
      select: { name: feature.status }
    } : undefined,
    'Health Status': feature.health ? {
      select: { name: feature.health }
    } : undefined,
    'Product Manager': feature.productManager ? {
      rich_text: [{ text: { content: feature.productManager } }]
    } : undefined,
    'Engineering Lead': feature.engineeringLead ? {
      rich_text: [{ text: { content: feature.engineeringLead } }]
    } : undefined,
    'Release': releasePageId ? {
      relation: [{ id: releasePageId }]
    } : undefined,
    'Productboard Link': feature.productboardLink ? {
      url: feature.productboardLink
    } : undefined
  };
}

function removeUndefinedProperties(obj) {
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

async function main() {
  const startTime = Date.now();
  log('🚀 Starting Incremental Sync');
  log('='.repeat(50));
  
  // Validate environment
  if (!NOTION_API_KEY || !NOTION_RELEASES_DB_ID || !NOTION_FEATURES_DB_ID || !PRODUCTBOARD_API_TOKEN) {
    const error = 'Missing required environment variables in .env.personal';
    log(error, 'error');
    throw new Error(error);
  }
  
  const notion = new Client({ auth: NOTION_API_KEY });
  
  // Step 1: Build ID mapping from existing Notion pages
  const idMap = await buildIdMapping(notion);
  
  // Step 2: Fetch fresh ProductBoard data
  log('\n📦 Fetching ProductBoard data...');
  const releases = await fetchAllReleases();
  log(`✅ Found ${releases.length} releases in ProductBoard`);
  
  // Fetch feature assignments
  log('\n🔗 Fetching feature assignments...');
  const releaseFeatureMap = new Map();
  
  for (let i = 0; i < releases.length; i++) {
    const release = releases[i];
    process.stdout.write(`   Processing release ${i + 1}/${releases.length}... `);
    const featureIds = await fetchFeatureAssignments(release.id);
    releaseFeatureMap.set(release.id, featureIds);
    console.log(`✅ ${featureIds.length} features`);
    await sleep(50);
  }
  
  // Collect all unique feature IDs
  const allFeatureIds = new Set();
  releaseFeatureMap.forEach(featureIds => {
    featureIds.forEach(id => allFeatureIds.add(id));
  });
  
  log(`\n📊 Found ${allFeatureIds.size} unique features`);
  
  // Fetch feature details
  log('\n🎯 Fetching feature details...');
  const features = [];
  const featureIdsArray = Array.from(allFeatureIds);
  
  for (let i = 0; i < featureIdsArray.length; i++) {
    const featureId = featureIdsArray[i];
    process.stdout.write(`   Processing feature ${i + 1}/${featureIdsArray.length}... `);
    
    const feature = await fetchFeatureDetails(featureId);
    if (feature) {
      const releaseIds = [];
      releaseFeatureMap.forEach((featureIds, releaseId) => {
        if (featureIds.includes(featureId)) {
          releaseIds.push(releaseId);
        }
      });
      feature.releaseId = releaseIds[0] || null;
      features.push(feature);
      console.log('✅');
    } else {
      console.log('⚠️  Skipped');
    }
    await sleep(50);
  }
  
  // Step 3: Sync releases
  log('\n' + '='.repeat(50));
  log('\n📦 Syncing Releases...\n');
  
  const stats = {
    releases: { created: 0, updated: 0, unchanged: 0 },
    features: { created: 0, updated: 0, unchanged: 0 }
  };
  
  const releasePageMap = new Map(); // releaseId → Notion page ID
  
  for (let i = 0; i < releases.length; i++) {
    const release = releases[i];
    const notionPageId = idMap.releases.get(release.id);
    
    if (notionPageId) {
      // Existing release - check for changes
      process.stdout.write(`   Checking release ${i + 1}/${releases.length}: ${release.name}... `);
      
      const notionData = await getNotionPageData(notion, notionPageId, 'release');
      await sleep(350);
      
      if (notionData) {
        const pbData = {
          name: release.name,
          startDate: release.startDate,
          endDate: release.endDate,
          state: release.state,
          releaseGroup: release.releaseGroup,
          productManager: release.productManager,
          engineeringLead: release.engineeringLead
        };
        
        const changes = detectChanges(notionData, pbData);
        
        if (changes) {
          // Update release
          const properties = mapReleaseToNotion(release);
          try {
            await notion.pages.update({
              page_id: notionPageId,
              properties: removeUndefinedProperties(properties)
            });
            stats.releases.updated++;
            console.log(`✅ Updated (${Object.keys(changes).length} changes)`);
          } catch (error) {
            console.log(`❌ Error: ${error.message}`);
          }
        } else {
          stats.releases.unchanged++;
          console.log('✅ Unchanged');
        }
      } else {
        stats.releases.unchanged++;
        console.log('⚠️  Could not retrieve data');
      }
      
      releasePageMap.set(release.id, notionPageId);
    } else {
      // New release - create it
      process.stdout.write(`   Creating release ${i + 1}/${releases.length}: ${release.name}... `);
      
      const properties = mapReleaseToNotion(release);
      try {
        const page = await notion.pages.create({
          parent: { database_id: NOTION_RELEASES_DB_ID },
          properties: removeUndefinedProperties(properties)
        });
        releasePageMap.set(release.id, page.id);
        idMap.releases.set(release.id, page.id);
        stats.releases.created++;
        console.log('✅ Created');
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    await sleep(350);
  }
  
  // Step 4: Sync features
  log('\n🎯 Syncing Features...\n');
  
  const featurePageMap = new Map(); // featureId → Notion page ID
  
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const notionPageId = idMap.features.get(feature.id);
    const releasePageId = feature.releaseId ? releasePageMap.get(feature.releaseId) : null;
    
    if (notionPageId) {
      // Existing feature - check for changes
      process.stdout.write(`   Checking feature ${i + 1}/${features.length}: ${feature.name}... `);
      
      const notionData = await getNotionPageData(notion, notionPageId, 'feature');
      await sleep(350);
      
      if (notionData) {
        const pbData = {
          name: feature.name,
          status: feature.status,
          health: feature.health,
          productManager: feature.productManager,
          engineeringLead: feature.engineeringLead,
          productboardLink: feature.productboardLink,
          releaseId: releasePageId
        };
        
        // Compare release ID separately (it's a relation, not a string)
        const releaseChanged = notionData.releaseId !== releasePageId;
        
        const changes = detectChanges({
          ...notionData,
          releaseId: notionData.releaseId // Convert to string for comparison
        }, {
          ...pbData,
          releaseId: releasePageId // Convert to string for comparison
        });
        
        if (changes || releaseChanged) {
          // Update feature
          const properties = mapFeatureToNotion(feature, releasePageId);
          try {
            await notion.pages.update({
              page_id: notionPageId,
              properties: removeUndefinedProperties(properties)
            });
            stats.features.updated++;
            const changeCount = changes ? Object.keys(changes).length : 0;
            console.log(`✅ Updated (${changeCount + (releaseChanged ? 1 : 0)} changes)`);
          } catch (error) {
            console.log(`❌ Error: ${error.message}`);
          }
        } else {
          stats.features.unchanged++;
          console.log('✅ Unchanged');
        }
      } else {
        stats.features.unchanged++;
        console.log('⚠️  Could not retrieve data');
      }
      
      featurePageMap.set(feature.id, notionPageId);
    } else {
      // New feature - create it
      process.stdout.write(`   Creating feature ${i + 1}/${features.length}: ${feature.name}... `);
      
      const properties = mapFeatureToNotion(feature, releasePageId);
      try {
        const page = await notion.pages.create({
          parent: { database_id: NOTION_FEATURES_DB_ID },
          properties: removeUndefinedProperties(properties)
        });
        featurePageMap.set(feature.id, page.id);
        idMap.features.set(feature.id, page.id);
        stats.features.created++;
        
        const release = releasePageId ? releases.find(r => r.id === feature.releaseId) : null;
        if (release) {
          console.log(`✅ Created (linked to ${release.name})`);
        } else {
          console.log('✅ Created');
        }
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    await sleep(350);
  }
  
  // Step 5: Update release relations (two-way)
  log('\n🔗 Updating Release Relations...\n');
  
  const featuresByRelease = new Map();
  releases.forEach(release => {
    const featureIds = releaseFeatureMap.get(release.id) || [];
    const releaseFeatures = features.filter(f => featureIds.includes(f.id));
    featuresByRelease.set(release.id, releaseFeatures);
  });
  
  for (let i = 0; i < releases.length; i++) {
    const release = releases[i];
    const releasePageId = releasePageMap.get(release.id);
    if (!releasePageId) continue;
    
    const releaseFeatures = featuresByRelease.get(release.id) || [];
    const featurePageIds = releaseFeatures
      .map(f => featurePageMap.get(f.id))
      .filter(Boolean);
    
    if (featurePageIds.length > 0) {
      process.stdout.write(`   Updating ${release.name} with ${featurePageIds.length} features... `);
      
      try {
        await notion.pages.update({
          page_id: releasePageId,
          properties: {
            'Features': {
              relation: featurePageIds.map(id => ({ id }))
            }
          }
        });
        console.log('✅');
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
      
      await sleep(350);
    }
  }
  
  // Final summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  log('\n' + '='.repeat(50));
  log('\n📊 Sync Summary:');
  log('Releases:');
  log(`  ✅ Created: ${stats.releases.created}`);
  log(`  ✅ Updated: ${stats.releases.updated}`);
  log(`  ✅ Unchanged: ${stats.releases.unchanged}`);
  log('\nFeatures:');
  log(`  ✅ Created: ${stats.features.created}`);
  log(`  ✅ Updated: ${stats.features.updated}`);
  log(`  ✅ Unchanged: ${stats.features.unchanged}`);
  log(`\n⏱️  Duration: ${duration}s`);
  log('\n🎉 Sync Complete!');
}

main().catch(error => {
  const errorMsg = `\n💥 Fatal error: ${error.message}`;
  log(errorMsg, 'error');
  log(error.stack || '', 'error');
  process.exit(1);
});

