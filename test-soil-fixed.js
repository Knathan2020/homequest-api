// Test the fixed soil routes
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testFixedRoutes() {
  console.log('Testing fixed soil routes...\n');

  // Test coordinates for Conyers, GA
  const testBounds = {
    minLat: 33.7110,
    minLng: -84.0620,
    maxLat: 33.7120,
    maxLng: -84.0610
  };

  const testCenter = {
    lat: 33.7116,
    lng: -84.0614
  };

  // Test 1: /zones endpoint
  console.log('Test 1: GET /api/soil/zones');
  const params = new URLSearchParams(testBounds);

  try {
    const response = await fetch(`http://localhost:3001/api/soil/zones?${params}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log(`✅ Found ${data.zones?.length || 0} zones\n`);
  } catch (error) {
    console.error('❌ Error:', error.message, '\n');
  }

  // Test 2: /point endpoint
  console.log('Test 2: GET /api/soil/point');
  const pointParams = new URLSearchParams({ lat: testCenter.lat, lng: testCenter.lng });

  try {
    const response = await fetch(`http://localhost:3001/api/soil/point?${pointParams}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('✅ Point query successful\n');
  } catch (error) {
    console.error('❌ Error:', error.message, '\n');
  }

  // Test 3: /analyze endpoint
  console.log('Test 3: POST /api/soil/analyze');

  try {
    const response = await fetch('http://localhost:3001/api/soil/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propertyBounds: [
          { lat: testBounds.minLat, lng: testBounds.minLng },
          { lat: testBounds.maxLat, lng: testBounds.minLng },
          { lat: testBounds.maxLat, lng: testBounds.maxLng },
          { lat: testBounds.minLat, lng: testBounds.maxLng }
        ],
        propertyCenter: testCenter
      })
    });
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('✅ Analysis successful\n');
  } catch (error) {
    console.error('❌ Error:', error.message, '\n');
  }
}

testFixedRoutes().catch(console.error);
