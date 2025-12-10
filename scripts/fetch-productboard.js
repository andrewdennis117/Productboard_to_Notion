// fetch-productboard.js
// Phase 2: Fetches all releases and features from ProductBoard API

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.personal' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCTBOARD_API_TOKEN = process.env.PRODUCTBOARD_API_TOKEN;
const PRODUCTBOARD_API_BASE = 'https://api.productboard.com';

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeHealth(health) {
  // Normalize health status: lowercase, null → "unknown"
  if (!health) {
    return 'unknown';
  }
  return String(health).toLowerCase();
}

function formatDate(dateString) {
  // ProductBoard: "2025-05-05T00:00:00Z" → "2025-05-05"
  if (!dateString) return null;
  return dateString.split('T')[0];
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
  console.log('📦 Step 1/3: Fetching all releases...');
  
  try {
    const response = await fetchProductBoardAPI('/releases');
    const releases = response.data || [];
    
    console.log(`✅ Found ${releases.length} releases`);
    
    // Transform releases to include only needed fields
    const transformedReleases = releases.map(release => ({
      id: release.id,
      name: release.name,
      startDate: formatDate(release.startDate),
      endDate: formatDate(release.endDate),
      state: release.state,
      releaseGroup: release.releaseGroup?.id || null,
      productManager: release.productManager?.name || null,
      engineeringLead: release.engineeringLead?.name || null,
      // Keep raw data for reference
      raw: {
        startDate: release.startDate,
        endDate: release.endDate,
        state: release.state
      }
    }));
    
    return transformedReleases;
  } catch (error) {
    console.error(`❌ Failed to fetch releases: ${error.message}`);
    throw error;
  }
}

async function fetchFeatureAssignments(releaseId) {
  try {
    const response = await fetchProductBoardAPI(`/feature-release-assignments?release.id=${releaseId}`);
    const assignments = response.data || [];
    
    // Extract feature IDs from assignments
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
    
    if (!feature) {
      return null;
    }
    
    // Extract health status from lastHealthUpdate
    const health = feature.lastHealthUpdate?.status || null;
    
    // Transform feature to include only needed fields
    return {
      id: feature.id,
      name: feature.name,
      status: feature.status?.name || null,
      health: normalizeHealth(health),
      productManager: feature.productManager?.name || null,
      engineeringLead: feature.engineeringLead?.name || null,
      productboardLink: feature.links?.html || null,
      // Keep raw data for reference
      raw: {
        status: feature.status,
        lastHealthUpdate: feature.lastHealthUpdate,
        health: health
      }
    };
  } catch (error) {
    console.error(`   ⚠️  Failed to fetch feature ${featureId}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Fetching ProductBoard Data\n');
  console.log('='.repeat(50));
  
  if (!PRODUCTBOARD_API_TOKEN) {
    console.error('❌ PRODUCTBOARD_API_TOKEN not found in .env.personal');
    process.exit(1);
  }

  try {
    // Step 1: Fetch all releases
    const releases = await fetchAllReleases();
    
    if (releases.length === 0) {
      console.error('❌ No releases found');
      process.exit(1);
    }

    // Step 2: Fetch feature assignments for each release
    console.log('\n🔗 Step 2/3: Fetching feature assignments...');
    const releaseFeatureMap = new Map(); // releaseId → [featureIds]
    
    for (let i = 0; i < releases.length; i++) {
      const release = releases[i];
      process.stdout.write(`   Processing release ${i + 1}/${releases.length}: ${release.name}... `);
      
      const featureIds = await fetchFeatureAssignments(release.id);
      releaseFeatureMap.set(release.id, featureIds);
      
      console.log(`✅ ${featureIds.length} features`);
      
      // Small delay to be respectful to API
      await sleep(50);
    }

    // Collect all unique feature IDs
    const allFeatureIds = new Set();
    releaseFeatureMap.forEach(featureIds => {
      featureIds.forEach(id => allFeatureIds.add(id));
    });
    
    console.log(`\n📊 Found ${allFeatureIds.size} unique features across all releases`);

    // Step 3: Fetch full details for each feature
    console.log('\n🎯 Step 3/3: Fetching feature details...');
    const features = [];
    const featureIdsArray = Array.from(allFeatureIds);
    
    for (let i = 0; i < featureIdsArray.length; i++) {
      const featureId = featureIdsArray[i];
      process.stdout.write(`   Processing feature ${i + 1}/${featureIdsArray.length}... `);
      
      const feature = await fetchFeatureDetails(featureId);
      
      if (feature) {
        // Find which release(s) this feature belongs to
        const releaseIds = [];
        releaseFeatureMap.forEach((featureIds, releaseId) => {
          if (featureIds.includes(featureId)) {
            releaseIds.push(releaseId);
          }
        });
        
        // For now, use the first release (most features belong to one release)
        // In Phase 4, we'll handle multiple releases per feature if needed
        feature.releaseId = releaseIds[0] || null;
        feature.releaseIds = releaseIds; // Keep all for reference
        
        features.push(feature);
        console.log(`✅ ${feature.name}`);
      } else {
        console.log('⚠️  Skipped (not found)');
      }
      
      // Small delay to be respectful to API
      await sleep(50);
    }

    // Build final export structure
    const exportData = {
      fetchedAt: new Date().toISOString(),
      summary: {
        releases: releases.length,
        features: features.length,
        releasesWithFeatures: Array.from(releaseFeatureMap.values()).filter(ids => ids.length > 0).length
      },
      releases: releases,
      features: features,
      releaseFeatureMap: Object.fromEntries(releaseFeatureMap)
    };

    // Save to JSON file
    const outputPath = path.join(dataDir, 'productboard-export.json');
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Export Summary:');
    console.log(`   ✅ Releases: ${releases.length}`);
    console.log(`   ✅ Features: ${features.length}`);
    console.log(`   ✅ Saved to: ${outputPath}`);
    console.log('\n🎉 Fetch complete!');
    console.log('\n💡 Next steps:');
    console.log('   - Inspect data: cat data/productboard-export.json | jq');
    console.log('   - Validate: node scripts/validate-productboard-data.js');

  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

