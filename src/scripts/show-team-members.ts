/**
 * Show all team members in the database
 * Run: npx ts-node src/scripts/show-team-members.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

async function showTeamMembers() {
  console.log('👥 Fetching Team Members...\n');
  
  try {
    // First check if table exists and get all data
    const { data: teamMembers, error } = await supabase
      .from('team_members')
      .select('*');
    
    if (error) {
      console.error('Error fetching team members:', error);
      return;
    }
    
    if (!teamMembers || teamMembers.length === 0) {
      console.log('No team members found in the database.');
      console.log('\nTo add team members:');
      console.log('1. Go to your frontend on port 3000');
      console.log('2. Navigate to Team Members section');
      console.log('3. Add Kentrill, Kyrsten, Jesus, Cristina, etc.');
      return;
    }
    
    console.log(`Found ${teamMembers.length} team members:\n`);
    console.log('━'.repeat(80));
    
    // Show raw data first to see structure
    console.log('Raw data structure:');
    console.log(JSON.stringify(teamMembers[0], null, 2));
    console.log('\n' + '━'.repeat(80));
    
    teamMembers.forEach((member, index) => {
      const name = member.name || member.full_name || member.first_name || 'Unknown';
      const phone = member.phone || member.phone_number || member.phoneNumber || 'Not set';
      console.log(`\n${index + 1}. ${name}`);
      console.log(`   📞 Phone: ${phone}`);
      console.log(`   ✉️  Email: ${member.email || 'Not set'}`);
      console.log(`   💼 Role: ${member.role || 'Not set'}`);
      console.log(`   🏢 Department: ${member.department || 'Not set'}`);
      console.log(`   🟢 Status: ${member.availability || member.status || 'available'}`);
      console.log(`   🆔 ID: ${member.id}`);
    });
    
    console.log('\n' + '━'.repeat(80));
    console.log('\n✅ These team members can receive transferred calls from the AI assistant.');
    console.log('\nWhen someone calls +16783253060 and asks for:');
    teamMembers.forEach(member => {
      const name = member.name || member.full_name || member.first_name || 'Unknown';
      const phone = member.phone || member.phone_number || member.phoneNumber || 'Not set';
      if (name !== 'Unknown') {
        console.log(`• "${name}" - AI will transfer to ${phone}`);
      }
    });
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

showTeamMembers();