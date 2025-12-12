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

console.log('🧪 Direct Database Test - No Search API\n');
console.log('='.repeat(60));

async function testDirectAccess() {
  
  // Test 1: Retrieve Releases database
  console.log('\n📊 Test 1: Retrieve Releases Database');
  try {
    const db = await notion.databases.retrieve({
      database_id: RELEASES_DB_ID
    });
    console.log('   ✅ SUCCESS - Can retrieve database metadata');
    console.log(`   Name: ${db.title?.[0]?.plain_text || 'Untitled'}`);
  } catch (error) {
    console.log('   ❌ FAILED - Cannot retrieve');
    console.log(`   Error: ${error.code}`);
    return false;
  }
  
  // Test 2: Query Releases database
  console.log('\n📊 Test 2: Query Releases Database');
  try {
    const queryResponse = await fetch(`https://api.notion.com/v1/databases/${RELEASES_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 5 })
    });
    
    if (!queryResponse.ok) {
      const errorText = await queryResponse.text();
      throw new Error(`HTTP ${queryResponse.status}: ${errorText}`);
    }
    
    const query = await queryResponse.json();
    console.log('   ✅ SUCCESS - Can query database');
    console.log(`   Found ${query.results?.length || 0} pages`);
    
    if (query.results && query.results.length > 0) {
      console.log('   Sample releases:');
      query.results.slice(0, 3).forEach(page => {
        const name = page.properties?.Name?.title?.[0]?.plain_text || 'Untitled';
        console.log(`      - ${name}`);
      });
    }
  } catch (error) {
    console.log('   ❌ FAILED - Cannot query');
    console.log(`   Error: ${error.message || error}`);
    return false;
  }
  
  // Test 3: Try to create a test page
  console.log('\n📊 Test 3: Create Test Page in Releases');
  try {
    const testPage = await notion.pages.create({
      parent: { database_id: RELEASES_DB_ID },
      properties: {
        Name: {
          title: [{ text: { content: 'API Test - Can Delete' } }]
        }
      }
    });
    console.log('   ✅ SUCCESS - Can create pages!');
    console.log(`   Created test page: ${testPage.id}`);
    
    // Clean up
    await notion.pages.update({
      page_id: testPage.id,
      archived: true
    });
    console.log('   ✅ Cleaned up test page');
    
  } catch (error) {
    console.log('   ❌ FAILED - Cannot create pages');
    console.log(`   Error: ${error.code} - ${error.message}`);
    
    if (error.code === 'validation_error') {
      console.log('\n   This might be a schema issue, not a permissions issue.');
    }
    return false;
  }
  
  console.log('\n' + '-'.repeat(60));
  
  // Test 4: Retrieve Features database
  console.log('\n📊 Test 4: Retrieve Features Database');
  try {
    const db = await notion.databases.retrieve({
      database_id: FEATURES_DB_ID
    });
    console.log('   ✅ SUCCESS - Can retrieve database metadata');
    console.log(`   Name: ${db.title?.[0]?.plain_text || 'Untitled'}`);
  } catch (error) {
    console.log('   ❌ FAILED - Cannot retrieve');
    console.log(`   Error: ${error.code}`);
    return false;
  }
  
  // Test 5: Query Features database
  console.log('\n📊 Test 5: Query Features Database');
  try {
    const queryResponse = await fetch(`https://api.notion.com/v1/databases/${FEATURES_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 5 })
    });
    
    if (!queryResponse.ok) {
      const errorText = await queryResponse.text();
      throw new Error(`HTTP ${queryResponse.status}: ${errorText}`);
    }
    
    const query = await queryResponse.json();
    console.log('   ✅ SUCCESS - Can query database');
    console.log(`   Found ${query.results?.length || 0} pages`);
    
    if (query.results && query.results.length > 0) {
      console.log('   Sample features:');
      query.results.slice(0, 3).forEach(page => {
        const name = page.properties?.Name?.title?.[0]?.plain_text || 'Untitled';
        console.log(`      - ${name}`);
      });
    }
  } catch (error) {
    console.log('   ❌ FAILED - Cannot query');
    console.log(`   Error: ${error.message || error}`);
    return false;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n🎉 ALL TESTS PASSED!');
  console.log('✅ Your integration has full access to both databases');
  console.log('✅ You\'re ready to proceed with the migration!\n');
  console.log('Next step: node scripts/fetch-productboard.js\n');
  
  return true;
}

testDirectAccess().catch(error => {
  console.error('\n❌ Fatal error:', error);
  console.log('\n💡 If you see "object_not_found":');
  console.log('   Wait 5 minutes for permissions to propagate, then try again.\n');
  process.exit(1);
});