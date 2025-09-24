const { HybridWallDetectorService } = require('./dist/services/hybrid-wall-detector.service');
const path = require('path');

async function testHybridDetection() {
  const detector = new HybridWallDetectorService();
  
  // Test with an existing floor plan
  const imagePath = '/workspaces/codespaces-blank/construction-platform/homequest-api/uploads/floor-plans/a85b076b-1c5a-484c-8bb3-2451a0f859cb/original/delano floor plan.png';
  
  console.log('🚀 Testing HYBRID wall detection on:', imagePath);
  console.log('=====================================================');
  
  try {
    const startTime = Date.now();
    const walls = await detector.detectWallsHybrid(imagePath);
    const endTime = Date.now();
    
    console.log('\n🎉 HYBRID DETECTION COMPLETE!');
    console.log(`⏱️  Processing time: ${(endTime - startTime)/1000}s`);
    console.log(`🏗️  Total walls detected: ${walls.length}`);
    
    // Show wall type breakdown
    const typeBreakdown = {};
    const sourceBreakdown = {};
    walls.forEach(wall => {
      typeBreakdown[wall.type] = (typeBreakdown[wall.type] || 0) + 1;
      sourceBreakdown[wall.source || 'unknown'] = (sourceBreakdown[wall.source || 'unknown'] || 0) + 1;
    });
    
    console.log('\n📊 Wall Classification:');
    Object.entries(typeBreakdown).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} walls`);
    });
    
    console.log('\n🔍 Detection Sources:');
    Object.entries(sourceBreakdown).forEach(([source, count]) => {
      console.log(`  ${source}: ${count} walls`);
    });
    
    // Show quality metrics
    const highConfidenceWalls = walls.filter(wall => wall.confidence > 0.8).length;
    const sketchyWalls = walls.filter(wall => wall.is_sketchy).length;
    const avgConfidence = walls.reduce((sum, wall) => sum + wall.confidence, 0) / walls.length;
    
    console.log('\n🎯 Quality Metrics:');
    console.log(`  High confidence (>80%): ${highConfidenceWalls}/${walls.length} (${(highConfidenceWalls/walls.length*100).toFixed(1)}%)`);
    console.log(`  Sketchy/hand-drawn: ${sketchyWalls}/${walls.length} (${(sketchyWalls/walls.length*100).toFixed(1)}%)`);
    console.log(`  Average confidence: ${(avgConfidence*100).toFixed(1)}%`);
    
    // Show first few walls with enhanced data
    console.log('\n📋 Sample Walls (first 5):');
    walls.slice(0, 5).forEach((wall, i) => {
      const length = Math.sqrt(Math.pow(wall.end.x - wall.start.x, 2) + Math.pow(wall.end.y - wall.start.y, 2));
      console.log(`  Wall ${i + 1} [${wall.type}]:`, {
        source: wall.source,
        confidence: `${(wall.confidence * 100).toFixed(1)}%`,
        thickness: `${wall.thickness}px`,
        length: `${length.toFixed(1)}px`,
        angle: wall.angle ? `${wall.angle.toFixed(1)}°` : 'unknown',
        sketchy: wall.is_sketchy || false
      });
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testHybridDetection();