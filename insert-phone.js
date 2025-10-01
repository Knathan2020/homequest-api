const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2ODI4MTcsImV4cCI6MjA2NzI1ODgxN30.-rBrI8a56Pc-5ROhiZaGtK6QwH1qrZOt7Osmj-lqeJc'
);

async function insertPhone() {
  try {
    // Check if phone already exists
    const { data: existing } = await supabase
      .from('team_phones')
      .select('*')
      .eq('team_id', '0101cf94-918a-46a6-9910-9f771d917506');

    console.log('Existing phones:', existing);

    if (existing && existing.length > 0) {
      console.log('Phone already exists, updating...');
      const { data, error } = await supabase
        .from('team_phones')
        .update({
          vapi_phone_id: '86d21bb9-4562-4fcf-a834-cbfdccc0de5f',
          twilio_number: '+18142610584',
          status: 'active'
        })
        .eq('team_id', '0101cf94-918a-46a6-9910-9f771d917506')
        .select();

      if (error) {
        console.error('Update error:', error);
      } else {
        console.log('✅ Phone updated successfully:', data);
      }
    } else {
      console.log('Adding new phone...');
      const { data, error } = await supabase
        .from('team_phones')
        .insert({
          team_id: '0101cf94-918a-46a6-9910-9f771d917506',
          team_name: 'HomeQuest Construction',
          owner_email: 'kentrill@yhshomes.com',
          twilio_number: '+18142610584',
          vapi_phone_id: '86d21bb9-4562-4fcf-a834-cbfdccc0de5f',
          default_voice_id: 'ewxUvnyvvOehYjKjUVKC',
          status: 'active'
        })
        .select();

      if (error) {
        console.error('Insert error:', error);
      } else {
        console.log('✅ Phone added successfully:', data);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

insertPhone();
