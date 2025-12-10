// migrate-to-notion.js
// Phase 3/4: Migrates ProductBoard data to Notion (with dry-run support)

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@notionhq/client';

dotenv.config({ path: '.env.personal' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_RELEASES_DB_ID = process.env.NOTION_RELEASES_DB_ID;
const NOTION_FEATURES_DB_ID = process.env.NOTION_FEATURES_DB_ID;

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isSummary = args.includes('--summary');
const isTestOne = args.includes('--test-one');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProductBoardData() {
  const dataPath = path.join(__dirname, '..', 'data', 'productboard-export.json');
  
  if (!fs.existsSync(dataPath)) {
    throw new Error(`ProductBoard data not found at ${dataPath}. Run scripts/fetch-productboard.js first.`);
  }
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return data;
}

function mapReleaseToNotion(release, releaseFeatureMap) {
  // Map ProductBoard release to Notion properties format
  const featureIds = releaseFeatureMap[release.id] || [];
  
  return {
    parent: { database_id: NOTION_RELEASES_DB_ID },
    properties: {
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
      } : undefined,
      // Features relation will be set after features are created
      'Features': {
        relation: [] // Will be populated after features are created
      }
    }
  };
}

function mapFeatureToNotion(feature, releasePageId) {
  // Map ProductBoard feature to Notion properties format
  return {
    parent: { database_id: NOTION_FEATURES_DB_ID },
    properties: {
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
    }
  };
}

function removeUndefinedProperties(obj) {
  // Remove undefined properties from object
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function formatReleaseName(release) {
  // Format release name for display
  const dateStr = release.startDate ? ` (${new Date(release.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : '';
  return `${release.name}${dateStr}`;
}

function displayDryRun(releases, features, releaseFeatureMap) {
  // Group features by release for display
  const featuresByRelease = new Map();
  releases.forEach(release => {
    const featureIds = releaseFeatureMap[release.id] || [];
    const releaseFeatures = features.filter(f => featureIds.includes(f.id));
    featuresByRelease.set(release.id, releaseFeatures);
  });
  
  // Display releases
  console.log(`Releases to Create: ${releases.length}`);
  releases.forEach((release, index) => {
    const releaseFeatures = featuresByRelease.get(release.id) || [];
    const startDate = release.startDate || 'N/A';
    const endDate = release.endDate || 'N/A';
    const prefix = index === releases.length - 1 ? '└' : '├';
    console.log(`${prefix}─ ${formatReleaseName(release)} → Start: ${startDate}, End: ${endDate} (${releaseFeatures.length} features)`);
  });
  
  // Display features (limit display if not summary mode)
  console.log(`\nFeatures to Create: ${features.length}`);
  const displayLimit = isSummary ? Math.min(10, features.length) : features.length;
  
  features.slice(0, displayLimit).forEach((feature, index) => {
    const releaseName = feature.releaseName || 'No Release';
    const health = feature.health || 'unknown';
    const prefix = index === displayLimit - 1 && displayLimit < features.length ? '└' : '├';
    console.log(`${prefix}─ ${feature.name} → Release: ${releaseName}, Health: ${health}`);
  });
  
  if (displayLimit < features.length) {
    console.log(`└─ ... and ${features.length - displayLimit} more features`);
  }
  
  // Display relations
  const relationsCount = features.filter(f => f.releaseId).length;
  console.log(`\nRelations to Create: ${relationsCount}`);
  console.log('Feature → Release links');
}

function displaySummary(releases, features) {
  // Count health statuses
  const healthCounts = {
    'on-track': 0,
    'needs-attention': 0,
    'at-risk': 0,
    'off-track': 0,
    'unknown': 0
  };
  
  features.forEach(feature => {
    const health = feature.health || 'unknown';
    healthCounts[health] = (healthCounts[health] || 0) + 1;
  });
  
  // Count features by release
  const featuresByRelease = releases.map(r => r.featureCount || 0);
  const releasesWithFeatures = featuresByRelease.filter(count => count > 0).length;
  const featuresWithReleases = features.filter(f => f.releaseId).length;
  const featuresWithoutReleases = features.length - featuresWithReleases;
  
  console.log('\nSummary:');
  console.log(`- Releases: ${releases.length}`);
  console.log(`  - Releases with features: ${releasesWithFeatures}`);
  console.log(`- Features: ${features.length}`);
  console.log(`  - Features linked to releases: ${featuresWithReleases}`);
  if (featuresWithoutReleases > 0) {
    console.log(`  - Features without releases: ${featuresWithoutReleases}`);
  }
  console.log('- Health breakdown:');
  Object.entries(healthCounts).forEach(([status, count]) => {
    if (count > 0) {
      const percentage = ((count / features.length) * 100).toFixed(1);
      console.log(`  - ${status}: ${count} (${percentage}%)`);
    }
  });
}

async function main() {
  try {
    // Load ProductBoard data
    const pbData = loadProductBoardData();
    const { releases, features, releaseFeatureMap } = pbData;
    
    if (!releases || releases.length === 0) {
      throw new Error('No releases found in ProductBoard data');
    }
    
    if (!features || features.length === 0) {
      throw new Error('No features found in ProductBoard data');
    }
    
    // Dry-run mode: just display what would be created (no Notion API needed)
    if (isDryRun) {
      console.log('🚀 Starting Dry Run Migration\n');
      console.log('='.repeat(50));
      console.log('📊 Dry Run - No Changes Will Be Made\n');
      
      // Parse and transform data to Notion format (for display purposes)
      const transformedReleases = releases.map(release => {
        const featureIds = releaseFeatureMap[release.id] || [];
        return {
          ...release,
          featureCount: featureIds.length
        };
      });
      
      const transformedFeatures = features.map(feature => {
        const release = releases.find(r => r.id === feature.releaseId);
        return {
          ...feature,
          releaseName: release ? release.name : null
        };
      });
      
      // Display what would be created
      displayDryRun(transformedReleases, transformedFeatures, releaseFeatureMap);
      
      // Display summary statistics
      if (isSummary) {
        displaySummary(transformedReleases, transformedFeatures);
      } else {
        // Always show basic summary
        console.log('\n' + '='.repeat(50));
        console.log('\n📊 Summary Statistics:');
        displaySummary(transformedReleases, transformedFeatures);
      }
      
      console.log('\n' + '='.repeat(50));
      console.log('\n✅ Dry run complete - no changes made');
      console.log('\n💡 Next steps:');
      console.log('   - Review the data above');
      console.log('   - Run with --summary for detailed breakdown');
      console.log('   - To perform actual migration, run:');
      console.log('     node scripts/migrate-to-notion.js');
      return;
    }
    
    // Validate environment variables (only needed for actual migration)
    if (!NOTION_API_KEY) {
      throw new Error('NOTION_API_KEY not found in .env.personal');
    }
    
    if (!NOTION_RELEASES_DB_ID) {
      throw new Error('NOTION_RELEASES_DB_ID not found in .env.personal');
    }
    
    if (!NOTION_FEATURES_DB_ID) {
      throw new Error('NOTION_FEATURES_DB_ID not found in .env.personal');
    }
    
    // Test-one mode: create only the first release and its features
    if (isTestOne) {
      console.log('🧪 Test Mode: Creating ONE release and its features\n');
      console.log('='.repeat(50));
      
      const testRelease = releases[0];
      const testFeatureIds = releaseFeatureMap[testRelease.id] || [];
      const testFeatures = features.filter(f => testFeatureIds.includes(f.id));
      
      console.log(`Test Release: ${formatReleaseName(testRelease)}`);
      console.log(`Test Features: ${testFeatures.length}`);
      
      // Initialize Notion client
      const notion = new Client({ auth: NOTION_API_KEY });
      
      // Create release
      console.log(`\n📦 Creating release: ${testRelease.name}...`);
      const releaseProps = mapReleaseToNotion(testRelease, releaseFeatureMap);
      releaseProps.properties = removeUndefinedProperties(releaseProps.properties);
      
      let releasePage;
      try {
        releasePage = await notion.pages.create(releaseProps);
        console.log(`✅ Release created: ${releasePage.id}`);
        
        await sleep(350);
      } catch (error) {
        if (error.code === 'object_not_found') {
          console.error(`\n❌ Database not found or not shared with integration`);
          console.error(`   Database ID: ${NOTION_RELEASES_DB_ID}`);
          console.error(`\n💡 To fix:`);
          console.error(`   1. Run: node scripts/verify-setup.js`);
          console.error(`   2. Or manually:`);
          console.error(`      - Open the database in Notion`);
          console.error(`      - Click "..." menu → "Add connections"`);
          console.error(`      - Select your integration`);
        }
        throw error;
      }
      
      // Create features
      console.log(`\n🎯 Creating ${testFeatures.length} features...`);
      for (let i = 0; i < testFeatures.length; i++) {
        const feature = testFeatures[i];
        process.stdout.write(`   Creating feature ${i + 1}/${testFeatures.length}: ${feature.name}... `);
        
        const featureProps = mapFeatureToNotion(feature, releasePage.id);
        featureProps.properties = removeUndefinedProperties(featureProps.properties);
        
        try {
          const featurePage = await notion.pages.create(featureProps);
          console.log('✅');
          
          // Update release to include this feature in relation
          await notion.pages.update({
            page_id: releasePage.id,
            properties: {
              'Features': {
                relation: [{ id: featurePage.id }]
              }
            }
          });
        } catch (error) {
          console.log(`❌ Error: ${error.message}`);
        }
        
        await sleep(350);
      }
      
      console.log('\n✅ Test migration complete!');
      console.log('\n💡 Check Notion to verify the test data looks correct');
      console.log('   Then run full migration: node scripts/migrate-to-notion.js');
      return;
    }
    
    // Full migration mode
    console.log('🚀 Starting Migration...\n');
    console.log('='.repeat(50));
    
    if (!isDryRun) {
      console.log('⚠️  WARNING: This will create pages in Notion!');
      console.log('   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
      await sleep(3000);
    }
    
    // Initialize Notion client
    const notion = new Client({ auth: NOTION_API_KEY });
    
    // Phase 1: Create releases
    console.log('\nPhase 1/3: Creating Releases');
    const releasePageMap = new Map(); // releaseId → Notion page ID
    
    for (let i = 0; i < releases.length; i++) {
      const release = releases[i];
      process.stdout.write(`   Creating release ${i + 1}/${releases.length}: ${release.name}... `);
      
      const releaseProps = mapReleaseToNotion(release, releaseFeatureMap);
      releaseProps.properties = removeUndefinedProperties(releaseProps.properties);
      
      try {
        const releasePage = await notion.pages.create(releaseProps);
        releasePageMap.set(release.id, releasePage.id);
        console.log('✅');
      } catch (error) {
        if (error.code === 'object_not_found' && i === 0) {
          console.log(`\n❌ Database not found or not shared with integration`);
          console.log(`   Database ID: ${NOTION_RELEASES_DB_ID}`);
          console.log(`\n💡 Run: node scripts/verify-setup.js to diagnose`);
          throw error;
        }
        console.log(`❌ Error: ${error.message}`);
      }
      
      await sleep(350);
    }
    
    // Phase 2: Create features and link to releases
    console.log('\nPhase 2/3: Creating Features');
    const featurePageMap = new Map(); // featureId → Notion page ID
    
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const releasePageId = feature.releaseId ? releasePageMap.get(feature.releaseId) : null;
      
      process.stdout.write(`   Creating feature ${i + 1}/${features.length}: ${feature.name}... `);
      
      const featureProps = mapFeatureToNotion(feature, releasePageId);
      featureProps.properties = removeUndefinedProperties(featureProps.properties);
      
      try {
        const featurePage = await notion.pages.create(featureProps);
        featurePageMap.set(feature.id, featurePage.id);
        
        const release = releasePageId ? releases.find(r => r.id === feature.releaseId) : null;
        if (release) {
          console.log(`✅ (linked to ${release.name})`);
        } else {
          console.log('✅');
        }
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
      
      await sleep(350);
    }
    
    // Phase 3: Update release relations (two-way relations)
    console.log('\nPhase 3/3: Updating Release Relations');
    
    // Group features by release
    const featuresByRelease = new Map();
    releases.forEach(release => {
      const featureIds = releaseFeatureMap[release.id] || [];
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
    
    console.log('\n' + '='.repeat(50));
    console.log('\n🎉 Migration Complete!');
    console.log(`✅ ${releases.length} releases created`);
    console.log(`✅ ${features.length} features created`);
    console.log(`✅ Relations established`);
    
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

