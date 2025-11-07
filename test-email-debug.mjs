import { Resend } from 'resend';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const apiKey = process.env.RESEND_API_KEY;
console.log('🔍 Full Debug Information\n');
console.log('API Key Length:', apiKey?.length || 0);
console.log('API Key Starts With:', apiKey?.substring(0, 10) || 'MISSING');
console.log('API Key:', apiKey ? '✅ Present' : '❌ Missing');
console.log('From Email:', process.env.RESEND_FROM_EMAIL);
console.log('');

const resend = new Resend(apiKey);

async function testEmail() {
  try {
    console.log('📤 Attempting to send email...\n');

    const result = await resend.emails.send({
      from: 'HomeQuest Tech <noreply@homequesttech.com>',
      to: 'kenwhite2015@gmail.com',
      subject: '✅ HomeQuest Email Test - Working!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%); color: white; padding: 40px; border-radius: 12px; text-align: center;">
            <h1 style="margin: 0; font-size: 48px;">✅</h1>
            <h2 style="margin: 10px 0;">Email Working!</h2>
            <p style="margin: 0;">HomeQuest Tech</p>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 12px; margin-top: 20px;">
            <h3>🎉 Success!</h3>
            <p>Your HomeQuest Tech email system is now fully operational.</p>
            <p><strong>You can now send:</strong></p>
            <ul>
              <li>Vendor bid requests</li>
              <li>Team invitations</li>
              <li>Project notifications</li>
              <li>AI-generated emails</li>
            </ul>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #6b7280;">
            <p><strong>HomeQuest Tech</strong> - Where Land Meets Logic</p>
          </div>
        </div>
      `
    });

    console.log('📋 Full Response from Resend:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    if (result.data) {
      console.log('✅ Success! Email ID:', result.data.id);
      console.log('Check your inbox at kenwhite2015@gmail.com');
    } else if (result.error) {
      console.error('❌ Error from Resend:', result.error);
    }
  } catch (error) {
    console.error('❌ Exception caught:', error.message);
    console.error('');
    console.error('Full error object:');
    console.error(error);
  }
}

testEmail();
