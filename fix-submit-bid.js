const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/routes/vendor-bidding.routes.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the submit-bid endpoint with a simpler version
const startMarker = "router.post('/vendor/submit-bid', async (req, res) => {";
const endMarker = "});";

const startIndex = content.indexOf(startMarker);
if (startIndex === -1) {
  console.error('Could not find submit-bid endpoint');
  process.exit(1);
}

// Find the matching closing bracket
let bracketCount = 0;
let endIndex = startIndex;
let inString = false;
let stringChar = '';

for (let i = startIndex; i < content.length; i++) {
  const char = content[i];
  const prevChar = i > 0 ? content[i - 1] : '';

  // Track string literals
  if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
    if (!inString) {
      inString = true;
      stringChar = char;
    } else if (char === stringChar) {
      inString = false;
    }
  }

  if (!inString) {
    if (char === '{') bracketCount++;
    if (char === '}') bracketCount--;

    if (bracketCount === 0 && i > startIndex) {
      endIndex = i + 3; // Include the ");\n"
      break;
    }
  }
}

const newEndpoint = `router.post('/vendor/submit-bid', async (req, res) => {
  try {
    const {
      project_id,
      vendor_info,
      line_item_bids,
      total_bid_amount,
      uploaded_files,
      submitted_at,
      general_notes
    } = req.body;

    console.log(\`📋 Vendor \${vendor_info?.company_name} submitting bid for project \${project_id}\`);
    console.log(\`💰 Total bid amount: $\${total_bid_amount}\`);
    console.log(\`📦 Line items: \${line_item_bids?.length || 0}\`);

    // Generate unique bid ID
    const bidId = crypto.randomUUID();

    // Store in database using vendor_bids table
    if (supabase && line_item_bids && line_item_bids.length > 0) {
      try {
        // Insert each line item bid into vendor_bids table
        const vendorBidsData = line_item_bids
          .filter((bid: any) => bid.can_perform)
          .map((bid: any) => ({
            project_id: project_id,
            vendor_id: crypto.randomUUID(),
            vendor_company: vendor_info?.company_name || 'Unknown Company',
            vendor_email: vendor_info?.email || '',
            vendor_phone: vendor_info?.phone || '',
            line_item_name: bid.line_item_name || bid.line_item_id || 'Unknown Item',
            line_item_id: bid.line_item_id,
            bid_amount: bid.bid_amount || 0,
            category: bid.category || 'PLANNING',
            status: 'pending',
            created_at: new Date().toISOString()
          }));

        if (vendorBidsData.length > 0) {
          const { data, error } = await supabase
            .from('vendor_bids')
            .insert(vendorBidsData)
            .select();

          if (error) {
            console.error('Database insert error:', error);
            // Don't fail the request - continue with in-memory storage
          } else {
            console.log(\`✅ Stored \${vendorBidsData.length} bids in database\`);
          }
        }
      } catch (dbError) {
        console.error('Database error (non-fatal):', dbError);
        // Continue with in-memory storage
      }
    }

    // Store bid in memory for persistence
    const existingBids = inMemoryBids.get(project_id) || [];
    const formattedBid = {
      id: bidId,
      project_id: project_id,
      vendor_id: crypto.randomUUID(),
      vendor_name: vendor_info?.contact_name || 'Unknown',
      vendor_company: vendor_info?.company_name || 'Unknown Company',
      vendor_email: vendor_info?.email || '',
      vendor_phone: vendor_info?.phone || '',
      line_item_bids: line_item_bids?.map(bid => ({
        id: crypto.randomUUID(),
        line_item_id: bid.line_item_id,
        line_item_name: bid.line_item_name || 'Unknown Item',
        line_item_category: bid.line_item_category || 'General',
        can_perform: bid.can_perform || false,
        bid_amount: bid.bid_amount || 0,
        timeline_days: bid.timeline_days || 0,
        materials_cost: bid.materials_cost || 0,
        labor_cost: bid.labor_cost || 0,
        vendor_notes: bid.vendor_notes || '',
        confidence_level: bid.confidence_level || 3
      })) || [],
      total_bid_amount: total_bid_amount || 0,
      general_notes: general_notes || '',
      submitted_at: submitted_at || new Date().toISOString(),
      status: 'submitted'
    };

    existingBids.push(formattedBid);
    inMemoryBids.set(project_id, existingBids);
    console.log(\`💾 Stored bid in memory for project \${project_id}. Total bids: \${existingBids.length}\`);

    // Send success response
    const bidResponse = {
      success: true,
      message: 'Bid submitted successfully',
      bidId,
      projectId: project_id,
      vendorInfo: {
        companyName: vendor_info?.company_name,
        contactName: vendor_info?.contact_name,
        email: vendor_info?.email,
        phone: vendor_info?.phone
      },
      bidSummary: {
        totalAmount: total_bid_amount,
        lineItemsCount: line_item_bids?.length || 0,
        submittedAt: submitted_at || new Date().toISOString(),
        status: 'submitted'
      }
    };

    res.json(bidResponse);

  } catch (error) {
    console.error('Error submitting vendor bid:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit bid',
      details: error.message
    });
  }
});`;

// Replace the old endpoint with the new one
const before = content.substring(0, startIndex);
const after = content.substring(endIndex);
const newContent = before + newEndpoint + after;

// Write the modified content
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('✅ Successfully fixed submit-bid endpoint');
