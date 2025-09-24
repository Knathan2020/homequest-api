const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://fbwmkkskdrvaipmkddwm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4MDEzODQsImV4cCI6MjA1MjM3NzM4NH0.sb_publishable_bWnGFTQS5Ycpr8TO6UG9VQ_UilM38QA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupCommunicationsTables() {
  console.log('🔧 Checking and setting up communications tables...\n');
  
  try {
    // First, test if communications table exists
    console.log('📊 Checking if communications table exists...');
    const { data: commData, error: commError } = await supabase
      .from('communications')
      .select('id')
      .limit(1);
    
    if (commError) {
      if (commError.code === '42P01') {
        console.log('❌ Communications table does not exist');
        console.log('   The table needs to be created manually in Supabase dashboard\n');
        
        console.log('📋 SQL to create the table:');
        console.log('----------------------------');
        console.log(`
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  vendor_id UUID,
  type VARCHAR(20) CHECK (type IN ('email', 'sms', 'call')),
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  from_address VARCHAR(255),
  to_address VARCHAR(255),
  subject TEXT,
  content TEXT,
  status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  ai_summary TEXT,
  ai_response TEXT,
  ai_category VARCHAR(100),
  urgency VARCHAR(20) DEFAULT 'low' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  appointment_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (development only)
CREATE POLICY "Public access to communications" ON communications
  FOR ALL 
  USING (true)
  WITH CHECK (true);
        `);
        console.log('----------------------------\n');
      } else {
        console.log('⚠️  Unexpected error checking communications table:', commError.message);
      }
    } else {
      console.log('✅ Communications table exists');
      
      // Get count of existing records
      const { count } = await supabase
        .from('communications')
        .select('*', { count: 'exact', head: true });
      
      console.log(`   Found ${count || 0} existing records\n`);
    }
    
    // Check appointments table
    console.log('📊 Checking if appointments table exists...');
    const { data: apptData, error: apptError } = await supabase
      .from('appointments')
      .select('id')
      .limit(1);
    
    if (apptError) {
      if (apptError.code === '42P01') {
        console.log('❌ Appointments table does not exist');
        console.log('   The table needs to be created manually in Supabase dashboard\n');
        
        console.log('📋 SQL to create the table:');
        console.log('----------------------------');
        console.log(`
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  vendor_id UUID,
  title VARCHAR(255),
  description TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  location VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_from_message_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (development only)
CREATE POLICY "Public access to appointments" ON appointments
  FOR ALL
  USING (true)
  WITH CHECK (true);
        `);
        console.log('----------------------------\n');
      } else {
        console.log('⚠️  Unexpected error checking appointments table:', apptError.message);
      }
    } else {
      console.log('✅ Appointments table exists');
      
      // Get count of existing records
      const { count } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });
      
      console.log(`   Found ${count || 0} existing records\n`);
    }
    
    // Instructions for manual setup
    if (commError || apptError) {
      console.log('\n⚠️  MANUAL SETUP REQUIRED:');
      console.log('============================');
      console.log('1. Go to your Supabase dashboard:');
      console.log('   https://supabase.com/dashboard/project/fbwmkkskdrvaipmkddwm');
      console.log('');
      console.log('2. Navigate to SQL Editor (left sidebar)');
      console.log('');
      console.log('3. Copy and run the SQL from:');
      console.log('   /workspaces/codespaces-blank/construction-platform/homequest-api/sql/create-communications-table.sql');
      console.log('');
      console.log('4. After running the SQL, refresh your application');
      console.log('============================\n');
    } else {
      console.log('✅ All required tables are set up and ready!');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return false;
  }
}

// Run the setup
setupCommunicationsTables().then(() => {
  console.log('✨ Check complete\n');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});