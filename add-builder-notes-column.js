const { createClient } = require('@supabase/supabase-js');

// Supabase connection using environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addBuilderNotesColumn() {
    try {
        console.log('First, creating vendor_bids table if it doesn\'t exist...');

        // Create the table first with all needed columns
        const { data: createData, error: createError } = await supabase
            .from('vendor_bids')
            .select('id')
            .limit(1);

        if (createError && createError.code === 'PGRST116') {
            console.log('Table doesn\'t exist, need to create it manually...');

            // Try to insert a test record to see what happens
            const { data: insertData, error: insertError } = await supabase
                .from('vendor_bids')
                .insert({
                    project_id: '00000000-0000-0000-0000-000000000000',
                    vendor_name: 'Test Vendor',
                    bid_amount: 100,
                    builder_notes: 'Test note'
                });

            if (insertError) {
                console.error('Insert error - table likely doesn\'t exist:', insertError);
                console.log('Please run the create-vendor-bids-table.sql script first');
                return;
            } else {
                console.log('✅ Table exists and builder_notes column works');
                // Clean up test record
                await supabase
                    .from('vendor_bids')
                    .delete()
                    .eq('project_id', '00000000-0000-0000-0000-000000000000');
            }
        } else {
            console.log('✅ vendor_bids table exists');

            // Test if builder_notes column exists
            const { data: insertData, error: insertError } = await supabase
                .from('vendor_bids')
                .insert({
                    project_id: '00000000-0000-0000-0000-000000000000',
                    vendor_name: 'Test Vendor',
                    bid_amount: 100,
                    builder_notes: 'Test note'
                });

            if (insertError) {
                if (insertError.message.includes('builder_notes')) {
                    console.error('❌ builder_notes column is missing from vendor_bids table');
                    console.log('Please manually add the column to Supabase database:');
                    console.log('ALTER TABLE vendor_bids ADD COLUMN IF NOT EXISTS builder_notes TEXT;');
                } else {
                    console.error('Other insert error:', insertError);
                }
            } else {
                console.log('✅ builder_notes column exists and works');
                // Clean up test record
                await supabase
                    .from('vendor_bids')
                    .delete()
                    .eq('project_id', '00000000-0000-0000-0000-000000000000');
            }
        }

    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

addBuilderNotesColumn();