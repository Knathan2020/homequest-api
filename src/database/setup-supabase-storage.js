/**
 * Setup Supabase Storage and Database for Floor Plans
 * Run this script to create the necessary bucket and table
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupSupabase() {
  try {
    console.log('🚀 Setting up Supabase for floor plans...');

    // 1. Check if bucket exists, if not, try to create it
    console.log('📦 Checking storage bucket...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    const bucketExists = buckets?.some(b => b.name === 'floor-plans');
    
    if (!bucketExists) {
      const { data: bucket, error: bucketError } = await supabase.storage
        .createBucket('floor-plans', {
          public: true,
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
        });

      if (bucketError) {
        console.warn('⚠️  Could not create bucket (may need admin access):', bucketError.message);
        console.log('Please create the bucket manually in Supabase Dashboard');
      } else {
        console.log('✅ Storage bucket created: floor-plans');
      }
    } else {
      console.log('✅ Storage bucket already exists: floor-plans');
    }

    // 2. Test if table exists by trying to query it
    console.log('📊 Checking database table...');
    const { data: testTable, error: tableCheckError } = await supabase
      .from('floor_plans')
      .select('id')
      .limit(1);
    
    if (tableCheckError && tableCheckError.code === 'PGRST116') {
      console.log('❌ Table does not exist');
      console.log('\n📝 Please create the table manually in Supabase:');
      console.log('1. Go to Supabase Dashboard > SQL Editor');
      console.log('2. Run the following SQL:\n');
      console.log(`
        -- Create floor_plans table if it doesn't exist
        CREATE TABLE IF NOT EXISTS floor_plans (
          id TEXT PRIMARY KEY DEFAULT 'fp_' || extract(epoch from now())::text || '_' || substr(md5(random()::text), 1, 8),
          project_id TEXT NOT NULL,
          user_id TEXT,
          image_url TEXT,
          
          -- Floor plan data
          walls JSONB DEFAULT '[]',
          doors JSONB DEFAULT '[]',
          windows JSONB DEFAULT '[]',
          rooms JSONB DEFAULT '[]',
          stairs JSONB DEFAULT '[]',
          elevators JSONB DEFAULT '[]',
          annotations JSONB DEFAULT '[]',
          
          -- User modifications
          user_added_walls JSONB DEFAULT '[]',
          deleted_wall_indices JSONB DEFAULT '[]',
          
          -- Dimensions and metadata
          dimensions JSONB DEFAULT '{"width": 0, "height": 0}',
          metadata JSONB DEFAULT '{}',
          edits_history JSONB DEFAULT '[]',
          
          -- Timestamps
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Create indexes if they don't exist
        CREATE INDEX IF NOT EXISTS idx_floor_plans_project_id ON floor_plans(project_id);
        CREATE INDEX IF NOT EXISTS idx_floor_plans_user_id ON floor_plans(user_id);
        CREATE INDEX IF NOT EXISTS idx_floor_plans_created_at ON floor_plans(created_at DESC);
      `);
    } else {
      console.log('✅ Database table exists: floor_plans');
    }

    // 3. Test the setup
    console.log('🧪 Testing setup...');
    
    // Test table access
    const { data: testData, error: testError } = await supabase
      .from('floor_plans')
      .select('count')
      .limit(1);

    if (testError) {
      console.error('❌ Table test failed:', testError);
      console.log('\n⚠️  Please create the table manually in Supabase Dashboard:');
      console.log('1. Go to your Supabase Dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Run the SQL from create-floor-plans-table.sql');
    } else {
      console.log('✅ Table test successful');
    }

    // Test bucket access
    const { data: files, error: listFilesError } = await supabase.storage
      .from('floor-plans')
      .list('images', { limit: 1 });

    if (listFilesError) {
      console.error('❌ Bucket test failed:', listFilesError);
    } else {
      console.log('✅ Bucket test successful');
    }

    console.log('\n🎉 Supabase setup complete!');
    console.log('Floor plans will now be stored in Supabase for multi-user access.');

  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

setupSupabase();