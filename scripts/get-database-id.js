// get-database-id.js
// Helper to extract database ID from Notion URL

const url = process.argv[2];

if (!url) {
  console.log('Usage: node scripts/get-database-id.js <notion-database-url>');
  console.log('\nExample:');
  console.log('  node scripts/get-database-id.js "https://www.notion.so/workspace/2c001196b8da806694c1eabf95f92ce3?v=..."');
  process.exit(1);
}

// Extract database ID from Notion URL
// Format: https://www.notion.so/{workspace}/{database-id}?v=...
// Or: https://www.notion.so/{slug-with-id-at-end}?source=...
// Or: https://{workspace}.notion.site/{database-id}?v=...

let databaseId = null;

// Try to extract 32-char hex ID (with dashes) from URL
const matchUUID = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
if (matchUUID) {
  databaseId = matchUUID[1];
}

// Try to extract 32-char hex ID (without dashes) from end of path
if (!databaseId) {
  const matchNoDashes = url.match(/([a-f0-9]{32})(?:\?|$)/i);
  if (matchNoDashes) {
    databaseId = matchNoDashes[1];
  }
}

// Try to extract from standard Notion URL format
if (!databaseId) {
  const match1 = url.match(/notion\.(so|site)\/(?:[^\/]+\/)?([a-f0-9]{32})/i);
  if (match1) {
    databaseId = match1[2];
  }
}

if (!databaseId) {
  console.error('❌ Could not extract database ID from URL');
  console.error('\n💡 Make sure the URL is a Notion database URL');
  console.error('   Example: https://www.notion.so/workspace/2c001196b8da806694c1eabf95f92ce3');
  process.exit(1);
}

// Format as UUID
function formatAsUUID(id) {
  const clean = id.replace(/-/g, '');
  if (clean.length !== 32) return id;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
}

const formattedId = formatAsUUID(databaseId);

console.log('📋 Database ID extracted from URL:\n');
console.log(`   Without dashes: ${databaseId}`);
console.log(`   With dashes:    ${formattedId}`);
console.log('\n💡 Add to .env.personal:');
console.log(`   NOTION_RELEASES_DB_ID=${formattedId}`);
console.log(`   # or`);
console.log(`   NOTION_FEATURES_DB_ID=${formattedId}`);
console.log(`   # (use the appropriate variable name for your database)`);
console.log(`   # Both formats work: with or without dashes`);

