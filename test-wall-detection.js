const { ParallelWallDetectorService } = require('./dist/services/parallel-wall-detector.service');
const path = require('path');

async function testWallDetection() {
  const detector = new ParallelWallDetectorService();
  
  // Test with an existing floor plan
  const imagePath = '/workspaces/codespaces-blank/construction-platform/homequest-api/uploads/floor-plans/a85b076b-1c5a-484c-8bb3-2451a0f859cb/original/delano floor plan.png';
  
  console.log('Testing wall detection on:', imagePath);
  
  try {
    const walls = await detector.detectWalls(imagePath);
    console.log(`✅ Detection complete: Found ${walls.length} walls`);
    
    // Show wall type breakdown
    const typeBreakdown = {};
    walls.forEach(wall => {
      typeBreakdown[wall.type] = (typeBreakdown[wall.type] || 0) + 1;
    });
    
    console.log('Wall types:', typeBreakdown);
    
    // Show first few walls
    console.log('\nFirst 5 walls:');
    walls.slice(0, 5).forEach((wall, i) => {
      console.log(`  Wall ${i + 1}:`, {
        type: wall.type,
        thickness: wall.thickness,
        interiorDarkness: wall.interiorDarkness,
        length: Math.sqrt(Math.pow(wall.end.x - wall.start.x, 2) + Math.pow(wall.end.y - wall.start.y, 2)).toFixed(1)
      });
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

testWallDetection();