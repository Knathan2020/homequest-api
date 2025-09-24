/**
 * Autonomous Email Classification Service
 * Determines autonomy tier and context for construction emails
 */

import { Email } from '../types/email.types';

export interface EmailContext {
  project_phase: 'planning' | 'construction' | 'closeout' | 'unknown';
  stakeholder_type: 'vendor' | 'client' | 'inspector' | 'team' | 'unknown';
  content_category: 'safety' | 'financial' | 'schedule' | 'technical' | 'routine' | 'legal';
  urgency_level: 'low' | 'medium' | 'high' | 'critical';
  contract_value?: number;
  confidence_score: number;
}

export interface AutonomyTier {
  tier: 1 | 2 | 3;
  confidence_threshold: number;
  requires_approval: boolean;
  auto_response_allowed: boolean;
  escalation_required: boolean;
  reasoning: string[];
}

export interface ClassificationResult {
  context: EmailContext;
  autonomy_tier: AutonomyTier;
  suggested_actions: string[];
  risk_factors: string[];
}

class AutonomousEmailClassifier {

  // Safety-related keywords that always escalate to Tier 3
  private readonly SAFETY_KEYWORDS = [
    'accident', 'injury', 'osha', 'violation', 'safety', 'hazard', 'dangerous',
    'stop work', 'emergency', 'unsafe', 'incident', 'fall', 'electrical hazard',
    'chemical spill', 'fire', 'explosion', 'asbestos', 'lead paint'
  ];

  // Financial keywords that trigger Tier 2 or 3
  private readonly FINANCIAL_KEYWORDS = [
    'change order', 'cost', 'price', 'payment', 'invoice', 'quote', 'bid',
    'contract', 'budget', 'overrun', 'additional cost', 'credit', 'refund',
    'penalty', 'liquidated damages', 'retention', 'lien'
  ];

  // Legal keywords that always escalate to Tier 3
  private readonly LEGAL_KEYWORDS = [
    'lawsuit', 'legal', 'attorney', 'lawyer', 'dispute', 'arbitration',
    'mediation', 'breach', 'violation', 'cease and desist', 'subpoena',
    'court', 'settlement', 'damages', 'liability'
  ];

  // Routine keywords that can be Tier 1
  private readonly ROUTINE_KEYWORDS = [
    'confirmation', 'received', 'delivered', 'scheduled', 'status update',
    'photos', 'progress report', 'daily report', 'weather', 'material list',
    'delivery confirmation', 'inspection passed'
  ];

  // Urgent keywords that increase priority
  private readonly URGENCY_KEYWORDS = [
    'urgent', 'asap', 'immediate', 'emergency', 'rush', 'critical',
    'deadline', 'late', 'behind schedule', 'delay'
  ];

  /**
   * Main classification method
   */
  async classifyEmail(email: any, projectContext?: any): Promise<ClassificationResult> {
    console.log('🤖 Classifying email:', { subject: email.subject, from: email.fromEmail });

    const context = await this.analyzeEmailContext(email, projectContext);
    const autonomyTier = this.determineAutonomyTier(email, context);
    const suggestedActions = this.generateSuggestedActions(context, autonomyTier);
    const riskFactors = this.identifyRiskFactors(email, context);

    const result: ClassificationResult = {
      context,
      autonomy_tier: autonomyTier,
      suggested_actions: suggestedActions,
      risk_factors: riskFactors
    };

    console.log('✅ Classification complete:', {
      tier: result.autonomy_tier.tier,
      category: result.context.content_category,
      confidence: result.context.confidence_score
    });

    return result;
  }

  /**
   * Analyze email content and context
   */
  private async analyzeEmailContext(email: any, projectContext?: any): Promise<EmailContext> {
    const content = `${email.subject || ''} ${email.bodyText || ''}`.toLowerCase();

    // Analyze content category
    const content_category = this.categorizeContent(content);

    // Determine stakeholder type
    const stakeholder_type = this.identifyStakeholder(email, content);

    // Assess urgency
    const urgency_level = this.assessUrgency(content);

    // Determine project phase (if project context available)
    const project_phase = this.determineProjectPhase(content, projectContext);

    // Extract contract value if mentioned
    const contract_value = this.extractContractValue(content);

    // Calculate confidence score
    const confidence_score = this.calculateConfidenceScore(content, email);

    return {
      project_phase,
      stakeholder_type,
      content_category,
      urgency_level,
      contract_value,
      confidence_score
    };
  }

  /**
   * Categorize email content
   */
  private categorizeContent(content: string): EmailContext['content_category'] {
    if (this.containsKeywords(content, this.SAFETY_KEYWORDS)) {
      return 'safety';
    }
    if (this.containsKeywords(content, this.LEGAL_KEYWORDS)) {
      return 'legal';
    }
    if (this.containsKeywords(content, this.FINANCIAL_KEYWORDS)) {
      return 'financial';
    }
    if (content.includes('schedule') || content.includes('timeline') || content.includes('deadline')) {
      return 'schedule';
    }
    if (content.includes('spec') || content.includes('drawing') || content.includes('plan') ||
        content.includes('technical') || content.includes('measurement')) {
      return 'technical';
    }
    return 'routine';
  }

  /**
   * Identify stakeholder type from email
   */
  private identifyStakeholder(email: any, content: string): EmailContext['stakeholder_type'] {
    const fromEmail = email.fromEmail?.toLowerCase() || '';
    const fromName = email.fromName?.toLowerCase() || '';

    // Check for inspector keywords
    if (content.includes('inspection') || content.includes('inspector') ||
        fromName.includes('inspector') || fromName.includes('city') ||
        fromName.includes('county') || content.includes('permit')) {
      return 'inspector';
    }

    // Check for client indicators
    if (content.includes('homeowner') || content.includes('client') ||
        fromEmail.includes('gmail') || fromEmail.includes('yahoo') ||
        fromEmail.includes('hotmail')) {
      return 'client';
    }

    // Check for team indicators
    if (fromEmail.includes('homequest') || content.includes('team') ||
        fromName.includes('project manager') || fromName.includes('superintendent')) {
      return 'team';
    }

    // Default to vendor
    return 'vendor';
  }

  /**
   * Assess urgency level
   */
  private assessUrgency(content: string): EmailContext['urgency_level'] {
    if (this.containsKeywords(content, ['emergency', 'critical', 'stop work', 'accident'])) {
      return 'critical';
    }
    if (this.containsKeywords(content, ['urgent', 'asap', 'immediate', 'rush'])) {
      return 'high';
    }
    if (this.containsKeywords(content, ['deadline', 'soon', 'quickly', 'priority'])) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Determine project phase
   */
  private determineProjectPhase(content: string, projectContext?: any): EmailContext['project_phase'] {
    if (projectContext?.phase) {
      return projectContext.phase;
    }

    // Analyze content for phase indicators
    if (content.includes('permit') || content.includes('planning') || content.includes('design')) {
      return 'planning';
    }
    if (content.includes('foundation') || content.includes('framing') || content.includes('rough-in') ||
        content.includes('drywall') || content.includes('flooring')) {
      return 'construction';
    }
    if (content.includes('final inspection') || content.includes('walkthrough') || content.includes('punchlist')) {
      return 'closeout';
    }

    return 'unknown';
  }

  /**
   * Extract contract value from content
   */
  private extractContractValue(content: string): number | undefined {
    // Look for dollar amounts
    const dollarRegex = /\$[\d,]+(?:\.\d{2})?/g;
    const matches = content.match(dollarRegex);

    if (matches && matches.length > 0) {
      // Return the largest amount found
      const amounts = matches.map(m => parseFloat(m.replace(/[\$,]/g, '')));
      return Math.max(...amounts);
    }

    return undefined;
  }

  /**
   * Calculate confidence score for classification
   */
  private calculateConfidenceScore(content: string, email: any): number {
    let score = 0.5; // Base score

    // Higher confidence for clear indicators
    if (this.containsKeywords(content, this.SAFETY_KEYWORDS)) score += 0.3;
    if (this.containsKeywords(content, this.LEGAL_KEYWORDS)) score += 0.3;
    if (this.containsKeywords(content, this.FINANCIAL_KEYWORDS)) score += 0.2;
    if (this.containsKeywords(content, this.ROUTINE_KEYWORDS)) score += 0.2;

    // Confidence based on email completeness
    if (email.subject && email.subject.length > 5) score += 0.1;
    if (email.bodyText && email.bodyText.length > 50) score += 0.1;
    if (email.fromName && email.fromName.length > 0) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Determine autonomy tier based on analysis
   */
  private determineAutonomyTier(email: any, context: EmailContext): AutonomyTier {
    const reasoning: string[] = [];

    // Tier 3: Human-only (High Risk)
    if (context.content_category === 'safety') {
      reasoning.push('Safety-related content requires human oversight');
      return {
        tier: 3,
        confidence_threshold: 0.9,
        requires_approval: true,
        auto_response_allowed: false,
        escalation_required: true,
        reasoning
      };
    }

    if (context.content_category === 'legal') {
      reasoning.push('Legal content requires human review');
      return {
        tier: 3,
        confidence_threshold: 0.9,
        requires_approval: true,
        auto_response_allowed: false,
        escalation_required: true,
        reasoning
      };
    }

    if (context.contract_value && context.contract_value > 10000) {
      reasoning.push('High contract value requires human approval');
      return {
        tier: 3,
        confidence_threshold: 0.9,
        requires_approval: true,
        auto_response_allowed: false,
        escalation_required: true,
        reasoning
      };
    }

    if (context.urgency_level === 'critical') {
      reasoning.push('Critical urgency requires immediate human attention');
      return {
        tier: 3,
        confidence_threshold: 0.9,
        requires_approval: true,
        auto_response_allowed: false,
        escalation_required: true,
        reasoning
      };
    }

    // Tier 2: Auto-draft + Human Review (Medium Risk)
    if (context.content_category === 'financial') {
      reasoning.push('Financial content needs human review before sending');
      return {
        tier: 2,
        confidence_threshold: 0.7,
        requires_approval: true,
        auto_response_allowed: false,
        escalation_required: false,
        reasoning
      };
    }

    if (context.stakeholder_type === 'client' || context.stakeholder_type === 'inspector') {
      reasoning.push('Client/inspector communications need review');
      return {
        tier: 2,
        confidence_threshold: 0.7,
        requires_approval: true,
        auto_response_allowed: false,
        escalation_required: false,
        reasoning
      };
    }

    if (context.urgency_level === 'high') {
      reasoning.push('High urgency emails should be reviewed');
      return {
        tier: 2,
        confidence_threshold: 0.7,
        requires_approval: true,
        auto_response_allowed: false,
        escalation_required: false,
        reasoning
      };
    }

    if (context.confidence_score < 0.7) {
      reasoning.push('Low confidence score requires human review');
      return {
        tier: 2,
        confidence_threshold: 0.7,
        requires_approval: true,
        auto_response_allowed: false,
        escalation_required: false,
        reasoning
      };
    }

    // Tier 1: Fully Autonomous (Low Risk)
    reasoning.push('Routine communication can be handled autonomously');
    return {
      tier: 1,
      confidence_threshold: 0.5,
      requires_approval: false,
      auto_response_allowed: true,
      escalation_required: false,
      reasoning
    };
  }

  /**
   * Generate suggested actions based on classification
   */
  private generateSuggestedActions(context: EmailContext, tier: AutonomyTier): string[] {
    const actions: string[] = [];

    if (tier.tier === 1) {
      actions.push('Send automated acknowledgment');
      actions.push('Extract and file relevant data');
      actions.push('Update project status if applicable');
    }

    if (tier.tier === 2) {
      actions.push('Generate draft response');
      actions.push('Queue for human review');
      actions.push('Extract key information for review');
    }

    if (tier.tier === 3) {
      actions.push('Escalate to project manager immediately');
      actions.push('Flag for urgent attention');
      actions.push('Log as high-priority item');
    }

    // Context-specific actions
    if (context.content_category === 'schedule') {
      actions.push('Check calendar for conflicts');
      actions.push('Update project timeline');
    }

    if (context.content_category === 'technical') {
      actions.push('Extract measurements and specifications');
      actions.push('Cross-reference with project plans');
    }

    return actions;
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(email: any, context: EmailContext): string[] {
    const risks: string[] = [];

    if (context.content_category === 'safety') {
      risks.push('Safety implications require immediate attention');
    }

    if (context.contract_value && context.contract_value > 5000) {
      risks.push('Financial impact could affect project budget');
    }

    if (context.urgency_level === 'critical' || context.urgency_level === 'high') {
      risks.push('Time-sensitive response required');
    }

    if (context.stakeholder_type === 'inspector') {
      risks.push('Regulatory compliance implications');
    }

    if (context.confidence_score < 0.6) {
      risks.push('Low confidence in classification accuracy');
    }

    return risks;
  }

  /**
   * Helper method to check for keywords
   */
  private containsKeywords(content: string, keywords: string[]): boolean {
    return keywords.some(keyword => content.includes(keyword.toLowerCase()));
  }
}

export default new AutonomousEmailClassifier();