const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addExpiryField() {
    try {
        console.log('Adding expiry_date field to vendor_documents table...');

        // Try using the rpc function to execute SQL
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: 'ALTER TABLE vendor_documents ADD COLUMN IF NOT EXISTS expiry_date DATE; CREATE INDEX IF NOT EXISTS idx_vendor_documents_expiry ON vendor_documents(expiry_date);'
        });

        if (error) {
            console.log('exec_sql not available, checking if field exists...');
            // Test if the field exists by trying to select it
            const { data: testData, error: testError } = await supabase
                .from('vendor_documents')
                .select('expiry_date')
                .limit(1);

            if (testError && testError.message.includes('expiry_date')) {
                console.log('❌ expiry_date field does not exist and cannot be added automatically.');
                console.log('📋 Please add the field manually in Supabase Dashboard:');
                console.log('ALTER TABLE vendor_documents ADD COLUMN IF NOT EXISTS expiry_date DATE;');
                console.log('CREATE INDEX IF NOT EXISTS idx_vendor_documents_expiry ON vendor_documents(expiry_date);');
            } else {
                console.log('✅ expiry_date field already exists or table accessible');
            }
        } else {
            console.log('✅ expiry_date field added successfully');
        }
    } catch (error) {
        console.error('Error:', error);
        console.log('📋 Manual SQL to run in Supabase Dashboard:');
        console.log('ALTER TABLE vendor_documents ADD COLUMN IF NOT EXISTS expiry_date DATE;');
        console.log('CREATE INDEX IF NOT EXISTS idx_vendor_documents_expiry ON vendor_documents(expiry_date);');
    }
}

addExpiryField();