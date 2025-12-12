import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config({ path: '.env.personal' });

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const RELEASES_DB_ID = process.env.NOTION_RELEASES_DB_ID;
const FEATURES_DB_ID = process.env.NOTION_FEATURES_DB_ID;

if (!NOTION_API_KEY) {
  console.error('❌ NOTION_API_KEY not found in .env.personal');
  process.exit(1);
}

if (!RELEASES_DB_ID) {
  console.error('❌ NOTION_RELEASES_DB_ID not found in .env.personal');
  process.exit(1);
}

if (!FEATURES_DB_ID) {
  console.error('❌ NOTION_FEATURES_DB_ID not found in .env.personal');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

console.log('🔍 Direct Database Access Test\n');
console.log('='.repeat(60));

async function testDatabases() {
  
  console.log('\n📊 Testing Releases Database...');
  console.log(`   ID: ${RELEASES_DB_ID}`);
  
  try {
    const db = await notion.databases.retrieve({
      database_id: RELEASES_DB_ID
    });
    
    console.log('   ✅ ACCESSIBLE!');
    console.log(`   Name: ${db.title?.[0]?.plain_text || 'Untitled'}`);
    if (db.properties) {
      console.log(`   Properties: ${Object.keys(db.properties).join(', ')}`);
    } else {
      console.log(`   Properties: (unavailable)`);
    }
    
    // Try to query it using direct API call
    try {
      const queryResponse = await fetch(`https://api.notion.com/v1/databases/${RELEASES_DB_ID}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ page_size: 3 })
      });
      
      if (queryResponse.ok) {
        const query = await queryResponse.json();
        if (query && query.results) {
          console.log(`   Pages: ${query.results.length} items`);
          if (query.results.length > 0) {
            query.results.forEach(page => {
              const name = page.properties?.Name?.title?.[0]?.plain_text || 'Untitled';
              console.log(`      - ${name}`);
            });
          }
        } else {
          console.log(`   ⚠️  Query response format unexpected`);
        }
      } else {
        const errorText = await queryResponse.text();
        console.log(`   ⚠️  Could not query pages: ${queryResponse.status} ${queryResponse.statusText}`);
        if (errorText) {
          console.log(`   Error details: ${errorText.substring(0, 200)}`);
        }
      }
    } catch (queryError) {
      console.log(`   ⚠️  Query error: ${queryError.message}`);
    }
    
  } catch (error) {
    console.log('   ❌ ERROR');
    const errorCode = error?.code || 'unknown';
    const errorMessage = error?.message || String(error);
    console.log(`   Error: ${errorCode} - ${errorMessage}`);
    
    if (errorCode === 'object_not_found') {
      console.log(`\n   💡 FIX THIS:`);
      console.log(`      1. Open: https://www.notion.so/${RELEASES_DB_ID.replace(/-/g, '')}`);
      console.log(`      2. Click ••• at the top-right`);
      console.log(`      3. Hover over "Connections" or look for "Add connections"`);
      console.log(`      4. Add "Test PB sync"`);
      console.log(`      5. Make sure it has "Edit" permissions`);
    }
  }
  
  console.log('\n' + '-'.repeat(60));
  
  console.log('\n📊 Testing Features Database...');
  console.log(`   ID: ${FEATURES_DB_ID}`);
  
  try {
    const db = await notion.databases.retrieve({
      database_id: FEATURES_DB_ID
    });
    
    console.log('   ✅ ACCESSIBLE!');
    console.log(`   Name: ${db.title?.[0]?.plain_text || 'Untitled'}`);
    if (db.properties) {
      console.log(`   Properties: ${Object.keys(db.properties).join(', ')}`);
    } else {
      console.log(`   Properties: (unavailable)`);
    }
    
    // Try to query it using direct API call
    try {
      const queryResponse = await fetch(`https://api.notion.com/v1/databases/${FEATURES_DB_ID}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ page_size: 3 })
      });
      
      if (queryResponse.ok) {
        const query = await queryResponse.json();
        if (query && query.results) {
          console.log(`   Pages: ${query.results.length} items`);
          if (query.results.length > 0) {
            query.results.forEach(page => {
              const name = page.properties?.Name?.title?.[0]?.plain_text || 'Untitled';
              console.log(`      - ${name}`);
            });
          }
        } else {
          console.log(`   ⚠️  Query response format unexpected`);
        }
      } else {
        const errorText = await queryResponse.text();
        console.log(`   ⚠️  Could not query pages: ${queryResponse.status} ${queryResponse.statusText}`);
        if (errorText) {
          console.log(`   Error details: ${errorText.substring(0, 200)}`);
        }
      }
    } catch (queryError) {
      console.log(`   ⚠️  Query error: ${queryError.message}`);
    }
    
  } catch (error) {
    console.log('   ❌ ERROR');
    const errorCode = error?.code || 'unknown';
    const errorMessage = error?.message || String(error);
    console.log(`   Error: ${errorCode} - ${errorMessage}`);
    
    if (errorCode === 'object_not_found') {
      console.log(`\n   💡 FIX THIS:`);
      console.log(`      1. Open: https://www.notion.so/${FEATURES_DB_ID.replace(/-/g, '')}`);
      console.log(`      2. Click ••• at the top-right`);
      console.log(`      3. Hover over "Connections" or look for "Add connections"`);
      console.log(`      4. Add "Test PB sync"`);
      console.log(`      5. Make sure it has "Edit" permissions`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n🎯 Summary:\n');
  
  // Test both again to give final summary
  let releasesOk = false;
  let featuresOk = false;
  
  try {
    await notion.databases.retrieve({ database_id: RELEASES_DB_ID });
    releasesOk = true;
  } catch (e) {}
  
  try {
    await notion.databases.retrieve({ database_id: FEATURES_DB_ID });
    featuresOk = true;
  } catch (e) {}
  
  if (releasesOk && featuresOk) {
    console.log('✅ BOTH databases are accessible!');
    console.log('✅ You\'re ready to run the migration!\n');
    console.log('Next step:');
    console.log('   node scripts/fetch-productboard.js\n');
  } else if (!releasesOk && !featuresOk) {
    console.log('❌ NEITHER database is accessible');
    console.log('   You need to share BOTH pages with your integration\n');
  } else if (!releasesOk) {
    console.log('⚠️  Features is accessible, but Releases is NOT');
    console.log('   Share the Releases page with your integration\n');
  } else {
    console.log('⚠️  Releases is accessible, but Features is NOT');
    console.log('   Share the Features page with your integration\n');
  }
}

testDatabases().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});