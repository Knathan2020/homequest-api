const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createVendorDocumentsTable() {
    try {
        console.log('Creating vendor_documents table...');

        // Create the table using a direct SQL execution
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS vendor_documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                vendor_id UUID NOT NULL,
                project_id UUID,
                document_type TEXT NOT NULL,
                document_name TEXT NOT NULL,
                document_path TEXT NOT NULL,
                file_size INTEGER,
                mime_type TEXT,
                notes TEXT,
                uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes for performance
            CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents(vendor_id);
            CREATE INDEX IF NOT EXISTS idx_vendor_documents_project_id ON vendor_documents(project_id);
            CREATE INDEX IF NOT EXISTS idx_vendor_documents_type ON vendor_documents(document_type);

            -- Enable RLS
            ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;

            -- Create permissive policy for development
            CREATE POLICY IF NOT EXISTS "Allow all operations on vendor_documents" ON vendor_documents FOR ALL USING (true);
        `;

        // Try using the rpc function to execute SQL
        const { data, error } = await supabase.rpc('exec_sql', { sql: createTableSQL });

        if (error) {
            // If exec_sql doesn't exist, try creating via a test insert
            console.log('exec_sql not available, testing table...');

            const { data: testData, error: testError } = await supabase
                .from('vendor_documents')
                .select('id')
                .limit(1);

            if (testError && testError.code === 'PGRST106') {
                console.log('❌ vendor_documents table does not exist and cannot be created automatically.');
                console.log('📋 Please create the table manually in Supabase Dashboard with this SQL:');
                console.log('');
                console.log(createTableSQL);
                console.log('');
                console.log('💡 Alternatively, the system will continue to work with file storage only.');
                return;
            } else if (testError) {
                console.log('❌ Database error:', testError);
                return;
            } else {
                console.log('✅ vendor_documents table already exists');
                return;
            }
        }

        console.log('✅ vendor_documents table created successfully');
        console.log('📄 COI documents will now be saved with metadata for team visibility');

    } catch (error) {
        console.error('Error:', error);
        console.log('');
        console.log('📋 Manual table creation SQL:');
        console.log(`
CREATE TABLE IF NOT EXISTS vendor_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL,
    project_id UUID,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    document_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    notes TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_project_id ON vendor_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_type ON vendor_documents(document_type);

ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all operations on vendor_documents" ON vendor_documents FOR ALL USING (true);
        `);
    }
}

createVendorDocumentsTable();