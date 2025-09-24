const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createVendorBidsTable() {
    try {
        console.log('Creating vendor_bids table for bid acceptance...');

        // Try using the rpc function to execute SQL
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS vendor_bids (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  project_id UUID NOT NULL,
                  vendor_id UUID,
                  vendor_name TEXT,
                  vendor_company TEXT,
                  vendor_email TEXT,
                  vendor_phone TEXT,
                  bid_amount DECIMAL(12,2),
                  line_item_name TEXT,
                  line_item_category TEXT,
                  timeline_days INTEGER,
                  materials_cost DECIMAL(12,2),
                  labor_cost DECIMAL(12,2),
                  vendor_notes TEXT,
                  confidence_level INTEGER,
                  builder_notes TEXT,
                  status TEXT DEFAULT 'accepted',
                  submitted_at TIMESTAMP WITH TIME ZONE,
                  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_vendor_bids_project_id ON vendor_bids(project_id);
                CREATE INDEX IF NOT EXISTS idx_vendor_bids_status ON vendor_bids(status);
                CREATE INDEX IF NOT EXISTS idx_vendor_bids_accepted_at ON vendor_bids(accepted_at);
            `
        });

        if (error) {
            console.log('exec_sql not available, checking if table exists...');
            // Test if the table exists by trying to select from it
            const { data: testData, error: testError } = await supabase
                .from('vendor_bids')
                .select('id, accepted_at')
                .limit(1);

            if (testError && testError.message.includes('vendor_bids')) {
                console.log('❌ vendor_bids table does not exist and cannot be created automatically.');
                console.log('📋 Please create the table manually in Supabase Dashboard:');
                console.log(`
CREATE TABLE IF NOT EXISTS vendor_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  vendor_id UUID,
  vendor_name TEXT,
  vendor_company TEXT,
  vendor_email TEXT,
  vendor_phone TEXT,
  bid_amount DECIMAL(12,2),
  line_item_name TEXT,
  line_item_category TEXT,
  timeline_days INTEGER,
  materials_cost DECIMAL(12,2),
  labor_cost DECIMAL(12,2),
  vendor_notes TEXT,
  confidence_level INTEGER,
  builder_notes TEXT,
  status TEXT DEFAULT 'accepted',
  submitted_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_bids_project_id ON vendor_bids(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_status ON vendor_bids(status);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_accepted_at ON vendor_bids(accepted_at);
                `);
            } else if (testError && testError.message.includes('accepted_at')) {
                console.log('❌ vendor_bids table exists but missing accepted_at column.');
                console.log('📋 Please add the column manually in Supabase Dashboard:');
                console.log('ALTER TABLE vendor_bids ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();');
                console.log('CREATE INDEX IF NOT EXISTS idx_vendor_bids_accepted_at ON vendor_bids(accepted_at);');
            } else {
                console.log('✅ vendor_bids table exists and is accessible');
            }
        } else {
            console.log('✅ vendor_bids table created successfully');
        }
    } catch (error) {
        console.error('Error:', error);
        console.log('📋 Manual SQL to run in Supabase Dashboard:');
        console.log(`
CREATE TABLE IF NOT EXISTS vendor_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  vendor_id UUID,
  vendor_name TEXT,
  vendor_company TEXT,
  vendor_email TEXT,
  vendor_phone TEXT,
  bid_amount DECIMAL(12,2),
  line_item_name TEXT,
  line_item_category TEXT,
  timeline_days INTEGER,
  materials_cost DECIMAL(12,2),
  labor_cost DECIMAL(12,2),
  vendor_notes TEXT,
  confidence_level INTEGER,
  builder_notes TEXT,
  status TEXT DEFAULT 'accepted',
  submitted_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_bids_project_id ON vendor_bids(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_status ON vendor_bids(status);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_accepted_at ON vendor_bids(accepted_at);
        `);
    }
}

createVendorBidsTable();