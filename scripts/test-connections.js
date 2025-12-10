// test-connections.js
// Phase 0: Verifies both API connections work

import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config({ path: '.env.personal' });

const PRODUCTBOARD_API_TOKEN = process.env.PRODUCTBOARD_API_TOKEN;
const NOTION_API_KEY = process.env.NOTION_API_KEY;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testProductBoardAPI() {
  console.log('\n🔍 Testing ProductBoard API...');
  
  if (!PRODUCTBOARD_API_TOKEN) {
    console.error('❌ PRODUCTBOARD_API_TOKEN not found in .env.personal');
    return false;
  }

  try {
    const response = await fetch('https://api.productboard.com/releases', {
      method: 'GET',
      headers: {
        'X-Version': '1',
        'Authorization': `Bearer ${PRODUCTBOARD_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ ProductBoard API error: ${response.status} ${response.statusText}`);
      console.error(`   Response: ${errorText}`);
      return false;
    }

    const data = await response.json();
    const releaseCount = data.data?.length || 0;
    
    console.log(`✅ ProductBoard API connection successful`);
    console.log(`   Found ${releaseCount} releases`);
    return true;
  } catch (error) {
    console.error(`❌ ProductBoard API connection failed: ${error.message}`);
    return false;
  }
}

async function testNotionAPI() {
  console.log('\n🔍 Testing Notion API...');
  
  if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY not found in .env.personal');
    return false;
  }

  try {
    const notion = new Client({
      auth: NOTION_API_KEY,
    });

    // Test by listing users (lightweight endpoint)
    const response = await notion.users.list();
    
    console.log(`✅ Notion API connection successful`);
    console.log(`   Integration authenticated`);
    
    // Rate limit delay
    await sleep(350);
    
    return true;
  } catch (error) {
    console.error(`❌ Notion API connection failed: ${error.message}`);
    if (error.code === 'unauthorized') {
      console.error('   Check that your NOTION_API_KEY is valid');
    }
    return false;
  }
}

async function main() {
  console.log('🚀 Testing API Connections\n');
  console.log('='.repeat(50));

  const productBoardOk = await testProductBoardAPI();
  const notionOk = await testNotionAPI();

  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Results:');
  
  if (productBoardOk && notionOk) {
    console.log('✅ All API connections successful!');
    console.log('\n🎉 Phase 0 checkpoint passed!');
    console.log('   Both APIs respond successfully');
    process.exit(0);
  } else {
    console.error('❌ One or more API connections failed');
    console.error('\n💡 Troubleshooting:');
    if (!PRODUCTBOARD_API_TOKEN) {
      console.error('   - Add PRODUCTBOARD_API_TOKEN to .env.personal');
    }
    if (!NOTION_API_KEY) {
      console.error('   - Add NOTION_API_KEY to .env.personal');
    }
    console.error('   - Verify tokens are correct');
    console.error('   - Check API token permissions');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

