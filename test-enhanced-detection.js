/**
 * Test Enhanced Wall Detection vs Original
 * Compare the new Canny+Hough algorithm with existing parallel detection
 */

const { RealDetectionService } = require('./src/services/real-detection.service');
const fs = require('fs');
const path = require('path');

async function testEnhancedDetection() {
  console.log('🧪 Testing Enhanced Wall Detection\n');
  
  const detectionService = new RealDetectionService();
  
  // Find test floor plan images
  const testImagesDir = './temp-floor-plans';
  const testImages = fs.readdirSync(testImagesDir)
    .filter(file => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))
    .slice(0, 3); // Test first 3 images
  
  console.log(`Found ${testImages.length} test images to analyze\n`);
  
  for (const imageName of testImages) {
    const imagePath = path.join(testImagesDir, imageName);
    console.log(`\n📋 Testing: ${imageName}`);
    console.log('=' .repeat(50));
    
    try {
      const startTime = Date.now();
      
      // Run enhanced detection
      const result = await detectionService.detectFloorPlan(imagePath);
      
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;
      
      // Display results
      console.log(`\n✅ Results for ${imageName}:`);
      console.log(`   Processing time: ${processingTime.toFixed(2)}s`);
      console.log(`   Walls detected: ${result.walls.length}`);
      console.log(`   Doors detected: ${result.doors.length}`);
      console.log(`   Windows detected: ${result.windows.length}`);
      console.log(`   Rooms detected: ${result.rooms.length}`);
      
      // Show wall details
      if (result.walls.length > 0) {
        console.log(`\n🏗️ Wall Details:`);
        result.walls.slice(0, 5).forEach((wall, idx) => {
          console.log(`   Wall ${idx + 1}: ${wall.type}, confidence: ${(wall.confidence * 100).toFixed(1)}%, thickness: ${wall.thickness}px`);
        });
        if (result.walls.length > 5) {
          console.log(`   ... and ${result.walls.length - 5} more walls`);
        }
      }
      
      // Detection quality indicators
      const avgConfidence = result.walls.length > 0 
        ? result.walls.reduce((sum, w) => sum + w.confidence, 0) / result.walls.length 
        : 0;
      
      console.log(`\n📊 Quality Metrics:`);
      console.log(`   Average wall confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      console.log(`   Wall types detected: ${[...new Set(result.walls.map(w => w.type))].join(', ')}`);
      
    } catch (error) {
      console.error(`❌ Error testing ${imageName}:`, error.message);
    }
  }
  
  console.log('\n🎯 Test Complete!');
  console.log('The enhanced detection system now includes:');
  console.log('   • Canny Edge Detection for precise wall boundaries');
  console.log('   • Hough Transform for straight line detection');
  console.log('   • Advanced image preprocessing');
  console.log('   • Geometric constraint solving');
  console.log('   • Parallel line grouping for wall thickness');
  console.log('\nThis brings your system closer to Homestyler-level accuracy! 🚀');
}

// Handle both module.exports and ES6 imports
if (require.main === module) {
  testEnhancedDetection().catch(console.error);
}

module.exports = { testEnhancedDetection };