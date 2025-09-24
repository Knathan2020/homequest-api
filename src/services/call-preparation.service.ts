/**
 * Enhanced Call Preparation Service
 * Intelligently prepares AI context before making calls
 * Researches vendors, analyzes successful patterns, and customizes approach
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export interface VendorProfile {
  basic_info: {
    name: string;
    company: string;
    phone: string;
    email?: string;
    website?: string;
  };
  specializations: string[];
  experience_years?: number;
  typical_project_size?: string;
  preferred_communication_style?: 'direct' | 'relationship' | 'technical' | 'casual';
  availability_patterns?: {
    best_call_times: string[];
    timezone: string;
    busy_seasons: string[];
  };
  previous_interactions?: {
    last_contact: string;
    interaction_history: string[];
    success_rate: number;
    preferred_topics: string[];
  };
  competitive_position?: {
    price_range: 'budget' | 'mid-tier' | 'premium';
    unique_strengths: string[];
    typical_objections: string[];
  };
  project_fit_analysis?: {
    size_match: number; // 0-1 score
    specialty_match: number;
    timeline_compatibility: number;
    budget_alignment: number;
  };
}

export interface ProjectIntelligence {
  market_context: {
    similar_projects_in_area: number;
    current_demand_level: 'low' | 'medium' | 'high';
    seasonal_factors: string[];
    competitive_pressure: number;
  };
  urgency_indicators: {
    timeline_pressure: boolean;
    budget_constraints: boolean;
    external_deadlines: string[];
    client_priority_level: number;
  };
  value_propositions: {
    financial: string[];
    professional: string[];
    relationship: string[];
    project_specific: string[];
  };
  potential_objections: {
    common_concerns: string[];
    price_sensitivity: number;
    scheduling_conflicts: string[];
    scope_uncertainties: string[];
  };
}

export interface CallStrategy {
  approach_style: 'consultative' | 'direct' | 'relationship' | 'technical';
  opening_hook: string;
  key_talking_points: string[];
  objection_responses: { [key: string]: string };
  success_criteria: {
    primary_goal: string;
    secondary_goals: string[];
    minimum_success_threshold: string;
  };
  conversation_flow: {
    rapport_building: string[];
    project_introduction: string[];
    value_demonstration: string[];
    closing_strategy: string[];
  };
  personalization: {
    vendor_specific_references: string[];
    project_fit_highlights: string[];
    mutual_connections?: string[];
  };
}

export interface BuilderBriefing {
  // Main conversation focus
  primary_objective: string;
  conversation_topics: string[];
  key_messages: string[];

  // Project context
  project_highlights: string[];
  unique_selling_points: string[];
  urgency_factors: string[];

  // Vendor-specific approach
  approach_strategy: 'consultative' | 'direct' | 'relationship' | 'technical';
  pain_points_to_address: string[];
  value_propositions: string[];

  // Call flow guidance
  opening_approach: string;
  must_mention_points: string[];
  questions_to_ask: string[];
  success_metrics: string[];

  // Handling objections
  anticipated_objections: string[];
  objection_responses: { [key: string]: string };

  // Fallback strategies
  if_not_interested: string[];
  if_too_busy: string[];
  if_price_concerns: string[];
}

export interface EnhancedCallContext {
  vendor_profile: VendorProfile;
  project_intelligence: ProjectIntelligence;
  call_strategy: CallStrategy;
  builder_briefing?: BuilderBriefing; // NEW: Builder's specific instructions
  success_patterns: {
    what_works_with_similar_vendors: string[];
    timing_insights: string[];
    messaging_preferences: string[];
  };
  ai_personality: {
    tone: string;
    communication_style: string;
    authority_level: string;
    relationship_approach: string;
  };
  fallback_strategies: {
    if_no_answer: string[];
    if_not_interested: string[];
    if_price_objection: string[];
    if_timing_objection: string[];
  };
}

class CallPreparationService {
  /**
   * Main preparation method - analyzes vendor and project to create optimal call context
   */
  async prepareCallContext(params: {
    vendorId: string;
    vendorName: string;
    vendorCompany: string;
    vendorPhone: string;
    projectDetails: any;
    teamId: string;
    builderName: string;
    companyName: string;
    builderBriefing?: BuilderBriefing; // NEW: Optional builder briefing
  }): Promise<EnhancedCallContext> {
    console.log('🔍 Preparing enhanced call context for:', params.vendorName);
    if (params.builderBriefing) {
      console.log('📋 Using builder briefing with objective:', params.builderBriefing.primary_objective);
    }

    // Step 1: Build comprehensive vendor profile
    const vendorProfile = await this.buildVendorProfile(params);

    // Step 2: Analyze project intelligence and market context
    const projectIntelligence = await this.analyzeProjectIntelligence(params.projectDetails, params.teamId);

    // Step 3: Develop call strategy (enhanced with builder briefing)
    const callStrategy = await this.developCallStrategy(
      vendorProfile,
      projectIntelligence,
      params.projectDetails,
      params.builderBriefing
    );

    // Step 4: Extract success patterns from historical data
    const successPatterns = await this.analyzeSuccessPatterns(vendorProfile, params.projectDetails);

    // Step 5: Configure AI personality for this specific call (influenced by briefing)
    const aiPersonality = this.configureAIPersonality(vendorProfile, callStrategy, params.builderBriefing);

    // Step 6: Prepare fallback strategies (enhanced with builder input)
    const fallbackStrategies = await this.prepareFallbackStrategies(
      vendorProfile,
      projectIntelligence,
      params.builderBriefing
    );

    const context: EnhancedCallContext = {
      vendor_profile: vendorProfile,
      project_intelligence: projectIntelligence,
      call_strategy: callStrategy,
      builder_briefing: params.builderBriefing, // Include the briefing
      success_patterns: successPatterns,
      ai_personality: aiPersonality,
      fallback_strategies: fallbackStrategies
    };

    // Store context for post-call analysis
    await this.storeCallContext(params.vendorId, context);

    console.log('✅ Call context prepared with', context.call_strategy.key_talking_points.length, 'talking points');
    return context;
  }

  /**
   * Build comprehensive vendor profile
   */
  private async buildVendorProfile(params: any): Promise<VendorProfile> {
    // Get existing vendor data
    const { data: existingVendor } = await supabase
      .from('vendors')
      .select('*')
      .eq('phone', params.vendorPhone)
      .single();

    // Get interaction history
    const { data: interactions } = await supabase
      .from('conversation_transcripts')
      .select('*')
      .eq('vendor_phone', params.vendorPhone)
      .order('created_at', { ascending: false })
      .limit(5);

    // Analyze specializations from project history
    const specializations = this.inferSpecializations(existingVendor, interactions);

    // Determine communication preferences from past interactions
    const communicationStyle = this.analyzeCommunicationStyle(interactions);

    // Calculate project fit
    const projectFit = this.calculateProjectFit(existingVendor, params.projectDetails);

    return {
      basic_info: {
        name: params.vendorName,
        company: params.vendorCompany,
        phone: params.vendorPhone,
        email: existingVendor?.email,
        website: existingVendor?.website
      },
      specializations: specializations,
      experience_years: existingVendor?.years_in_business,
      typical_project_size: existingVendor?.typical_project_size,
      preferred_communication_style: communicationStyle,
      availability_patterns: {
        best_call_times: existingVendor?.preferred_contact_times || ['9:00 AM - 5:00 PM'],
        timezone: existingVendor?.timezone || 'EST',
        busy_seasons: existingVendor?.busy_seasons || []
      },
      previous_interactions: {
        last_contact: interactions?.[0]?.created_at,
        interaction_history: interactions?.map(i => i.result_summary).filter(Boolean) || [],
        success_rate: this.calculateSuccessRate(interactions),
        preferred_topics: this.extractPreferredTopics(interactions)
      },
      competitive_position: {
        price_range: existingVendor?.price_range || 'mid-tier',
        unique_strengths: existingVendor?.specialties || [],
        typical_objections: this.identifyCommonObjections(interactions)
      },
      project_fit_analysis: projectFit
    };
  }

  /**
   * Analyze project intelligence and market context
   */
  private async analyzeProjectIntelligence(projectDetails: any, teamId: string): Promise<ProjectIntelligence> {
    // Get similar projects for context
    const { data: similarProjects } = await supabase
      .from('projects')
      .select('*')
      .eq('team_id', teamId)
      .eq('project_type', projectDetails.type)
      .limit(10);

    // Analyze market demand
    const marketDemand = await this.analyzeMarketDemand(projectDetails);

    // Extract value propositions
    const valueProps = this.generateValuePropositions(projectDetails, similarProjects);

    // Predict potential objections
    const potentialObjections = await this.predictObjections(projectDetails, teamId);

    return {
      market_context: {
        similar_projects_in_area: similarProjects?.length || 0,
        current_demand_level: marketDemand.level,
        seasonal_factors: marketDemand.seasonal_factors,
        competitive_pressure: marketDemand.competitive_pressure
      },
      urgency_indicators: {
        timeline_pressure: this.assessTimelinePressure(projectDetails),
        budget_constraints: this.assessBudgetConstraints(projectDetails),
        external_deadlines: this.extractExternalDeadlines(projectDetails),
        client_priority_level: this.assessClientPriority(projectDetails)
      },
      value_propositions: valueProps,
      potential_objections: potentialObjections
    };
  }

  /**
   * Develop customized call strategy (enhanced with builder briefing)
   */
  private async developCallStrategy(
    vendor: VendorProfile,
    project: ProjectIntelligence,
    projectDetails: any,
    builderBriefing?: BuilderBriefing
  ): Promise<CallStrategy> {
    // Use builder briefing approach if provided, otherwise analyze vendor/project
    const approach = builderBriefing?.approach_strategy || this.selectApproachStyle(vendor, project);

    // Use builder's opening or craft one based on analysis
    const openingHook = builderBriefing?.opening_approach || this.craftOpeningHook(vendor, projectDetails, project);

    // Combine builder's talking points with AI-generated ones
    const aiTalkingPoints = this.generateTalkingPoints(vendor, project, projectDetails);
    const talkingPoints = builderBriefing?.must_mention_points
      ? [...builderBriefing.must_mention_points, ...aiTalkingPoints]
      : aiTalkingPoints;

    // Enhanced objection responses
    const aiObjectionResponses = this.prepareObjectionResponses(vendor, project);
    const objectionResponses = builderBriefing?.objection_responses
      ? { ...aiObjectionResponses, ...builderBriefing.objection_responses }
      : aiObjectionResponses;

    return {
      approach_style: approach,
      opening_hook: openingHook,
      key_talking_points: talkingPoints,
      objection_responses: objectionResponses,
      success_criteria: {
        primary_goal: builderBriefing?.primary_objective || 'Schedule site visit or detailed discussion',
        secondary_goals: builderBriefing?.success_metrics || ['Build rapport', 'Qualify interest', 'Share project vision'],
        minimum_success_threshold: 'Get commitment for follow-up call'
      },
      conversation_flow: {
        rapport_building: this.generateRapportBuilders(vendor),
        project_introduction: builderBriefing?.project_highlights || this.generateProjectIntro(projectDetails, vendor),
        value_demonstration: builderBriefing?.value_propositions || this.generateValueDemo(vendor, project),
        closing_strategy: this.generateClosingStrategy(vendor, project)
      },
      personalization: {
        vendor_specific_references: this.generateVendorReferences(vendor),
        project_fit_highlights: this.generateFitHighlights(vendor, projectDetails),
        mutual_connections: vendor.previous_interactions?.preferred_topics || []
      }
    };
  }

  /**
   * Analyze successful patterns from historical data
   */
  private async analyzeSuccessPatterns(vendor: VendorProfile, projectDetails: any): Promise<any> {
    // Get successful calls with similar vendors
    const { data: successfulCalls } = await supabase
      .from('conversation_transcripts')
      .select('*')
      .eq('call_status', 'successful')
      .contains('project_details', { type: projectDetails.type })
      .limit(20);

    const patterns = {
      what_works_with_similar_vendors: this.extractSuccessfulPatterns(successfulCalls, vendor),
      timing_insights: this.analyzeTimingPatterns(successfulCalls),
      messaging_preferences: this.analyzeMessagingPatterns(successfulCalls)
    };

    return patterns;
  }

  /**
   * Configure AI personality for this specific call (influenced by briefing)
   */
  private configureAIPersonality(vendor: VendorProfile, strategy: CallStrategy, builderBriefing?: BuilderBriefing): any {
    let tone = 'professional';
    let communicationStyle = 'balanced';
    let authorityLevel = 'confident';
    let relationshipApproach = 'business-focused';

    // Adjust based on vendor's preferred communication style
    if (vendor.preferred_communication_style === 'casual') {
      tone = 'friendly-casual';
      communicationStyle = 'conversational';
    } else if (vendor.preferred_communication_style === 'technical') {
      tone = 'technical-professional';
      communicationStyle = 'detail-oriented';
      authorityLevel = 'expert';
    } else if (vendor.preferred_communication_style === 'relationship') {
      tone = 'warm-professional';
      relationshipApproach = 'relationship-building';
    }

    return {
      tone,
      communication_style: communicationStyle,
      authority_level: authorityLevel,
      relationship_approach: relationshipApproach
    };
  }

  /**
   * Prepare fallback strategies for common scenarios (enhanced with builder input)
   */
  private async prepareFallbackStrategies(
    vendor: VendorProfile,
    project: ProjectIntelligence,
    builderBriefing?: BuilderBriefing
  ): Promise<any> {
    return {
      if_no_answer: [
        'Leave professional voicemail with project highlights',
        'Schedule callback based on preferred times',
        'Send follow-up SMS with key project details'
      ],
      if_not_interested: builderBriefing?.if_not_interested.length
        ? builderBriefing.if_not_interested
        : [
            'Ask about current workload and future availability',
            'Offer to keep on file for future projects',
            'Request referral to trusted colleague'
          ],
      if_price_objection: builderBriefing?.if_price_concerns.length
        ? builderBriefing.if_price_concerns
        : [
            'Focus on project quality and timeline flexibility',
            'Highlight long-term relationship potential',
            'Discuss value-based pricing approach'
          ],
      if_timing_objection: builderBriefing?.if_too_busy.length
        ? builderBriefing.if_too_busy
        : [
            'Explore partial availability or phased approach',
            'Discuss priority project scheduling',
            'Ask about future availability windows'
          ]
    };
  }

  // Helper methods for analysis
  private inferSpecializations(vendor: any, interactions: any[]): string[] {
    const specializations = [];
    if (vendor?.specialties) specializations.push(...vendor.specialties);

    // Infer from project history
    interactions?.forEach(interaction => {
      if (interaction.project_details?.type) {
        specializations.push(interaction.project_details.type);
      }
    });

    return [...new Set(specializations)];
  }

  private analyzeCommunicationStyle(interactions: any[]): 'direct' | 'relationship' | 'technical' | 'casual' {
    if (!interactions?.length) return 'direct';

    // Analyze conversation patterns
    const totalMessages = interactions.reduce((sum, i) => sum + (i.messages?.length || 0), 0);
    const avgMessagesPerCall = totalMessages / interactions.length;

    if (avgMessagesPerCall > 15) return 'relationship';
    if (avgMessagesPerCall < 8) return 'direct';
    return 'technical';
  }

  private calculateProjectFit(vendor: any, projectDetails: any): any {
    return {
      size_match: 0.8, // TODO: Implement based on vendor capacity vs project size
      specialty_match: 0.9, // TODO: Match vendor specialties to project needs
      timeline_compatibility: 0.7, // TODO: Check vendor availability vs project timeline
      budget_alignment: 0.8 // TODO: Compare vendor rates to project budget
    };
  }

  private calculateSuccessRate(interactions: any[]): number {
    if (!interactions?.length) return 0;
    const successful = interactions.filter(i => i.call_status === 'successful').length;
    return successful / interactions.length;
  }

  private extractPreferredTopics(interactions: any[]): string[] {
    const topics = [];
    interactions?.forEach(interaction => {
      if (interaction.messages) {
        // Extract topics from successful conversations
        if (interaction.call_status === 'successful') {
          topics.push('project_details', 'timeline', 'budget');
        }
      }
    });
    return [...new Set(topics)];
  }

  private identifyCommonObjections(interactions: any[]): string[] {
    const objections = ['schedule_conflicts', 'budget_concerns', 'project_scope'];
    // TODO: Analyze interaction messages for actual objection patterns
    return objections;
  }

  private async analyzeMarketDemand(projectDetails: any): Promise<any> {
    // TODO: Implement market analysis
    return {
      level: 'medium' as const,
      seasonal_factors: ['construction_season'],
      competitive_pressure: 0.6
    };
  }

  private generateValuePropositions(projectDetails: any, similarProjects: any[]): any {
    return {
      financial: [
        `Premium budget of ${projectDetails.budget} allows for quality work`,
        'Flexible payment terms available',
        'Opportunity for ongoing relationship'
      ],
      professional: [
        'High-visibility project enhances portfolio',
        'Professional team and clear communication',
        'Detailed project planning and support'
      ],
      relationship: [
        'Long-term partnership potential',
        'Referral opportunities from satisfied clients',
        'Collaborative working environment'
      ],
      project_specific: [
        `Custom ${projectDetails.type} project`,
        `Located at ${projectDetails.address}`,
        `${projectDetails.timeline} timeline allows proper execution`
      ]
    };
  }

  private async predictObjections(projectDetails: any, teamId: string): Promise<any> {
    return {
      common_concerns: ['timeline_tight', 'budget_constraints', 'scope_changes'],
      price_sensitivity: 0.5,
      scheduling_conflicts: ['busy_season', 'current_projects'],
      scope_uncertainties: ['permit_delays', 'weather_dependencies']
    };
  }

  private selectApproachStyle(vendor: VendorProfile, project: ProjectIntelligence): 'consultative' | 'direct' | 'relationship' | 'technical' {
    if (vendor.preferred_communication_style === 'relationship') return 'relationship';
    if (vendor.preferred_communication_style === 'technical') return 'technical';
    if (vendor.preferred_communication_style === 'direct') return 'direct';
    return 'consultative';
  }

  private craftOpeningHook(vendor: VendorProfile, projectDetails: any, project: ProjectIntelligence): string {
    if (vendor.previous_interactions?.last_contact) {
      return `Hi ${vendor.basic_info.name}! This is a follow-up about our ${projectDetails.budget} project at ${projectDetails.address}. We've been specifically looking for ${vendor.basic_info.company}'s expertise.`;
    }

    if (project.urgency_indicators.timeline_pressure) {
      return `Hi ${vendor.basic_info.name}! I'm calling about an urgent ${projectDetails.budget} project at ${projectDetails.address}. We need ${vendor.basic_info.company}'s expertise and wondered if you have availability.`;
    }

    return `Hi ${vendor.basic_info.name}! This is about an exciting ${projectDetails.budget} project at ${projectDetails.address}. We specifically wanted to work with ${vendor.basic_info.company} on this.`;
  }

  private generateTalkingPoints(vendor: VendorProfile, project: ProjectIntelligence, projectDetails: any): string[] {
    const points = [
      `Project budget: ${projectDetails.budget}`,
      `Timeline: ${projectDetails.timeline}`,
      `Location: ${projectDetails.address}`
    ];

    if (vendor.specializations.includes(projectDetails.type)) {
      points.push(`Perfect match for your ${projectDetails.type} expertise`);
    }

    if (project.market_context.current_demand_level === 'high') {
      points.push('High-demand area with excellent exposure');
    }

    return points;
  }

  private prepareObjectionResponses(vendor: VendorProfile, project: ProjectIntelligence): { [key: string]: string } {
    return {
      'too_busy': 'I understand you\'re in high demand. What does your schedule look like in the coming weeks? We have some flexibility on start dates.',
      'budget_concerns': `With a ${project.market_context.current_demand_level} demand market, we\'ve budgeted competitively. Let\'s discuss what would work for both of us.`,
      'not_interested': 'No problem! Would you be open to keeping our information for future opportunities? Also, is there a trusted colleague you might recommend?'
    };
  }

  // Additional helper methods would continue here...
  private generateRapportBuilders(vendor: VendorProfile): string[] {
    return [`Great to connect with ${vendor.basic_info.company}`, 'Hope your current projects are going well'];
  }

  private generateProjectIntro(projectDetails: any, vendor: VendorProfile): string[] {
    return [`We have a ${projectDetails.type} project at ${projectDetails.address}`];
  }

  private generateValueDemo(vendor: VendorProfile, project: ProjectIntelligence): string[] {
    return ['This project offers excellent portfolio value', 'Timeline allows for quality execution'];
  }

  private generateClosingStrategy(vendor: VendorProfile, project: ProjectIntelligence): string[] {
    return ['Would you be available for a brief site visit?', 'Can we schedule 15 minutes to discuss details?'];
  }

  private generateVendorReferences(vendor: VendorProfile): string[] {
    return vendor.previous_interactions?.preferred_topics || [];
  }

  private generateFitHighlights(vendor: VendorProfile, projectDetails: any): string[] {
    return [`Perfect fit for ${vendor.basic_info.company}'s expertise`];
  }

  private extractSuccessfulPatterns(calls: any[], vendor: VendorProfile): string[] {
    return ['Project timeline flexibility resonates well', 'Budget clarity builds trust'];
  }

  private analyzeTimingPatterns(calls: any[]): string[] {
    return ['Mid-morning calls perform best', 'Avoid Friday afternoons'];
  }

  private analyzeMessagingPatterns(calls: any[]): string[] {
    return ['Lead with project value', 'Ask questions early', 'Confirm next steps clearly'];
  }

  private assessTimelinePressure(projectDetails: any): boolean {
    return projectDetails.urgency === 'high';
  }

  private assessBudgetConstraints(projectDetails: any): boolean {
    return false; // TODO: Implement budget constraint analysis
  }

  private extractExternalDeadlines(projectDetails: any): string[] {
    return []; // TODO: Extract from project details
  }

  private assessClientPriority(projectDetails: any): number {
    return projectDetails.urgency === 'high' ? 9 : 5;
  }

  private async storeCallContext(vendorId: string, context: EnhancedCallContext): Promise<void> {
    await supabase.from('call_contexts').insert({
      vendor_id: vendorId,
      context: context,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Generate enhanced instructions for OpenAI Realtime API (with builder briefing)
   */
  generateEnhancedInstructions(context: EnhancedCallContext, basicParams: any): string {
    const { vendor_profile, call_strategy, ai_personality, project_intelligence, builder_briefing } = context;

    let instructions = `You are an AI assistant for ${basicParams.builderName} at ${basicParams.companyName}.

CALL CONTEXT:
You're having a VOICE conversation with ${vendor_profile.basic_info.name} from ${vendor_profile.basic_info.company}.`;

    // Add builder briefing section if provided
    if (builder_briefing) {
      instructions += `

🎯 BUILDER'S BRIEFING:
Primary Objective: ${builder_briefing.primary_objective}

KEY CONVERSATION TOPICS (Builder Specified):
${builder_briefing.conversation_topics.map(topic => `- ${topic}`).join('\n')}

MUST MENTION POINTS:
${builder_briefing.must_mention_points.map(point => `- ${point}`).join('\n')}

KEY MESSAGES TO CONVEY:
${builder_briefing.key_messages.map(msg => `- ${msg}`).join('\n')}

QUESTIONS TO ASK:
${builder_briefing.questions_to_ask.map(q => `- ${q}`).join('\n')}

SUCCESS METRICS:
${builder_briefing.success_metrics.map(metric => `- ${metric}`).join('\n')}`;
    }

    instructions += `

VENDOR INTELLIGENCE:
- Specializations: ${vendor_profile.specializations.join(', ')}
- Communication Style: ${vendor_profile.preferred_communication_style}
- Previous Success Rate: ${Math.round((vendor_profile.previous_interactions?.success_rate || 0) * 100)}%
- Project Fit Score: ${Math.round((vendor_profile.project_fit_analysis?.specialty_match || 0) * 100)}% match

CONVERSATION STRATEGY:
Approach: ${call_strategy.approach_style}
Opening Hook: "${call_strategy.opening_hook}"

KEY TALKING POINTS:
${call_strategy.key_talking_points.map(point => `- ${point}`).join('\n')}

PERSONALITY CONFIGURATION:
- Tone: ${ai_personality.tone}
- Communication Style: ${ai_personality.communication_style}
- Authority Level: ${ai_personality.authority_level}
- Relationship Approach: ${ai_personality.relationship_approach}

PROJECT DETAILS:
- Location: ${basicParams.projectDetails.address}
- Type: ${basicParams.projectDetails.type}
- Budget: ${basicParams.projectDetails.budget}
- Timeline: ${basicParams.projectDetails.timeline}
- Market Demand: ${project_intelligence.market_context.current_demand_level}`;

    // Add builder's project highlights if provided
    if (builder_briefing?.project_highlights.length) {
      instructions += `

BUILDER'S PROJECT HIGHLIGHTS:
${builder_briefing.project_highlights.map(highlight => `- ${highlight}`).join('\n')}`;
    } else {
      instructions += `

VALUE PROPOSITIONS TO HIGHLIGHT:
${project_intelligence.value_propositions.financial.concat(project_intelligence.value_propositions.professional).slice(0, 4).map(prop => `- ${prop}`).join('\n')}`;
    }

    instructions += `

CONVERSATION FLOW:
1. Rapport Building: ${call_strategy.conversation_flow.rapport_building.join(', ')}
2. Project Introduction: ${Array.isArray(call_strategy.conversation_flow.project_introduction) ? call_strategy.conversation_flow.project_introduction.join(', ') : call_strategy.conversation_flow.project_introduction}
3. Value Demonstration: ${Array.isArray(call_strategy.conversation_flow.value_demonstration) ? call_strategy.conversation_flow.value_demonstration.join(', ') : call_strategy.conversation_flow.value_demonstration}
4. Closing Strategy: ${call_strategy.conversation_flow.closing_strategy.join(', ')}

OBJECTION RESPONSES:
${Object.entries(call_strategy.objection_responses).map(([objection, response]) => `- If "${objection}": ${response}`).join('\n')}`;

    // Add anticipated objections from builder
    if (builder_briefing?.anticipated_objections.length) {
      instructions += `

ANTICIPATED OBJECTIONS (Builder Specified):
${builder_briefing.anticipated_objections.map(obj => `- ${obj}`).join('\n')}`;
    }

    instructions += `

PRIMARY GOAL: ${call_strategy.success_criteria.primary_goal}
MINIMUM SUCCESS: ${call_strategy.success_criteria.minimum_success_threshold}

AUTHORITY LEVELS:
- You can approve rates 10-20% above market
- You can adjust timelines within reason
- You can make decisions on project scope
- You represent the builder with full authority

IMPORTANT: Follow the builder's briefing instructions closely. This call should accomplish the specific objectives and cover the topics they've outlined.

Keep responses natural, conversational, and tailored to this specific vendor's communication style.`;

    return instructions;
  }
}

export default new CallPreparationService();