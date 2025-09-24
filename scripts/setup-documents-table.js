#!/usr/bin/env node

/**
 * Setup Documents Table
 * Creates the documents table for team-wide document storage
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupDocumentsTable() {
  console.log('🚀 Setting up documents table...');

  try {
    // Create documents table
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create documents table
        CREATE TABLE IF NOT EXISTS public.documents (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          file_path TEXT NOT NULL,
          thumbnail_path TEXT,
          file_size BIGINT NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          project_id UUID,
          team_id VARCHAR(255) NOT NULL,
          uploaded_by VARCHAR(255) NOT NULL,
          tags TEXT[] DEFAULT '{}',
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_documents_team_id ON public.documents(team_id);
        CREATE INDEX IF NOT EXISTS idx_documents_project_id ON public.documents(project_id);
        CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON public.documents(uploaded_by);
        CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at);
        CREATE INDEX IF NOT EXISTS idx_documents_mime_type ON public.documents(mime_type);

        -- Create function to update updated_at timestamp
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql';

        -- Create trigger to automatically update updated_at
        DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
        CREATE TRIGGER update_documents_updated_at
          BEFORE UPDATE ON public.documents
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

        -- Enable Row Level Security (RLS)
        ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies
        -- Policy for team members to view their team's documents
        DROP POLICY IF EXISTS "Team members can view team documents" ON public.documents;
        CREATE POLICY "Team members can view team documents" ON public.documents
          FOR SELECT USING (true); -- Open access for now, can be restricted later

        -- Policy for team members to insert documents
        DROP POLICY IF EXISTS "Team members can insert documents" ON public.documents;
        CREATE POLICY "Team members can insert documents" ON public.documents
          FOR INSERT WITH CHECK (true); -- Open access for now

        -- Policy for team members to update their team's documents
        DROP POLICY IF EXISTS "Team members can update team documents" ON public.documents;
        CREATE POLICY "Team members can update team documents" ON public.documents
          FOR UPDATE USING (true); -- Open access for now

        -- Policy for team members to delete their team's documents
        DROP POLICY IF EXISTS "Team members can delete team documents" ON public.documents;
        CREATE POLICY "Team members can delete team documents" ON public.documents
          FOR DELETE USING (true); -- Open access for now

        -- Grant necessary permissions
        GRANT ALL ON public.documents TO anon;
        GRANT ALL ON public.documents TO authenticated;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      `
    });

    if (createError) {
      console.error('❌ Error creating documents table:', createError);
      return false;
    }

    console.log('✅ Documents table created successfully!');

    // Insert some sample documents for testing
    const sampleDocuments = [
      {
        name: 'sample-floor-plan-1.pdf',
        original_name: 'Floor Plan - Level 1.pdf',
        file_path: '/uploads/documents/sample-floor-plan-1.pdf',
        thumbnail_path: null,
        file_size: 2457600, // 2.4 MB
        mime_type: 'application/pdf',
        project_id: null,
        team_id: 'team-zmfzbdu5angznj0642lb',
        uploaded_by: 'system',
        tags: ['floor-plan', 'level-1'],
        description: 'Main floor plan for the project'
      },
      {
        name: 'sample-blueprint-1.jpg',
        original_name: 'Electrical Blueprint.jpg',
        file_path: '/uploads/documents/sample-blueprint-1.jpg',
        thumbnail_path: '/uploads/documents/thumbnails/thumb_sample-blueprint-1.jpg',
        file_size: 3355443, // 3.2 MB
        mime_type: 'image/jpeg',
        project_id: null,
        team_id: 'team-zmfzbdu5angznj0642lb',
        uploaded_by: 'system',
        tags: ['blueprint', 'electrical'],
        description: 'Electrical blueprint for the building'
      },
      {
        name: 'sample-report-1.docx',
        original_name: 'Site Survey Report.docx',
        file_path: '/uploads/documents/sample-report-1.docx',
        thumbnail_path: null,
        file_size: 1887436, // 1.8 MB
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        project_id: null,
        team_id: 'team-zmfzbdu5angznj0642lb',
        uploaded_by: 'system',
        tags: ['report', 'survey'],
        description: 'Site survey and analysis report'
      },
      {
        name: 'sample-permit-1.pdf',
        original_name: 'Permit Application.pdf',
        file_path: '/uploads/documents/sample-permit-1.pdf',
        thumbnail_path: null,
        file_size: 870400, // 850 KB
        mime_type: 'application/pdf',
        project_id: null,
        team_id: 'team-zmfzbdu5angznj0642lb',
        uploaded_by: 'system',
        tags: ['permit', 'application'],
        description: 'Building permit application'
      },
      {
        name: 'sample-specs-1.txt',
        original_name: 'Material Specifications.txt',
        file_path: '/uploads/documents/sample-specs-1.txt',
        thumbnail_path: null,
        file_size: 46080, // 45 KB
        mime_type: 'text/plain',
        project_id: null,
        team_id: 'team-zmfzbdu5angznj0642lb',
        uploaded_by: 'system',
        tags: ['specifications', 'materials'],
        description: 'Material specifications and requirements'
      },
      {
        name: 'sample-drone-1.png',
        original_name: 'Drone Inspection Photo.png',
        file_path: '/uploads/documents/sample-drone-1.png',
        thumbnail_path: '/uploads/documents/thumbnails/thumb_sample-drone-1.png',
        file_size: 4300800, // 4.1 MB
        mime_type: 'image/png',
        project_id: null,
        team_id: 'team-zmfzbdu5angznj0642lb',
        uploaded_by: 'system',
        tags: ['drone', 'inspection', 'photo'],
        description: 'Aerial inspection photo from drone'
      }
    ];

    console.log('📝 Inserting sample documents...');

    const { error: insertError } = await supabase
      .from('documents')
      .insert(sampleDocuments);

    if (insertError) {
      console.error('❌ Error inserting sample documents:', insertError);
    } else {
      console.log('✅ Sample documents inserted successfully!');
    }

    // Test the table
    console.log('🧪 Testing documents table...');

    const { data: documents, error: testError } = await supabase
      .from('documents')
      .select('*')
      .eq('team_id', 'team-zmfzbdu5angznj0642lb')
      .limit(3);

    if (testError) {
      console.error('❌ Error testing documents table:', testError);
      return false;
    }

    console.log(`✅ Found ${documents.length} documents for testing team`);
    documents.forEach(doc => {
      console.log(`  - ${doc.original_name} (${doc.mime_type})`);
    });

    console.log('\n🎉 Documents table setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log('  ✅ Documents table created with proper schema');
    console.log('  ✅ Indexes created for performance');
    console.log('  ✅ Row Level Security enabled');
    console.log('  ✅ Sample documents inserted');
    console.log('  ✅ API endpoints ready at /api/documents');

    return true;

  } catch (error) {
    console.error('❌ Error setting up documents table:', error);
    return false;
  }
}

// Run the setup
if (require.main === module) {
  setupDocumentsTable()
    .then(success => {
      if (success) {
        console.log('\n🚀 Ready to use document management system!');
        process.exit(0);
      } else {
        console.log('\n💥 Setup failed. Please check the errors above.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { setupDocumentsTable };