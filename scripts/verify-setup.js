// verify-setup.js
// Verifies Notion database access and IDs

import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config({ path: '.env.personal' });

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_RELEASES_DB_ID = process.env.NOTION_RELEASES_DB_ID;
const NOTION_FEATURES_DB_ID = process.env.NOTION_FEATURES_DB_ID;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeDatabaseId(id) {
  // Remove dashes and convert to lowercase for comparison
  if (!id) return null;
  return id.replace(/-/g, '').toLowerCase();
}

function formatDatabaseId(id) {
  // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  if (!id) return null;
  const clean = id.replace(/-/g, '');
  if (clean.length !== 32) return id; // Invalid format
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
}

async function verifyDatabaseAccess(notion, databaseId, name) {
  // Try both with and without dashes
  const normalizedId = normalizeDatabaseId(databaseId);
  const formattedId = formatDatabaseId(databaseId);
  
  // Try formatted ID first (with dashes)
  let idToTry = formattedId;
  if (!formattedId || formattedId === databaseId) {
    idToTry = databaseId;
  }
  
  try {
    const database = await notion.databases.retrieve({ database_id: idToTry });
    
    console.log(`✅ ${name} Database:`);
    console.log(`   ID: ${database.id}`);
    console.log(`   Title: ${database.title[0]?.plain_text || 'Untitled'}`);
    console.log(`   URL: ${database.url}`);
    console.log(`   Properties: ${Object.keys(database.properties).length}`);
    
    await sleep(350);
    return { success: true, database };
  } catch (error) {
    // Try without dashes if first attempt failed
    if (error.code === 'object_not_found' && normalizedId && normalizedId !== idToTry.replace(/-/g, '')) {
      try {
        const database = await notion.databases.retrieve({ database_id: normalizedId });
        console.log(`✅ ${name} Database (found with normalized ID):`);
        console.log(`   ID: ${database.id}`);
        console.log(`   Title: ${database.title[0]?.plain_text || 'Untitled'}`);
        console.log(`   URL: ${database.url}`);
        await sleep(350);
        return { success: true, database };
      } catch (e) {
        // Fall through to error handling
      }
    }
    
    if (error.code === 'object_not_found') {
      console.error(`❌ ${name} Database:`);
      console.error(`   Database ID in .env.personal: ${databaseId}`);
      console.error(`   Error: Database not found or not shared with integration`);
      console.error(`\n💡 IMPORTANT: You need to share BOTH:`);
      console.error(`   1. The database itself`);
      console.error(`   2. The parent page containing the database`);
      console.error(`\n   Step-by-step fix:`);
      console.error(`   A. Share the parent page:`);
      console.error(`      - Go to the page that contains this database`);
      console.error(`      - Click "Share" (top right)`);
      console.error(`      - Add your integration "Test PB sync"`);
      console.error(`      - Give it "Edit" permissions`);
      console.error(`   B. Share the database:`);
      console.error(`      - Open the "${name}" database in Notion`);
      console.error(`      - Click the "..." menu (three dots) in the top right`);
      console.error(`      - Click "Add connections" or "Connections"`);
      console.error(`      - Find and select "Test PB sync" integration`);
      console.error(`      - Make sure it has "Edit" permissions`);
      console.error(`\n   After sharing, wait a few seconds and run this script again.`);
    } else {
      console.error(`❌ ${name} Database:`);
      console.error(`   Error: ${error.message}`);
    }
    return { success: false, error };
  }
}

async function listAccessibleDatabases(notion) {
  try {
    console.log('\n📋 Searching for accessible pages/databases...\n');
    
    // Search for pages (databases are returned as pages in search)
    const response = await notion.search({
      filter: {
        property: 'object',
        value: 'page'
      }
    });
    
    // Filter for databases
    const databases = response.results.filter(result => result.object === 'database');
    
    if (databases.length === 0) {
      console.log('   No databases found. Make sure:');
      console.log('   1. Databases exist in Notion');
      console.log('   2. Databases are shared with your integration');
      console.log('   3. Integration has correct permissions');
      console.log('   4. The parent page containing the database is also shared');
      return;
    }
    
    console.log(`   Found ${databases.length} accessible database(s):\n`);
    
    for (const result of databases) {
      const title = result.title?.[0]?.plain_text || 'Untitled';
      const normalizedResultId = normalizeDatabaseId(result.id);
      const releasesId = normalizeDatabaseId(NOTION_RELEASES_DB_ID);
      const featuresId = normalizeDatabaseId(NOTION_FEATURES_DB_ID);
      
      let match = '';
      if (releasesId && normalizedResultId === releasesId) {
        match = ' ← MATCHES Releases DB ID';
      } else if (featuresId && normalizedResultId === featuresId) {
        match = ' ← MATCHES Features DB ID';
      }
      
      console.log(`   📊 ${title}${match}`);
      console.log(`      ID: ${result.id}`);
      console.log(`      URL: ${result.url}\n`);
    }
    
    if (NOTION_RELEASES_DB_ID || NOTION_FEATURES_DB_ID) {
      console.log(`\n   💡 Tip: Compare the IDs above with your .env.personal values`);
      console.log(`      If you see "MATCHES" above, the database is accessible!`);
      console.log(`      If not, you need to share the database with your integration.`);
    }
    
    await sleep(350);
  } catch (error) {
    console.error(`   Error searching databases: ${error.message}`);
    console.error(`   Note: This is okay - we'll verify database access directly next.`);
  }
}

async function verifyIntegration() {
  try {
    const notion = new Client({ auth: NOTION_API_KEY });
    
    // Test basic API access
    const user = await notion.users.me();
    console.log('✅ Notion API Connection:');
    console.log(`   Integration: ${user.name || 'Unknown'}`);
    console.log(`   Type: ${user.type}`);
    
    await sleep(350);
    return { success: true, notion };
  } catch (error) {
    console.error('❌ Notion API Connection Failed:');
    console.error(`   Error: ${error.message}`);
    if (error.code === 'unauthorized') {
      console.error(`\n💡 Check that NOTION_API_KEY is correct in .env.personal`);
    }
    return { success: false, error };
  }
}

async function main() {
  console.log('🔍 Verifying Notion Setup\n');
  console.log('='.repeat(50));
  
  // Step 1: Verify API key
  if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY not found in .env.personal');
    console.error('\n💡 Add NOTION_API_KEY to .env.personal');
    process.exit(1);
  }
  
  console.log('\n📡 Step 1/3: Verifying API Connection...');
  const integrationCheck = await verifyIntegration();
  
  if (!integrationCheck.success) {
    process.exit(1);
  }
  
  const notion = integrationCheck.notion;
  
  // Step 2: List accessible databases
  console.log('\n📋 Step 2/3: Checking Accessible Databases...');
  await listAccessibleDatabases(notion);
  
  // Step 3: Verify specific database IDs
  console.log('\n🎯 Step 3/3: Verifying Database IDs...\n');
  
  if (!NOTION_RELEASES_DB_ID) {
    console.error('⚠️  NOTION_RELEASES_DB_ID not found in .env.personal');
  } else {
    await verifyDatabaseAccess(notion, NOTION_RELEASES_DB_ID, 'Releases');
  }
  
  console.log('');
  
  if (!NOTION_FEATURES_DB_ID) {
    console.error('⚠️  NOTION_FEATURES_DB_ID not found in .env.personal');
  } else {
    await verifyDatabaseAccess(notion, NOTION_FEATURES_DB_ID, 'Features');
  }
  
  console.log('\n' + '='.repeat(50));
  
  // Final summary
  const releasesOk = NOTION_RELEASES_DB_ID ? 
    (await verifyDatabaseAccess(notion, NOTION_RELEASES_DB_ID, 'Releases')).success : false;
  const featuresOk = NOTION_FEATURES_DB_ID ? 
    (await verifyDatabaseAccess(notion, NOTION_FEATURES_DB_ID, 'Features')).success : false;
  
  if (releasesOk && featuresOk) {
    console.log('\n✅ Setup Verification Complete!');
    console.log('   Both databases are accessible and ready for migration.');
  } else {
    console.log('\n⚠️  Setup Issues Detected');
    console.log('   Please fix the issues above before running migration.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n💥 Unexpected error:', error.message);
  console.error(error.stack);
  process.exit(1);
});

