import { Resend } from 'resend';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  console.log('🧪 Testing Resend Email...\n');
  console.log('API Key:', process.env.RESEND_API_KEY ? '✅ Found' : '❌ Missing');
  console.log('From Email:', process.env.RESEND_FROM_EMAIL || 'noreply@send.homequesttech.com');
  console.log('To Email: kenwhite2015@gmail.com\n');

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'HomeQuest Tech <noreply@send.homequesttech.com>',
      to: 'kenwhite2015@gmail.com',
      subject: '✅ HomeQuest Email Test - Success!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%); color: white; padding: 40px; border-radius: 12px; text-align: center;">
            <h1 style="margin: 0; font-size: 36px;">✅</h1>
            <h2 style="margin: 10px 0;">Email Test Successful!</h2>
            <p style="margin: 0; opacity: 0.9;">HomeQuest Tech Email System</p>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 12px; margin-top: 20px;">
            <h3>🎉 Congratulations!</h3>
            <p>Your email system is working perfectly!</p>

            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #10B981; margin: 20px 0;">
              <h4 style="margin-top: 0;">Configuration Status:</h4>
              <p>✅ DNS Records Verified<br>
              ✅ SPF Authentication Passing<br>
              ✅ DKIM Signature Valid<br>
              ✅ Resend API Connected</p>
            </div>

            <p><strong>Your platform can now send:</strong></p>
            <ul>
              <li>Vendor bid requests</li>
              <li>Team member invitations</li>
              <li>Project notifications</li>
              <li>AI-generated emails</li>
            </ul>
          </div>

          <div style="text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px;">
            <p><strong>HomeQuest Tech</strong> - Where Land Meets Logic</p>
            <p>Test sent: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `
    });

    console.log('✅ Email sent successfully!');
    console.log('Email ID:', result.data?.id);
    console.log('\n💡 Check your inbox at kenwhite2015@gmail.com');
    console.log('   (Don\'t forget to check spam folder too!)\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
  }
}

testEmail();
