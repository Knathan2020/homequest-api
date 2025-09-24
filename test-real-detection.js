const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

async function testRealDetection() {
  try {
    console.log('🧪 Testing Real Detection Endpoint...');
    
    // Use a sample image - you'll need to provide your own
    const imagePath = process.argv[2];
    
    if (!imagePath) {
      console.error('❌ Please provide an image path as argument');
      console.log('Usage: node test-real-detection.js /path/to/floorplan.png');
      process.exit(1);
    }
    
    if (!fs.existsSync(imagePath)) {
      console.error(`❌ File not found: ${imagePath}`);
      process.exit(1);
    }
    
    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath));
    
    // Make request
    const response = await axios.post(
      'http://localhost:4000/api/floor-plans/real-detect',
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
    
    console.log('✅ Response received!');
    console.log('\n📊 Detection Statistics:');
    console.log('------------------------');
    console.log(`Total Walls: ${response.data.stats.walls}`);
    console.log(`  - Interior: ${response.data.stats.hasInteriorWalls}`);
    console.log(`  - Exterior: ${response.data.stats.hasExteriorWalls}`);
    console.log(`  - Load-bearing: ${response.data.stats.hasLoadBearingWalls}`);
    console.log(`Doors: ${response.data.stats.doors}`);
    console.log(`Windows: ${response.data.stats.windows}`);
    console.log(`Rooms: ${response.data.stats.rooms}`);
    console.log(`Text elements: ${response.data.stats.text}`);
    console.log(`Fixtures: ${response.data.stats.fixtures}`);
    
    // Show sample wall data
    if (response.data.data.walls && response.data.data.walls.length > 0) {
      console.log('\n🏗️ Sample Wall Data (first 3 walls):');
      console.log('------------------------------------');
      response.data.data.walls.slice(0, 3).forEach((wall, i) => {
        console.log(`Wall ${i + 1}:`);
        console.log(`  Type: ${wall.type}`);
        console.log(`  Thickness: ${wall.thickness}px`);
        console.log(`  Has White Interior: ${wall.hasWhiteInterior || false}`);
        console.log(`  Interior Darkness: ${wall.interiorDarkness || 'N/A'}`);
        console.log(`  Confidence: ${wall.confidence}`);
        console.log(`  Start: (${wall.start.x}, ${wall.start.y})`);
        console.log(`  End: (${wall.end.x}, ${wall.end.y})`);
      });
    }
    
    // Save full results to file
    const outputPath = path.join(__dirname, 'real-detection-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(response.data, null, 2));
    console.log(`\n💾 Full results saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('⚠️  Server is not running. Start the server with: npm run dev');
    }
  }
}

testRealDetection();