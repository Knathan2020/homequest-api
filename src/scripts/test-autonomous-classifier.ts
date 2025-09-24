/**
 * Test Script for Autonomous Email Classifier
 * Tests different email scenarios to validate classification logic
 */

import autonomousEmailClassifier from '../services/autonomous-email-classifier.service';

// Test emails representing different scenarios
const testEmails = [
  {
    id: 'test-1',
    subject: 'URGENT: Worker injured on site - need immediate response',
    fromEmail: 'supervisor@construction.com',
    fromName: 'Site Supervisor',
    bodyText: 'We had an accident on site today. Worker fell from scaffolding. OSHA will need to be notified. Please call immediately.',
    toEmails: ['manager@homequest.com'],
    receivedDate: new Date().toISOString(),
    sentDate: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    folder: 'inbox'
  },
  {
    id: 'test-2',
    subject: 'Change Order Request - Kitchen Upgrade ($15,000)',
    fromEmail: 'vendor@cabinets.com',
    fromName: 'ABC Cabinetry',
    bodyText: 'We need approval for additional kitchen cabinet upgrade. The total cost will be $15,000 above original quote. This includes premium wood and soft-close hardware.',
    toEmails: ['project@homequest.com'],
    receivedDate: new Date().toISOString(),
    sentDate: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    folder: 'inbox'
  },
  {
    id: 'test-3',
    subject: 'Material Delivery Confirmation - Lumber',
    fromEmail: 'delivery@lumber.com',
    fromName: 'Lumber Supply Co',
    bodyText: 'Your lumber order has been delivered to the job site at 123 Main St. Delivery completed at 2:30 PM. All materials accounted for.',
    toEmails: ['project@homequest.com'],
    receivedDate: new Date().toISOString(),
    sentDate: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    folder: 'inbox'
  },
  {
    id: 'test-4',
    subject: 'Final Inspection Failed - Electrical Issues',
    fromEmail: 'inspector@city.gov',
    fromName: 'City Building Inspector',
    bodyText: 'The final electrical inspection has failed. Several code violations found: 1) Missing GFCI outlets in bathroom 2) Improper grounding in basement 3) Overloaded circuit panel. Please correct and reschedule.',
    toEmails: ['contractor@homequest.com'],
    receivedDate: new Date().toISOString(),
    sentDate: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    folder: 'inbox'
  },
  {
    id: 'test-5',
    subject: 'Weekly Progress Report - Week 12',
    fromEmail: 'pm@homequest.com',
    fromName: 'Project Manager',
    bodyText: 'Week 12 progress summary: Drywall 90% complete, flooring started in master bedroom, plumbing rough-in passed inspection. On track for substantial completion by month end.',
    toEmails: ['client@homeowner.com'],
    receivedDate: new Date().toISOString(),
    sentDate: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    folder: 'sent'
  },
  {
    id: 'test-6',
    subject: 'Legal Notice - Stop Work Order',
    fromEmail: 'legal@city.gov',
    fromName: 'City Legal Department',
    bodyText: 'This is a formal stop work order due to permit violations. All construction activity must cease immediately until violations are resolved. Failure to comply may result in fines and legal action.',
    toEmails: ['contractor@homequest.com'],
    receivedDate: new Date().toISOString(),
    sentDate: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    folder: 'inbox'
  }
];

const testClassification = async () => {
  console.log('🧪 Testing Autonomous Email Classifier\n');
  console.log('='.repeat(60));

  for (const email of testEmails) {
    console.log(`\n📧 Testing Email: "${email.subject}"`);
    console.log(`From: ${email.fromName} <${email.fromEmail}>`);

    try {
      const result = await autonomousEmailClassifier.classifyEmail(email);

      console.log(`\n🤖 Classification Results:`);
      console.log(`   Tier: ${result.autonomy_tier.tier}`);
      console.log(`   Category: ${result.context.content_category}`);
      console.log(`   Stakeholder: ${result.context.stakeholder_type}`);
      console.log(`   Urgency: ${result.context.urgency_level}`);
      console.log(`   Confidence: ${(result.context.confidence_score * 100).toFixed(1)}%`);
      console.log(`   Auto Response: ${result.autonomy_tier.auto_response_allowed ? '✅' : '❌'}`);
      console.log(`   Requires Approval: ${result.autonomy_tier.requires_approval ? '✅' : '❌'}`);
      console.log(`   Escalation Required: ${result.autonomy_tier.escalation_required ? '🚨' : '📋'}`);

      if (result.context.contract_value) {
        console.log(`   Contract Value: $${result.context.contract_value.toLocaleString()}`);
      }

      if (result.autonomy_tier.reasoning.length > 0) {
        console.log(`   Reasoning: ${result.autonomy_tier.reasoning[0]}`);
      }

      if (result.risk_factors.length > 0) {
        console.log(`   Risk Factors: ${result.risk_factors.join(', ')}`);
      }

      if (result.suggested_actions.length > 0) {
        console.log(`   Suggested Actions:`);
        result.suggested_actions.forEach(action => {
          console.log(`     • ${action}`);
        });
      }

    } catch (error) {
      console.error(`❌ Error classifying email: ${error}`);
    }

    console.log('\n' + '-'.repeat(60));
  }

  console.log('\n✅ Classification test complete!');
};

// Export for potential use in other tests
export { testEmails, testClassification };

// Run if called directly
if (require.main === module) {
  testClassification()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}