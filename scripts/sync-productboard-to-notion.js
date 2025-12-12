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

// Setup data directory
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const logFile = path.join(logsDir, 'sync.log');
const notionPayloadLogFile = path.join(logsDir, `notion-payloads-${Date.now()}.json`);

// Array to store all Notion API payloads
const notionPayloads = [];

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

function logNotionPayload(operation, type, payload, pageId = null, result = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    operation: operation, // 'create' or 'update'
    type: type, // 'release' or 'feature'
    pageId: pageId,
    payload: JSON.parse(JSON.stringify(payload)), // Deep clone to avoid reference issues
    result: result ? {
      id: result.id,
      url: result.url,
      created_time: result.created_time,
      last_edited_time: result.last_edited_time
    } : null
  };
  
  notionPayloads.push(entry);
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
    
    // Extract Product Manager from owner field (ProductBoard API structure)
    // ProductBoard returns: { "owner": { "email": "test@coder.com" } }
    const productManager = feature.owner?.email || 
                          feature.productManager?.name || 
                          feature.productManager?.displayName ||
                          feature.productManager?.email ||
                          (typeof feature.productManager === 'string' ? feature.productManager : null) ||
                          null;
    
    // Extract Engineering Lead (may still be in engineeringLead field)
    const engineeringLead = feature.engineeringLead?.name || 
                           feature.engineeringLead?.displayName ||
                           feature.engineeringLead?.email ||
                           (typeof feature.engineeringLead === 'string' ? feature.engineeringLead : null) ||
                           null;
    
    // Debug logging for first few features to verify API structure
    if (Math.random() < 0.05) { // Log ~5% of features for debugging
      log(`   Debug feature ${featureId}: PM=${productManager}, EL=${engineeringLead}`, 'info');
      log(`   Raw owner: ${JSON.stringify(feature.owner)}`, 'info');
      log(`   Raw productManager: ${JSON.stringify(feature.productManager)}`, 'info');
      log(`   Raw engineeringLead: ${JSON.stringify(feature.engineeringLead)}`, 'info');
    }
    
    return {
      id: feature.id,
      name: feature.name,
      status: feature.status?.name || null,
      health: normalizeHealth(health),
      productManager: productManager,
      engineeringLead: engineeringLead,
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
        state: props['State']?.select?.name || null,
        releaseGroup: props['Release Group']?.rich_text?.[0]?.plain_text || null
      };
    } else {
      return {
        name: props['Name']?.title?.[0]?.plain_text || '',
        status: props['Status']?.select?.name || null,
        health: props['Health Status']?.select?.name || null,
        productManager: props['Product Manager']?.rich_text?.[0]?.plain_text || null,
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
    'State': release.state ? {
      select: { name: release.state }
    } : undefined,
    'Release Group': release.releaseGroup ? {
      rich_text: [{ text: { content: release.releaseGroup } }]
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
    // Always include Product Manager, even if null (to clear existing values)
    'Product Manager': {
      rich_text: feature.productManager ? [{ text: { content: feature.productManager } }] : []
    },
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
      feature.releaseIds = releaseIds; // Keep all release IDs for reference
      features.push(feature);
      console.log('✅');
    } else {
      console.log('⚠️  Skipped');
    }
    await sleep(50);
  }
  
  // Save all ProductBoard feature data to JSON file
  const productboardFeaturesFile = path.join(dataDir, `productboard-features-${Date.now()}.json`);
  const featuresExport = {
    fetchedAt: new Date().toISOString(),
    summary: {
      totalFeatures: features.length,
      featuresWithProductManager: features.filter(f => f.productManager).length,
      featuresWithEngineeringLead: features.filter(f => f.engineeringLead).length,
      featuresWithHealth: features.filter(f => f.health && f.health !== 'unknown').length,
      featuresWithStatus: features.filter(f => f.status).length,
      featuresWithRelease: features.filter(f => f.releaseId).length
    },
    releases: releases.map(r => ({
      id: r.id,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      state: r.state,
      productManager: r.productManager,
      engineeringLead: r.engineeringLead
    })),
    features: features,
    releaseFeatureMap: Object.fromEntries(releaseFeatureMap)
  };
  
  fs.writeFileSync(productboardFeaturesFile, JSON.stringify(featuresExport, null, 2), 'utf8');
  log(`\n💾 ProductBoard feature data saved to: ${productboardFeaturesFile}`);
  log(`   Total features: ${features.length}`);
  log(`   Features with Product Manager: ${featuresExport.summary.featuresWithProductManager}`);
  log(`   Features with Engineering Lead: ${featuresExport.summary.featuresWithEngineeringLead}`);
  
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
          state: release.state,
          releaseGroup: release.releaseGroup
        };
        
        const changes = detectChanges(notionData, pbData);
        
        if (changes) {
          // Update release
          const properties = mapReleaseToNotion(release);
          const cleanedProperties = removeUndefinedProperties(properties);
          const updatePayload = {
            page_id: notionPageId,
            properties: cleanedProperties
          };
          
          // Log the payload before sending
          logNotionPayload('update', 'release', updatePayload, notionPageId);
          
          try {
            const result = await notion.pages.update(updatePayload);
            logNotionPayload('update', 'release', updatePayload, notionPageId, result);
            stats.releases.updated++;
            console.log(`✅ Updated (${Object.keys(changes).length} changes)`);
          } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            log(`Failed to update release ${release.name}: ${error.message}`, 'error');
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
      const cleanedProperties = removeUndefinedProperties(properties);
      const createPayload = {
        parent: { database_id: NOTION_RELEASES_DB_ID },
        properties: cleanedProperties
      };
      
      // Log the payload before sending
      logNotionPayload('create', 'release', createPayload);
      
      try {
        const page = await notion.pages.create(createPayload);
        logNotionPayload('create', 'release', createPayload, page.id, page);
        releasePageMap.set(release.id, page.id);
        idMap.releases.set(release.id, page.id);
        stats.releases.created++;
        console.log('✅ Created');
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        log(`Failed to create release ${release.name}: ${error.message}`, 'error');
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
          const cleanedProperties = removeUndefinedProperties(properties);
          const updatePayload = {
            page_id: notionPageId,
            properties: cleanedProperties
          };
          
          // Log the payload before sending
          logNotionPayload('update', 'feature', updatePayload, notionPageId);
          
          try {
            const result = await notion.pages.update(updatePayload);
            logNotionPayload('update', 'feature', updatePayload, notionPageId, result);
            stats.features.updated++;
            const changeCount = changes ? Object.keys(changes).length : 0;
            console.log(`✅ Updated (${changeCount + (releaseChanged ? 1 : 0)} changes)`);
          } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            log(`Failed to update feature ${feature.name}: ${error.message}`, 'error');
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
      const cleanedProperties = removeUndefinedProperties(properties);
      const createPayload = {
        parent: { database_id: NOTION_FEATURES_DB_ID },
        properties: cleanedProperties
      };
      
      // Log the payload before sending
      logNotionPayload('create', 'feature', createPayload);
      
      try {
        const page = await notion.pages.create(createPayload);
        logNotionPayload('create', 'feature', createPayload, page.id, page);
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
        log(`Failed to create feature ${feature.name}: ${error.message}`, 'error');
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
      
      const relationPayload = {
        page_id: releasePageId,
        properties: {
          'Features': {
            relation: featurePageIds.map(id => ({ id }))
          }
        }
      };
      
      // Log the payload before sending
      logNotionPayload('update', 'release-relations', relationPayload, releasePageId);
      
      try {
        const result = await notion.pages.update(relationPayload);
        logNotionPayload('update', 'release-relations', relationPayload, releasePageId, result);
        console.log('✅');
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        log(`Failed to update release relations for ${release.name}: ${error.message}`, 'error');
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
  
  // Write Notion payloads to JSON file
  const payloadLogData = {
    syncStartTime: new Date(startTime).toISOString(),
    syncEndTime: new Date().toISOString(),
    duration: `${duration}s`,
    summary: {
      releases: stats.releases,
      features: stats.features,
      totalOperations: notionPayloads.length
    },
    operations: notionPayloads
  };
  
  fs.writeFileSync(notionPayloadLogFile, JSON.stringify(payloadLogData, null, 2), 'utf8');
  log(`\n📝 Notion API payloads logged to: ${notionPayloadLogFile}`);
  log(`   Total operations logged: ${notionPayloads.length}`);
  log('\n🎉 Sync Complete!');
}

main().catch(error => {
  const errorMsg = `\n💥 Fatal error: ${error.message}`;
  log(errorMsg, 'error');
  log(error.stack || '', 'error');
  process.exit(1);
});

