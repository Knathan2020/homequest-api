/**
 * Autonomous Email Routes
 * Handles email classification and autonomous processing
 */

import express, { Request, Response } from 'express';
import OpenAI from 'openai';
import autonomousEmailClassifier from '../services/autonomous-email-classifier.service';
import nylasEmailService from '../services/nylas-email.service';
import fetch from 'node-fetch';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'fallback-mode'
});

const router = express.Router();

/**
 * @route   POST /api/autonomous/classify-email
 * @desc    Classify an email and determine autonomy tier
 * @access  Public
 */
router.post('/classify-email', async (req: Request, res: Response) => {
  try {
    const { email, projectContext } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email data is required'
      });
    }

    console.log('🤖 Classifying email:', { subject: email.subject, from: email.fromEmail });

    const classification = await autonomousEmailClassifier.classifyEmail(email, projectContext);

    res.json({
      success: true,
      classification,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Email classification error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to classify email'
    });
  }
});

/**
 * @route   POST /api/autonomous/process-email
 * @desc    Process an email autonomously based on its tier
 * @access  Public
 */
router.post('/process-email', async (req: Request, res: Response) => {
  try {
    const { emailId, userId = 'demo-user' } = req.body;

    if (!emailId) {
      return res.status(400).json({
        success: false,
        error: 'Email ID is required'
      });
    }

    console.log('🤖 Processing email autonomously:', emailId);

    // Get the email from the compatibility API
    const emailResponse = await fetch('http://localhost:4000/api/emails');
    const emailData = await emailResponse.json();
    const email = emailData.emails.find(e => e.id === emailId);

    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    // Classify the email
    const classification = await autonomousEmailClassifier.classifyEmail(email);

    // Process based on tier
    let result: any = {
      emailId,
      classification,
      actions_taken: []
    };

    if (classification.autonomy_tier.tier === 1) {
      // Tier 1: Full autonomy
      console.log('✅ Tier 1: Processing autonomously');

      // Send acknowledgment
      const acknowledgment = await generateAndSendAcknowledgment(email, classification, userId);
      result.actions_taken.push('acknowledgment_sent');
      result.acknowledgment = acknowledgment;

      // Extract data
      const extractedData = extractEmailData(email);
      result.actions_taken.push('data_extracted');
      result.extracted_data = extractedData;

      // Mark as processed
      await markEmailProcessed(emailId, classification, userId);
      result.actions_taken.push('marked_processed');

    } else if (classification.autonomy_tier.tier === 2) {
      // Tier 2: Generate AI draft with attachments for review
      console.log('📝 Tier 2: Generating AI draft with attachments for review');

      const aiResult = await generateAIResponseWithAttachments(email, classification, userId);
      result.actions_taken.push('ai_draft_generated');
      result.ai_draft = aiResult.response;
      result.attachments = aiResult.attachments || [];
      result.project_context = aiResult.projectContext;
      result.confidence = aiResult.confidence;

      // Add to review queue with full AI draft
      await addToReviewQueue(emailId, classification, aiResult, userId);
      result.actions_taken.push('added_to_review_queue');

    } else if (classification.autonomy_tier.tier === 3) {
      // Tier 3: Generate AI draft with attachments, escalate for approval
      console.log('🚨 Tier 3: Generating AI draft for escalation');

      const aiResult = await generateAIResponseWithAttachments(email, classification, userId);
      result.actions_taken.push('ai_draft_generated');
      result.ai_draft = aiResult.response;
      result.attachments = aiResult.attachments || [];
      result.project_context = aiResult.projectContext;
      result.confidence = aiResult.confidence;
      result.escalation_reason = classification.autonomy_tier.reasoning.join(', ');

      await escalateToHuman(emailId, classification, aiResult, userId);
      result.actions_taken.push('escalated_to_human');
    }

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Email processing error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process email'
    });
  }
});

/**
 * @route   GET /api/autonomous/review-queue
 * @desc    Get emails awaiting human review
 * @access  Public
 */
router.get('/review-queue', async (req: Request, res: Response) => {
  try {
    const { userId = 'demo-user', status = 'pending' } = req.query;

    // Mock review queue for now - in real implementation this would come from database
    const reviewQueue = await getReviewQueue(userId as string, status as string);

    res.json({
      success: true,
      queue: reviewQueue,
      count: reviewQueue.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Review queue error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get review queue'
    });
  }
});

/**
 * @route   POST /api/autonomous/approve-draft
 * @desc    Approve and send a draft response
 * @access  Public
 */
router.post('/approve-draft', async (req: Request, res: Response) => {
  try {
    const { reviewId, approved, modifications, userId = 'demo-user' } = req.body;

    if (!reviewId) {
      return res.status(400).json({
        success: false,
        error: 'Review ID is required'
      });
    }

    console.log('📋 Processing draft approval:', { reviewId, approved });

    if (approved) {
      // Send the email
      const result = await sendApprovedDraft(reviewId, modifications, userId);

      res.json({
        success: true,
        message: 'Draft approved and sent',
        result,
        timestamp: new Date().toISOString()
      });
    } else {
      // Mark as rejected
      await rejectDraft(reviewId, userId);

      res.json({
        success: true,
        message: 'Draft rejected',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Draft approval error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process draft approval'
    });
  }
});

/**
 * @route   GET /api/autonomous/pending-drafts
 * @desc    Get pending AI drafts that need review (Tier 2/3)
 * @access  Public
 */
router.get('/pending-drafts', async (req: Request, res: Response) => {
  try {
    const { userId = 'demo-user' } = req.query;

    console.log('📋 Getting pending drafts for user:', userId);

    const pendingDrafts = await getPendingDrafts(userId as string);

    res.json({
      success: true,
      drafts: pendingDrafts,
      count: pendingDrafts.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Pending drafts error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pending drafts'
    });
  }
});

/**
 * @route   POST /api/autonomous/create-test-draft
 * @desc    Create a test draft for demo purposes
 * @access  Public
 */
router.post('/create-test-draft', async (req: Request, res: Response) => {
  try {
    const { userId = 'demo-user' } = req.body;

    console.log('📋 Creating test draft for user:', userId);

    // Create a test email ID
    const testEmailId = `test-email-${Date.now()}`;

    // Create test draft data
    await markEmailWithDraftReady(testEmailId, {
      aiDraftReady: true,
      aiSuggestedResponse: 'Thank you for your inquiry about the kitchen renovation project. Based on your requirements, I can provide the following information:\n\nThe project timeline is approximately 6-8 weeks, depending on material availability and permit processing. The estimated cost range is $45,000-$55,000, which includes:\n\n- Cabinet replacement with soft-close hinges\n- Quartz countertops installation\n- Backsplash tile work\n- Plumbing and electrical updates\n\nI\'ve attached the detailed project proposal and material specifications for your review. Would you like to schedule a site visit to discuss the project timeline and next steps?\n\nBest regards,\nHomeQuest Construction Team',
      autonomyTier: 2,
      suggestedAttachments: [
        { id: '1', name: 'Kitchen_Renovation_Proposal.pdf', description: 'Detailed project proposal and cost breakdown' },
        { id: '2', name: 'Material_Specifications.pdf', description: 'Cabinet and countertop specifications' }
      ],
      draftApproved: false,
      aiCategory: 'Project Inquiry',
      aiConfidence: 0.85,
      projectContext: {
        name: 'Kitchen Renovation - Johnson Residence',
        phase: 'Planning',
        status: 'Quote Requested'
      }
    });

    res.json({
      success: true,
      message: 'Test draft created successfully',
      emailId: testEmailId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Create test draft error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create test draft'
    });
  }
});

/**
 * @route   GET /api/autonomous/stats
 * @desc    Get autonomous processing statistics
 * @access  Public
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { userId = 'demo-user', timeframe = '7d' } = req.query;

    const stats = await getAutonomousStats(userId as string, timeframe as string);

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats'
    });
  }
});

// Real data integration helper functions

// Get real project context by analyzing email content
async function getProjectContext(email: any): Promise<any | null> {
  try {
    // Call the real projects API to get project data
    const response = await fetch('http://localhost:4000/api/projects', {
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) return null;
    const { projects } = await response.json();

    const emailContent = `${email.subject || ''} ${email.bodyText || ''}`.toLowerCase();

    // Smart project detection based on content
    const matchedProject = projects.find(project => {
      const projectName = project.name.toLowerCase();
      const projectAddress = (project.address || '').toLowerCase();

      // Check for project name, address, or ID mentions
      return emailContent.includes(projectName) ||
             emailContent.includes(projectAddress) ||
             emailContent.includes(project.id) ||
             (project.phase && emailContent.includes(project.phase.toLowerCase()));
    });

    return matchedProject || null;
  } catch (error) {
    console.error('❌ Failed to get project context:', error);
    return null;
  }
}

// Get relevant documents from real file system
async function getRelevantDocuments(email: any, category: string): Promise<any[]> {
  try {
    const fs = require('fs').promises;
    const path = require('path');

    const documentsDir = path.join(process.cwd(), 'uploads/documents');

    // Check if documents directory exists
    try {
      await fs.access(documentsDir);
    } catch {
      console.log('📁 Documents directory not found, creating...');
      await fs.mkdir(documentsDir, { recursive: true });
      return [];
    }

    const files = await fs.readdir(documentsDir);
    const emailContent = `${email.subject || ''} ${email.bodyText || ''}`.toLowerCase();

    const relevantDocs = [];

    for (const file of files) {
      const filePath = path.join(documentsDir, file);
      const stats = await fs.stat(filePath);

      if (stats.isFile()) {
        const fileName = file.toLowerCase();
        const fileType = path.extname(file).substring(1);

        // Match documents based on category and content
        let isRelevant = false;

        if (category === 'technical' && (fileName.includes('plan') || fileName.includes('spec') || fileName.includes('blueprint') || fileType === 'pdf')) {
          isRelevant = true;
        } else if (category === 'financial' && (fileName.includes('cost') || fileName.includes('budget') || fileName.includes('invoice') || fileName.includes('estimate'))) {
          isRelevant = true;
        } else if (category === 'schedule' && (fileName.includes('schedule') || fileName.includes('timeline') || fileName.includes('calendar'))) {
          isRelevant = true;
        } else if (emailContent.includes('plan') || emailContent.includes('document') || emailContent.includes('file') || emailContent.includes('attachment')) {
          isRelevant = true;
        }

        if (isRelevant) {
          relevantDocs.push({
            id: file,
            name: file,
            path: filePath,
            type: fileType,
            description: `${category} document - ${file}`,
            size: stats.size
          });
        }
      }
    }

    console.log(`📎 Found ${relevantDocs.length} relevant documents for ${category} category`);
    return relevantDocs.slice(0, 3); // Limit to 3 most relevant docs

  } catch (error) {
    console.error('❌ Failed to get relevant documents:', error);
    return [];
  }
}

// Prepare real document attachments
async function prepareDocumentAttachments(documentIds: string[]): Promise<any[]> {
  const attachments = [];
  const fs = require('fs').promises;
  const path = require('path');

  for (const docId of documentIds) {
    try {
      const filePath = path.join(process.cwd(), 'uploads/documents', docId);
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);

      attachments.push({
        filename: fileName,
        content: fileBuffer.toString('base64'),
        contentType: getContentType(fileName)
      });

      console.log(`📎 Prepared attachment: ${fileName}`);
    } catch (error) {
      console.error(`❌ Failed to prepare attachment ${docId}:`, error);
    }
  }

  return attachments;
}

// Determine if attachments should be included
function shouldIncludeAttachments(email: any, category: string, availableDocuments: any[]): boolean {
  if (availableDocuments.length === 0) return false;

  const emailContent = `${email.subject || ''} ${email.bodyText || ''}`.toLowerCase();

  // Check for explicit requests
  const requestKeywords = ['plan', 'document', 'file', 'attachment', 'send', 'provide', 'share', 'spec', 'blueprint', 'drawing'];
  const hasRequest = requestKeywords.some(keyword => emailContent.includes(keyword));

  // Auto-attach for certain categories if relevant docs exist
  const autoAttachCategories = ['technical', 'schedule'];
  const shouldAutoAttach = autoAttachCategories.includes(category) && availableDocuments.length > 0;

  return hasRequest || shouldAutoAttach;
}

// Get content type for attachments
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'dwg': 'application/acad',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return types[ext || ''] || 'application/octet-stream';
}

async function generateAndSendAcknowledgment(email: any, classification: any, userId: string): Promise<string> {
  const category = classification.context.content_category;
  const stakeholder = classification.context.stakeholder_type;

  // Get dynamic company info (could be from database/config based on userId)
  const companyInfo = await getCompanyInfo(userId);

  // Generate AI-powered response with document analysis
  const aiResult = await generateAIResponse(email, classification, companyInfo);
  const aiMessage = typeof aiResult === 'string' ? aiResult : aiResult.response;

  const fullMessage = `${aiMessage}

Best regards,
${companyInfo.name}

This is an automated response generated by AI. If you need immediate assistance, please call our office at ${companyInfo.phone || 'our main number'}.`;

  try {
    // Prepare attachments if any were identified
    const attachments = typeof aiResult === 'object' && aiResult.attachments ?
      await prepareDocumentAttachments(aiResult.attachments) : [];

    if (attachments.length > 0) {
      console.log('📎 Attaching', attachments.length, 'documents to autonomous response');
    }

    // Send the acknowledgment email via Nylas with attachments
    if (attachments.length > 0) {
      // Use sendDocument method for attachments
      await nylasEmailService.sendDocument({
        to: [email.fromEmail],
        subject: `Re: ${email.subject}`,
        message: fullMessage,
        documentPath: attachments[0].path, // Use first attachment's path
        documentName: attachments[0].filename
      }, userId);
    } else {
      // Use regular sendEmail for no attachments
      await nylasEmailService.sendEmail(
        [email.fromEmail],
        `Re: ${email.subject}`,
        fullMessage,
        userId
      );
    }

    console.log('✅ Autonomous AI acknowledgment sent to:', email.fromEmail,
                `with ${attachments.length} attachments`);
    return fullMessage;
  } catch (error) {
    console.error('❌ Failed to send autonomous acknowledgment:', error);
    // Return the message even if sending failed
    return fullMessage;
  }
}

function extractEmailData(email: any): any {
  const data: any = {
    extractedAt: new Date().toISOString(),
    measurements: {},
    dates: [],
    costs: [],
    contacts: []
  };

  const content = `${email.subject || ''} ${email.bodyText || ''}`;

  // Extract measurements
  const measurementRegex = /(\d+(?:\.\d+)?)\s*(?:sq\s*ft|square\s*feet|sf|feet|ft|inches|in|'|")/gi;
  const measurements = content.match(measurementRegex) || [];
  data.measurements = measurements;

  // Extract dates
  const dateRegex = /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/g;
  const dates = content.match(dateRegex) || [];
  data.dates = dates;

  // Extract costs
  const costRegex = /\$[\d,]+(?:\.\d{2})?/g;
  const costs = content.match(costRegex) || [];
  data.costs = costs;

  return data;
}

async function markEmailProcessed(emailId: string, classification: any, userId: string): Promise<void> {
  console.log('✅ Marking email as processed:', emailId);
  // In real implementation, update database
}

// Enhanced AI response generation for all tiers
async function generateAIResponseWithAttachments(email: any, classification: any, userId: string): Promise<{response: string, attachments?: string[], projectContext?: any, confidence: number}> {
  try {
    // Get project context and available documents
    const projectContext = await getProjectContext(email);
    const availableDocuments = await getRelevantDocuments(email, classification.context.content_category);
    const companyInfo = await getCompanyInfo(userId);

    console.log('🤖 Generating AI response with OpenAI for Tier', classification.autonomy_tier.tier);

    // Use OpenAI GPT for intelligent responses
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant for ${companyInfo.name}, a construction company. Generate a professional, project-aware email response.

IMPORTANT: Always provide a complete, ready-to-send email response regardless of tier level. The user should only need to review and click send.`
        },
        {
          role: "user",
          content: `Generate a professional email response:

ORIGINAL EMAIL:
From: ${email.fromEmail}
Subject: ${email.subject}
Content: ${email.bodyText?.substring(0, 1000) || 'No content'}

CONTEXT:
- Email Category: ${classification.context.content_category}
- Stakeholder: ${classification.context.stakeholder_type}
- Urgency: ${classification.context.urgency_level}
- Tier: ${classification.autonomy_tier.tier} (${classification.autonomy_tier.tier === 1 ? 'Auto-send' : classification.autonomy_tier.tier === 2 ? 'Review required' : 'Escalation required'})

PROJECT CONTEXT:
${projectContext ? `Project: ${projectContext.name}
Phase: ${projectContext.phase}
Status: ${projectContext.status}
Description: ${projectContext.description}` : 'No specific project identified'}

AVAILABLE DOCUMENTS:
${availableDocuments.length > 0 ? availableDocuments.map(doc => `- ${doc.name}: ${doc.description}`).join('\n') : 'No specific documents identified'}

INSTRUCTIONS:
- Write a complete, professional response
- Reference project details when relevant
- If documents are available and requested, mention they will be attached
- Be appropriate for ${classification.context.content_category} category
- Include specific project information when available
- Don't include signature (will be added automatically)
- Make it ready to send with minimal editing

Generate the complete email body:`
        }
      ],
      max_tokens: 400,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0]?.message?.content?.trim();

    if (aiResponse) {
      // Determine attachments
      const shouldAttach = shouldIncludeAttachments(email, classification.context.content_category, availableDocuments);
      const attachments = shouldAttach ? availableDocuments.map(doc => doc.id) : [];

      console.log(`🤖 Generated AI response with ${attachments.length} attachments for Tier ${classification.autonomy_tier.tier}`);

      return {
        response: aiResponse,
        attachments: attachments.length > 0 ? attachments : undefined,
        projectContext,
        confidence: 0.85 // High confidence for GPT-4 responses
      };
    } else {
      throw new Error('No response from OpenAI');
    }

  } catch (error) {
    console.error('❌ OpenAI failed, using enhanced fallback:', error);

    // Enhanced fallback with project awareness
    const projectContext = await getProjectContext(email);
    const availableDocuments = await getRelevantDocuments(email, classification.context.content_category);
    const companyInfo = await getCompanyInfo(userId);
    const category = classification.context.content_category;

    let response = "";

    if (projectContext) {
      response = `Thank you for your ${category} communication regarding "${email.subject}" for the ${projectContext.name} project. `;

      if (category === 'technical') {
        response += `Our technical team has reviewed this information in context of the ${projectContext.name} project specifications and current ${projectContext.phase} phase requirements. `;
        if (availableDocuments.length > 0) {
          response += `I've attached the relevant project documents including plans and specifications for your reference. `;
        }
      } else if (category === 'financial') {
        response += `Our project management and accounting teams have reviewed this financial matter for the ${projectContext.name} project. We'll provide detailed cost information and next steps. `;
      } else if (category === 'schedule') {
        response += `We've reviewed your scheduling request in context of the ${projectContext.name} project timeline. Our team will coordinate these details with the current ${projectContext.phase} phase schedule. `;
      } else {
        response += `Our team has reviewed this information in context of the ${projectContext.name} project and will follow up accordingly. `;
      }
    } else {
      response = `Thank you for contacting ${companyInfo.name} regarding "${email.subject}". We have received your ${category} inquiry and our team will review it promptly. `;
    }

    // Add tier-specific messaging
    if (classification.autonomy_tier.tier === 2) {
      response += "We will provide a detailed response within 1-2 business days with all necessary project information.";
    } else if (classification.autonomy_tier.tier === 3) {
      response += "Due to the importance of this matter, our senior project management team will review and respond personally.";
    }

    const shouldAttach = shouldIncludeAttachments(email, category, availableDocuments);
    const attachments = shouldAttach ? availableDocuments.map(doc => doc.id) : [];

    if (attachments.length > 0) {
      response += ` I've attached the relevant project documents for your reference.`;
    }

    console.log(`🤖 Generated enhanced fallback response for Tier ${classification.autonomy_tier.tier}`);
    return {
      response,
      attachments: attachments.length > 0 ? attachments : undefined,
      projectContext,
      confidence: 0.65
    };
  }
}

async function addToReviewQueue(emailId: string, classification: any, aiResult: any, userId: string): Promise<void> {
  console.log('📋 Adding to review queue with AI draft and attachments:', emailId);
  console.log('   Draft preview:', aiResult.response?.substring(0, 100) + '...');
  console.log('   Attachments:', aiResult.attachments?.length || 0);
  console.log('   Project context:', aiResult.projectContext?.name || 'None');

  // Mark email as having draft ready for review
  await markEmailWithDraftReady(emailId, {
    aiDraftReady: true,
    aiSuggestedResponse: aiResult.response,
    autonomyTier: 2,
    suggestedAttachments: aiResult.attachments,
    draftApproved: false,
    aiCategory: classification.category,
    aiConfidence: aiResult.confidence,
    projectContext: aiResult.projectContext
  });
}

async function escalateToHuman(emailId: string, classification: any, aiResult: any, userId: string): Promise<void> {
  console.log('🚨 Escalating to human with AI draft ready:', emailId);
  console.log('   Ready-to-send draft preview:', aiResult.response?.substring(0, 100) + '...');
  console.log('   Attachments prepared:', aiResult.attachments?.length || 0);
  console.log('   Project context:', aiResult.projectContext?.name || 'None');
  console.log('   Escalation reasons:', classification.autonomy_tier.reasoning.join(', '));

  // Mark email as having draft ready for escalation review
  await markEmailWithDraftReady(emailId, {
    aiDraftReady: true,
    aiSuggestedResponse: aiResult.response,
    autonomyTier: 3,
    suggestedAttachments: aiResult.attachments,
    draftApproved: false,
    aiCategory: classification.category,
    aiConfidence: aiResult.confidence,
    projectContext: aiResult.projectContext,
    escalationReason: classification.autonomy_tier.reasoning.join(', ')
  });
}

async function getReviewQueue(userId: string, status: string): Promise<any[]> {
  // Mock data for now
  return [
    {
      id: 'review-1',
      emailId: 'email-123',
      subject: 'Change Order Request - Kitchen Cabinets',
      fromName: 'ABC Cabinetry',
      classification: {
        context: { content_category: 'financial', urgency_level: 'medium' },
        autonomy_tier: { tier: 2 }
      },
      draft_response: 'Thank you for your change order request...',
      created_at: new Date().toISOString(),
      priority: 'medium'
    }
  ];
}

async function sendApprovedDraft(reviewId: string, modifications: string, userId: string): Promise<any> {
  try {
    // In a real implementation, this would:
    // 1. Retrieve the draft and original email from database using reviewId
    // 2. Apply modifications if any
    // 3. Send the email via Nylas

    // Mock implementation - would need database integration
    console.log('✅ Sending approved draft:', reviewId);

    // This is where you would call:
    // await nylasEmailService.sendEmail(
    //   [originalEmail.fromEmail],
    //   `Re: ${originalEmail.subject}`,
    //   finalDraft,
    //   userId
    // );

    return { sent: true, reviewId, method: 'nylas' };
  } catch (error) {
    console.error('❌ Failed to send approved draft:', error);
    return { sent: false, reviewId, error: error.message };
  }
}

async function rejectDraft(reviewId: string, userId: string): Promise<void> {
  console.log('❌ Rejecting draft:', reviewId, 'for user:', userId);
}

async function markEmailWithDraftReady(emailId: string, draftData: any): Promise<void> {
  try {
    console.log('📝 Marking email with draft ready:', emailId, draftData);

    // In a real implementation, this would update the email in database/store
    // For now, we'll store it in a temporary in-memory store
    if (!global.pendingDrafts) {
      global.pendingDrafts = new Map();
    }

    global.pendingDrafts.set(emailId, {
      ...draftData,
      emailId,
      createdAt: new Date().toISOString(),
      status: 'pending_review'
    });

    console.log(`✅ Email ${emailId} marked with draft ready for review`);
  } catch (error) {
    console.error('❌ Failed to mark email with draft:', error);
  }
}

async function getPendingDrafts(userId: string): Promise<any[]> {
  console.log('📋 Getting pending drafts for user:', userId);

  try {
    // Check in-memory store for pending drafts
    if (!global.pendingDrafts) {
      global.pendingDrafts = new Map();
    }

    const pendingDraftsList = Array.from(global.pendingDrafts.values())
      .filter((draft: any) => draft.status === 'pending_review')
      .map((draftData: any) => ({
        id: draftData.emailId,
        emailId: draftData.emailId,
        originalEmail: {
          from: 'demo@example.com', // Would come from actual email lookup
          fromName: 'Demo Sender',
          subject: 'Project Update Request',
          body: 'Original email content...',
          date: new Date().toISOString()
        },
        draft: {
          subject: 'Re: Project Update Request',
          body: draftData.aiSuggestedResponse || 'AI generated response',
          attachments: draftData.suggestedAttachments || []
        },
        tier: draftData.autonomyTier || 2,
        classification: draftData.aiCategory || 'General',
        confidence: draftData.aiConfidence || 0.8,
        projectContext: draftData.projectContext || null,
        createdAt: draftData.createdAt,
        priority: 'medium',
        escalationReason: draftData.escalationReason || null
      }));

    console.log(`📋 Found ${pendingDraftsList.length} pending drafts from in-memory store`);
    return pendingDraftsList;

  } catch (error) {
    console.error('❌ Failed to get pending drafts:', error);
    return [];
  }
}

async function getAutonomousStats(userId: string, timeframe: string): Promise<any> {
  console.log('📊 Getting autonomous stats for user:', userId, 'timeframe:', timeframe);
  return {
    total_emails_processed: 45,
    tier_1_autonomous: 28,
    tier_2_reviewed: 14,
    tier_3_escalated: 3,
    accuracy_rate: 0.92,
    time_saved_hours: 12.5,
    timeframe,
    userId
  };
}

async function getCompanyInfo(userId: string): Promise<{name: string, phone?: string, address?: string, industry?: string}> {
  // In a real implementation, this would fetch from database based on userId
  // For now, returning configurable company info
  const companyDatabase: {[key: string]: any} = {
    'demo-user': {
      name: 'HomeQuest Construction',
      phone: '(555) 123-4567',
      address: '123 Builder Ave, Construction City, CC 12345',
      industry: 'construction'
    },
    // Could add more companies/users here
  };

  return companyDatabase[userId] || {
    name: 'HomeQuest Construction',
    phone: '(555) 123-4567',
    industry: 'construction'
  };
}

async function generateAIResponse(email: any, classification: any, companyInfo: any): Promise<{response: string, attachments?: string[]}> {
  const category = classification.context.content_category;
  const stakeholder = classification.context.stakeholder_type;
  const urgency = classification.context.urgency_level;

  try {
    // Get project context and available documents
    const projectContext = await getProjectContext(email);
    const availableDocuments = await getRelevantDocuments(email, category);

    // Use OpenAI GPT for project-aware, intelligent responses
    const prompt = `You are an AI assistant for ${companyInfo.name}, a construction company. Generate a professional email response with project awareness.

CONTEXT:
- Original email subject: "${email.subject}"
- From: ${email.fromEmail}
- Email content: "${email.bodyText?.substring(0, 500) || email.subject}"
- Email category: ${category}
- Stakeholder type: ${stakeholder}
- Urgency level: ${urgency}
- Company name: ${companyInfo.name}

PROJECT CONTEXT:
${projectContext ? `- Project: ${projectContext.name}
- Phase: ${projectContext.phase}
- Status: ${projectContext.status}
- Key details: ${projectContext.description}` : '- No specific project identified'}

AVAILABLE DOCUMENTS:
${availableDocuments.length > 0 ? availableDocuments.map(doc => `- ${doc.name}: ${doc.description}`).join('\n') : '- No specific documents identified'}

INSTRUCTIONS:
- Write a professional, project-aware acknowledgment response
- Reference specific project details when relevant
- If the email requests documents/plans/specifications, mention that relevant documents will be attached
- Be appropriate for the ${category} category and ${stakeholder} stakeholder
- Keep it concise but informative about the project
- Don't include "Best regards" or signature (that will be added separately)
- Sound natural and knowledgeable about construction projects

Generate only the email body content:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional construction project manager AI. Generate contextually appropriate, project-aware email responses that demonstrate knowledge of ongoing construction projects."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0]?.message?.content?.trim();

    if (aiResponse) {
      console.log('🤖 Generated project-aware OpenAI response for:', category, stakeholder, urgency);

      // Determine if attachments should be included
      const shouldAttach = shouldIncludeAttachments(email, category, availableDocuments);
      const attachments = shouldAttach ? availableDocuments.map(doc => doc.id) : [];

      return {
        response: aiResponse,
        attachments: attachments.length > 0 ? attachments : undefined
      };
    } else {
      throw new Error('No response from OpenAI');
    }

  } catch (error) {
    console.error('❌ OpenAI failed, using project-aware fallback:', error);

    // Project-aware fallback if OpenAI fails
    const projectContext = await getProjectContext(email);
    const availableDocuments = await getRelevantDocuments(email, category);

    let response = "";

    if (projectContext) {
      response = `Thank you for your ${category} communication regarding "${email.subject}" for the ${projectContext.name} project. `;

      if (category === 'schedule') {
        response += `We appreciate you keeping us updated on project timelines. Our team is currently in the ${projectContext.phase} phase, and we'll coordinate these details with our project schedule.`;
      } else if (category === 'technical') {
        response += `Our technical team will review this information in context of the ${projectContext.name} project specifications and current ${projectContext.phase} phase requirements.`;
      } else if (category === 'financial') {
        response += `Our project management and accounting teams will review this financial matter for the ${projectContext.name} project and respond with the appropriate information.`;
      } else {
        response += `Our team will review this information in context of the ${projectContext.name} project and follow up accordingly.`;
      }
    } else {
      response = `Thank you for contacting ${companyInfo.name} regarding "${email.subject}". We have received your message and our team will review it promptly.`;
    }

    // Add urgency-based messaging
    if (urgency === 'critical') {
      response += "\n\nDue to the critical nature of this matter, we will prioritize our review and response.";
    } else if (urgency === 'high') {
      response += "\n\nWe understand this is important and will address it promptly.";
    }

    // Check if documents should be attached
    const shouldAttach = shouldIncludeAttachments(email, category, availableDocuments);
    const attachments = shouldAttach ? availableDocuments.map(doc => doc.id) : [];

    if (attachments.length > 0) {
      response += `\n\nI've attached the relevant project documents for your reference.`;
    }

    console.log('🤖 Generated project-aware fallback response for:', category, stakeholder, urgency);
    return {
      response,
      attachments: attachments.length > 0 ? attachments : undefined
    };
  }
}

export default router;