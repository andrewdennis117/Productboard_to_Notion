import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config({ path: '.env.personal' });

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const RELEASES_DB_ID = '2c001196-b8da-8066-94c1-eabf95f92ce3';
const FEATURES_DB_ID = '2c001196-b8da-805c-ad3e-ffa435aec8ac';

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
    console.log(`   Properties: ${Object.keys(db.properties).join(', ')}`);
    
    // Try to query it
    const query = await notion.databases.query({
      database_id: RELEASES_DB_ID,
      page_size: 3
    });
    
    console.log(`   Pages: ${query.results.length} items`);
    if (query.results.length > 0) {
      query.results.forEach(page => {
        const name = page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
        console.log(`      - ${name}`);
      });
    }
    
  } catch (error) {
    console.log('   ❌ NOT ACCESSIBLE');
    console.log(`   Error: ${error.code} - ${error.message}`);
    
    if (error.code === 'object_not_found') {
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
    console.log(`   Properties: ${Object.keys(db.properties).join(', ')}`);
    
    // Try to query it
    const query = await notion.databases.query({
      database_id: FEATURES_DB_ID,
      page_size: 3
    });
    
    console.log(`   Pages: ${query.results.length} items`);
    if (query.results.length > 0) {
      query.results.forEach(page => {
        const name = page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
        console.log(`      - ${name}`);
      });
    }
    
  } catch (error) {
    console.log('   ❌ NOT ACCESSIBLE');
    console.log(`   Error: ${error.code} - ${error.message}`);
    
    if (error.code === 'object_not_found') {
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