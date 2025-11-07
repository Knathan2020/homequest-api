// Test script to debug soil API
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const USDA_SDA_ENDPOINT = 'https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest';

async function testSoilAPI() {
  const testCoordinates = {
    lat: 33.7116,
    lng: -84.0614
  };

  console.log('Testing USDA Soil Data API...');
  console.log(`Test coordinates: ${testCoordinates.lat}, ${testCoordinates.lng}`);
  console.log('');

  // Test 1: Get map unit key
  const query1 = `
    SELECT DISTINCT
      mu.mukey,
      mu.muname,
      mu.musym
    FROM mapunit mu
    WHERE mu.mukey IN (
      SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${testCoordinates.lng} ${testCoordinates.lat})')
    )
  `;

  console.log('Query 1: Getting map unit...');
  const formData1 = new URLSearchParams({
    FORMAT: 'JSON+COLUMNNAME',
    QUERY: query1
  });

  const response1 = await fetch(USDA_SDA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData1.toString()
  });

  const data1 = await response1.json();
  console.log('Response 1:', JSON.stringify(data1, null, 2));
  console.log('');

  if (!data1.Table || data1.Table.length < 2) {
    console.error('❌ No map units found!');
    return;
  }

  const mukey = data1.Table[1][0];
  console.log(`✅ Found mukey: ${mukey}`);
  console.log('');

  // Test 2: Get soil properties (simpler query to test)
  const query2 = `
    SELECT TOP 1
      mu.mukey,
      mu.muname,
      mu.musym,
      c.compname,
      c.comppct_r,
      c.drainagecl,
      c.hydricrating
    FROM mapunit mu
    INNER JOIN component c ON mu.mukey = c.mukey
    WHERE mu.mukey = '${mukey}'
    AND c.majcompflag = 'Yes'
    ORDER BY c.comppct_r DESC
  `;

  console.log('Query 2: Getting soil properties...');
  const formData2 = new URLSearchParams({
    FORMAT: 'JSON+COLUMNNAME',
    QUERY: query2
  });

  const response2 = await fetch(USDA_SDA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData2.toString()
  });

  const text2 = await response2.text();
  console.log('Response 2 (raw):', text2);
  console.log('');

  let data2;
  try {
    data2 = JSON.parse(text2);
    console.log('Response 2 (parsed):', JSON.stringify(data2, null, 2));
  } catch (e) {
    console.error('Failed to parse JSON, response was XML/HTML');
  }
  console.log('');

  if (!data2.Table || data2.Table.length < 2) {
    console.error('❌ No soil properties found!');
    return;
  }

  console.log('✅ Successfully retrieved soil data!');
}

testSoilAPI().catch(console.error);
