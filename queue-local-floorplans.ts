import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

// Clear old queue and create fresh one with local files
const queueFile = path.join(process.cwd(), 'auto-learner-queue.json');

// Find all floor plan images in the system
const floorPlanPaths = [
  // HouseExpo dataset (783 images)
  '/workspaces/codespaces-blank/construction-platform/homequest-api/uploads/houseexpo/**/*.{png,jpg,jpeg}',
  
  // Other floor plans in uploads
  '/workspaces/codespaces-blank/construction-platform/homequest-api/uploads/*.{png,jpg,jpeg}',
  '/workspaces/codespaces-blank/construction-platform/homequest-api/uploads/floor-plans/**/*.{png,jpg,jpeg}',
  '/workspaces/codespaces-blank/construction-platform/homequest-api/uploads/datasets/**/*.{png,jpg,jpeg}',
  
  // Sample floor plans
  '/workspaces/codespaces-blank/construction-platform/homequest-api/sample-floor-plans/**/*.{png,jpg,jpeg}'
];

console.log('🔍 Finding all floor plan images...');

const allImages: string[] = [];
const counts: Record<string, number> = {};

for (const pattern of floorPlanPaths) {
  const files = glob.sync(pattern);
  const dir = pattern.split('/').slice(0, -1).join('/').split('uploads/')[1] || 'root';
  counts[dir] = files.length;
  allImages.push(...files);
  if (files.length > 0) {
    console.log(`  Found ${files.length} images in ${dir}`);
  }
}

// Remove duplicates
const uniqueImages = Array.from(new Set(allImages));

console.log(`\n📊 Total unique images found: ${uniqueImages.length}`);

// Create queue with local file URLs
const queue = uniqueImages.map((imagePath, index) => ({
  id: `local_${index}_${Date.now()}`,
  url: `file://${imagePath}`,
  status: 'pending' as const,
  source: imagePath.includes('houseexpo') ? 'HouseExpo' : 'Local',
  metadata: {
    originalPath: imagePath,
    dataset: imagePath.split('/uploads/')[1]?.split('/')[0] || 'unknown'
  },
  addedAt: new Date()
}));

// Save the queue
fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

console.log(`\n✅ Created queue with ${queue.length} local floor plans`);
console.log('   HouseExpo images:', queue.filter(q => q.source === 'HouseExpo').length);
console.log('   Other local images:', queue.filter(q => q.source === 'Local').length);

// Clear old stats to start fresh
const statsFile = path.join(process.cwd(), 'auto-learner-stats.json');
const freshStats = {
  totalProcessed: 0,
  totalLearned: 0,
  totalFailed: 0,
  patternsLearned: [],
  lastProcessed: null,
  averageWallsPerPlan: 0,
  commonRoomTypes: [],
  wallStylesLearned: []
};

fs.writeFileSync(statsFile, JSON.stringify(freshStats, null, 2));
console.log('\n🔄 Reset learning stats for fresh start');

console.log('\n📢 Queue ready! Run "npm run learner:bg" to start processing');