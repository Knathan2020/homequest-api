const fetch = require('node-fetch');

async function testBidSubmission() {
  const apiUrl = 'https://homequest-api-1.onrender.com';

  const testBid = {
    project_id: 'd439a24d-8ec7-47a2-b578-7c16c5f97ccd',
    vendor_info: {
      company_name: 'Test Company',
      contact_name: 'John Doe',
      email: 'john@testcompany.com',
      phone: '555-1234',
      license_number: 'TEST123',
      insurance_amount: '$1,000,000'
    },
    line_item_bids: [
      {
        line_item_id: 'test-item-1',
        line_item_name: 'Test Item',
        line_item_category: 'General',
        can_perform: true,
        bid_amount: 1000,
        timeline_days: 10,
        materials_cost: 600,
        labor_cost: 400,
        vendor_notes: 'Test bid from script',
        confidence_level: 3
      }
    ],
    general_notes: 'This is a test bid submission',
    total_bid_amount: 1000,
    uploaded_files: [],
    submitted_at: new Date().toISOString()
  };

  console.log('🚀 Submitting test bid to:', `${apiUrl}/api/vendor-bidding/vendor/submit-bid`);
  console.log('📦 Bid data:', JSON.stringify(testBid, null, 2));

  try {
    const response = await fetch(`${apiUrl}/api/vendor-bidding/vendor/submit-bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testBid)
    });

    console.log('\n📡 Response status:', response.status, response.statusText);

    const result = await response.json();
    console.log('📝 Response body:', JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log('\n✅ Bid submitted successfully!');
      console.log('Now check Supabase vendor_bids table for the new record');
    } else {
      console.log('\n❌ Bid submission failed!');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testBidSubmission();
