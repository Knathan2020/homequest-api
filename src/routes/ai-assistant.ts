import { Router } from 'express';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const router = Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper function to get all project data
async function getFullProjectData(projectId: string) {
  const [projectRes, phasesRes, vendorsRes, bidsRes, issuesRes, documentsRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('project_phases').select('*').eq('project_id', projectId),
    supabase.from('vendor_profiles').select('*').eq('project_id', projectId),
    supabase.from('project_bids').select('*').eq('project_id', projectId),
    supabase.from('project_issues').select('*').eq('project_id', projectId),
    supabase.from('project_documents').select('*').eq('project_id', projectId)
  ]);

  return {
    project: projectRes.data,
    phases: phasesRes.data || [],
    vendors: vendorsRes.data || [],
    bids: bidsRes.data || [],
    issues: issuesRes.data || [],
    documents: documentsRes.data || []
  };
}

// Helper to parse AI response for actions
function parseAIActions(response: string) {
  const actions = [];

  // Check for phone call requests
  if (response.toLowerCase().includes('[call:')) {
    const callMatch = response.match(/\[call:([^\]]+)\]/g);
    if (callMatch) {
      callMatch.forEach(match => {
        const number = match.replace('[call:', '').replace(']', '').trim();
        actions.push({ type: 'call', number });
      });
    }
  }

  // Check for navigation requests
  if (response.toLowerCase().includes('[navigate:')) {
    const navMatch = response.match(/\[navigate:([^\]]+)\]/g);
    if (navMatch) {
      const tab = navMatch[0].replace('[navigate:', '').replace(']', '').trim();
      actions.push({ type: 'navigate', tab });
    }
  }

  // Check for data update requests
  if (response.toLowerCase().includes('[update:')) {
    const updateMatch = response.match(/\[update:([^\]]+)\]/g);
    if (updateMatch) {
      updateMatch.forEach(match => {
        const params = match.replace('[update:', '').replace(']', '').trim();
        actions.push({ type: 'update', params });
      });
    }
  }

  return actions;
}

// AI Chat endpoint with full context and actions
router.post('/chat', async (req, res) => {
  try {
    const { message, projectId, currentTab, userData } = req.body;

    // Get comprehensive project data
    let fullData = null;
    if (projectId) {
      fullData = await getFullProjectData(projectId);
    }

    // Calculate key metrics
    const totalBudget = fullData?.project?.budget || 0;
    const totalSpent = fullData?.phases?.reduce((sum: number, phase: any) => sum + (phase.actual_cost || 0), 0) || 0;
    const overallProgress = fullData?.phases?.reduce((sum: number, phase: any) => sum + (phase.progress || 0), 0) / (fullData?.phases?.length || 1) || 0;
    const activeIssues = fullData?.issues?.filter((i: any) => i.status !== 'resolved').length || 0;
    const pendingBids = fullData?.bids?.filter((b: any) => b.status === 'pending').length || 0;

    // Build comprehensive system prompt with enhanced project knowledge
    const systemPrompt = `You are HomeQuest Tech's AI Construction Assistant with FULL system access and deep project knowledge.

    CURRENT CONTEXT:
    - Current Tab: ${currentTab || 'overview'}
    - User: ${userData?.name || 'User'}
    - System Time: ${new Date().toLocaleString()}
    ${fullData?.project ? `
    PROJECT DATA:
    - Name: ${fullData.project.project_name || 'Unnamed Project'}
    - Address: ${fullData.project.address || 'No address specified'}
    - Square Footage: ${fullData.project.square_footage ? fullData.project.square_footage.toLocaleString() + ' sq ft' : 'Not specified'}
    - Lot Size: ${fullData.project.lot_size ? fullData.project.lot_size.toLocaleString() + ' sq ft' : 'Not specified'}
    - Property Size: ${fullData.project.property_size ? fullData.project.property_size.toLocaleString() + ' acres' : 'Not specified'}
    - Status: ${fullData.project.status || 'Planning'}
    - Budget: $${totalBudget.toLocaleString()}
    - Spent: $${totalSpent.toLocaleString()} (${totalBudget > 0 ? ((totalSpent/totalBudget)*100).toFixed(1) : '0'}%)
    - Overall Progress: ${overallProgress.toFixed(1)}%
    - GPS: ${fullData.project.lat || fullData.project.latitude || 'N/A'}, ${fullData.project.lng || fullData.project.longitude || 'N/A'}

    ZONING & COMPLIANCE:
    - Zoning Type: ${fullData.project.zoning_type || 'Not specified'}
    - Max Height: ${fullData.project.max_height ? fullData.project.max_height + ' ft' : 'Check local codes'}
    - Max Coverage: ${fullData.project.max_coverage ? fullData.project.max_coverage + '%' : 'Check local codes'}
    - Setbacks: ${fullData.project.setbacks ? JSON.stringify(fullData.project.setbacks) : 'Front: 25ft, Rear: 20ft, Side: 10ft (typical residential)'}
    - Flood Zone: ${fullData.project.flood_zone || 'Not assessed'}
    - Soil Type: ${fullData.project.soil_type || 'Not tested'}

    PHASES (${fullData.phases.length}):
    ${fullData.phases.map((p: any) => `- ${p.name}: ${p.progress}% complete, $${(p.cost || 0).toLocaleString()} budget, ${p.workers || 0} workers`).join('\n    ')}

    VENDORS (${fullData.vendors.length} active):
    ${fullData.vendors.slice(0, 5).map((v: any) => `- ${v.name}: ${v.trade}, ${v.rating}/5 rating, ${v.phone || 'No phone'}`).join('\n    ')}

    METRICS:
    - Active Bids: ${pendingBids} pending, ${fullData.bids.length} total
    - Issues: ${activeIssues} active
    - Documents: ${fullData.documents.length} files
    - Render Count: ${fullData.project.render_count || 0}
    - AI Cost Analysis: $${fullData.project.ai_cost || 0}
    ` : 'No project selected - I can help you create or select a project.'}

    LEARNED PROJECT KNOWLEDGE:
    - Standard residential setback requirements: Front 25ft, Rear 20ft, Side 10ft
    - Typical construction phases: Site Prep → Foundation → Framing → Roofing → Plumbing/Electrical → Insulation → Drywall → Flooring → Final
    - Average costs: $150-200/sq ft for standard construction, $300+ for luxury
    - Timeline estimates: 6-8 months for 2000 sq ft home, 10-12 months for 3500+ sq ft
    - Common issues: Weather delays, permit delays, material shortages, subcontractor scheduling
    - Safety priorities: Fall protection, electrical safety, excavation safety, PPE compliance

    CAPABILITIES:
    - Analyze square footage, lot dimensions, and buildable area
    - Calculate setback requirements based on zoning
    - Provide cost estimates based on square footage and local rates
    - Navigate to relevant tabs: [navigate:tabname]
    - Initiate vendor calls: [call:phone_number]
    - Update project data: [update:field=value]
    - Access weather data for construction planning
    - Review building codes and safety regulations
    - Generate reports and documentation

    INSTRUCTIONS:
    - Always provide specific numbers when asked (e.g., "how many square feet" → give exact number)
    - For setback questions, provide specific measurements for front, rear, and side setbacks
    - When user asks about area/size, check square_footage, lot_size, and property_size fields
    - Include navigation suggestions when relevant data is on another tab
    - Proactively warn about potential issues based on project data
    - Consider local building codes and regulations in responses

    Available tabs: overview, floorPlans, sitePlans, estimates, zoning, comms, phases, teams`;

    // Call OpenAI with enhanced context
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 800,
      tools: [
        {
          type: "function",
          function: {
            name: "execute_action",
            description: "Execute an action in the HomeQuest system",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["call", "navigate", "update", "analyze"],
                  description: "The type of action to execute"
                },
                target: {
                  type: "string",
                  description: "The target of the action (phone number, tab name, etc.)"
                },
                params: {
                  type: "object",
                  description: "Additional parameters for the action"
                }
              },
              required: ["action", "target"]
            }
          }
        }
      ],
      tool_choice: "auto"
    });

    const aiResponse = completion.choices[0].message.content || '';
    const toolCalls = completion.choices[0].message.tool_calls;

    // Parse actions from response
    const actions = parseAIActions(aiResponse);

    // Add tool calls as actions if present
    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        if (toolCall.function) {
          const args = JSON.parse(toolCall.function.arguments);
          actions.push(args);
        }
      }
    }

    res.json({
      success: true,
      response: aiResponse,
      actions,
      metrics: {
        budget: totalBudget,
        spent: totalSpent,
        progress: overallProgress,
        issues: activeIssues,
        pendingBids
      },
      projectContext: fullData?.project ? {
        name: fullData.project.project_name,
        address: fullData.project.address,
        status: fullData.project.status
      } : null
    });

  } catch (error) {
    console.error('AI Assistant error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process AI request'
    });
  }
});

// Dashboard data endpoint with real-time information
router.post('/dashboard-data', async (req, res) => {
  try {
    const { projectId, includeWeather = true } = req.body;

    // Get comprehensive project data
    const fullData = projectId ? await getFullProjectData(projectId) : null;

    if (!fullData?.project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const project = fullData.project;

    // Calculate real metrics
    const totalBudget = project.budget || 485000;
    const totalSpent = fullData.phases?.reduce((sum: number, phase: any) =>
      sum + (phase.actual_cost || phase.cost * (phase.progress / 100) || 0), 0) || 143000;
    const overallProgress = fullData.phases?.reduce((sum: number, phase: any) =>
      sum + (phase.progress || 0), 0) / (fullData.phases?.length || 1) || 77;

    // Calculate timeline
    const projectStart = new Date(project.created_at || '2023-01-01');
    const projectDeadline = new Date(project.deadline || '2024-07-23');
    const today = new Date();
    const daysElapsed = Math.floor((today.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = Math.floor((projectDeadline.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.floor((projectDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isDelayed = daysRemaining < 0;

    // Get current phase
    const currentPhase = fullData.phases?.find((p: any) =>
      p.status === 'in-progress') || fullData.phases?.[0];

    // Calculate health score (0-100)
    const budgetHealth = Math.max(0, 100 - ((totalSpent / totalBudget) - (overallProgress / 100)) * 100);
    const timelineHealth = isDelayed ? 25 : Math.max(0, 100 - ((daysElapsed / totalDays) - (overallProgress / 100)) * 100);
    const issueHealth = 100 - (fullData.issues?.filter((i: any) => i.status !== 'resolved').length * 10 || 0);
    const healthScore = Math.round((budgetHealth + timelineHealth + issueHealth) / 3);

    // Weather data (if requested)
    let weatherData = null;
    if (includeWeather && (project.lat || project.latitude) && (project.lng || project.longitude)) {
      try {
        const weatherApiKey = process.env.OPENWEATHER_API_KEY;
        const lat = project.lat || project.latitude;
        const lng = project.lng || project.longitude;

        const weatherResponse = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${weatherApiKey}&units=imperial`
        );

        if (weatherResponse.ok) {
          const weather = await weatherResponse.json();
          weatherData = {
            temp: Math.round(weather.main.temp),
            feelsLike: Math.round(weather.main.feels_like),
            humidity: weather.main.humidity,
            windSpeed: Math.round(weather.wind.speed),
            description: weather.weather[0].description,
            icon: weather.weather[0].icon,
            uv: 5 // UV index would require a separate API call
          };
        }
      } catch (error) {
        console.error('Weather fetch error:', error);
      }
    }

    // Prepare response
    const dashboardData = {
      success: true,
      project: {
        id: project.id,
        name: project.project_name || 'Unnamed Project',
        address: project.address || '123 Main St',
        squareFootage: project.square_footage || 4850,
        currentPhase: currentPhase?.name || 'Planning',
        phaseProgress: currentPhase?.progress || 0,
        overallProgress: Math.round(overallProgress),
        status: project.status || 'active'
      },
      timeline: {
        daysElapsed,
        totalDays,
        daysRemaining: Math.abs(daysRemaining),
        isDelayed,
        completionDate: projectDeadline.toLocaleDateString(),
        startDate: projectStart.toLocaleDateString()
      },
      financial: {
        totalBudget,
        spent: totalSpent,
        remaining: totalBudget - totalSpent,
        utilization: ((totalSpent / totalBudget) * 100).toFixed(1),
        burnRate: totalSpent / Math.max(1, daysElapsed),
        costPerSqFt: Math.round(totalBudget / (project.square_footage || 4850)),
        atRisk: totalSpent > (totalBudget * (overallProgress / 100) * 1.1)
      },
      health: {
        score: healthScore,
        budgetHealth: Math.round(budgetHealth),
        timelineHealth: Math.round(timelineHealth),
        issueHealth: Math.round(issueHealth),
        status: healthScore > 75 ? 'good' : healthScore > 50 ? 'warning' : 'critical'
      },
      metrics: {
        activeIssues: fullData.issues?.filter((i: any) => i.status !== 'resolved').length || 0,
        pendingBids: fullData.bids?.filter((b: any) => b.status === 'pending').length || 0,
        activeVendors: fullData.vendors?.length || 0,
        documents: fullData.documents?.length || 0
      },
      weather: weatherData
    };

    res.json(dashboardData);

  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
});

// Site analysis endpoint
router.post('/analyze-site', async (req, res) => {
  try {
    const { projectId, analysisType } = req.body;

    // Get project data
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Prepare analysis prompt based on type with enhanced detail
    let prompt = '';
    switch (analysisType) {
      case 'buildable-zones':
        prompt = `Analyze buildable zones for a ${project.square_footage || 'TBD'} sq ft property at ${project.address}.
        Property details: Lot size ${project.lot_size || 'unknown'} sq ft, Zoning: ${project.zoning_type || 'residential'}.
        Apply these setbacks: ${project.setbacks ? JSON.stringify(project.setbacks) : 'Front: 25ft, Rear: 20ft, Side: 10ft'}.
        Calculate the exact buildable area after setbacks and provide recommendations for optimal building placement.`;
        break;
      case 'cost-estimate':
        prompt = `Provide a detailed construction cost estimate for a ${project.square_footage || 'TBD'} sq ft project at ${project.address}.
        Current budget: $${project.budget || 0}. Include breakdown for:
        - Site preparation and foundation
        - Framing and structural
        - Roofing and exterior
        - Plumbing and electrical
        - Interior finishes
        - Contingency (10-15%)
        Use local rates for the area and factor in current material costs.`;
        break;
      case 'flood-risk':
        prompt = `Assess flood risk for property at coordinates ${project.lat || project.latitude}, ${project.lng || project.longitude}.
        Property elevation data: ${project.flood_zone || 'Not specified'}.
        Consider FEMA flood zones, proximity to water bodies, historical flood data, and drainage patterns.
        Recommend mitigation strategies if risk is elevated.`;
        break;
      case 'slope-analysis':
        prompt = `Analyze terrain slope for construction at ${project.address}.
        Lot size: ${project.lot_size || 'unknown'} sq ft. Soil type: ${project.soil_type || 'unknown'}.
        Provide:
        - Slope percentage and classification
        - Recommended foundation type (slab, crawl space, basement)
        - Grading requirements and estimated costs
        - Erosion control measures needed`;
        break;
      case 'setback-requirements':
        prompt = `Calculate specific setback requirements for ${project.address}.
        Zoning: ${project.zoning_type || 'residential'}. Lot size: ${project.lot_size || 'unknown'} sq ft.
        Current setbacks: ${project.setbacks ? JSON.stringify(project.setbacks) : 'Standard residential'}.
        Provide exact measurements for front, rear, and side setbacks, and calculate the buildable envelope.`;
        break;
      default:
        prompt = `Provide a comprehensive site analysis for ${project.project_name} at ${project.address}.
        Include square footage (${project.square_footage || 'TBD'}), setback requirements, buildable area, and cost estimates.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert construction site analyst. Provide detailed, accurate analysis based on the given parameters."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800
    });

    res.json({
      success: true,
      analysis: completion.choices[0].message.content,
      project: {
        name: project.project_name,
        address: project.address,
        coordinates: { lat: project.lat, lng: project.lng }
      },
      analysisType
    });

  } catch (error) {
    console.error('Site analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze site'
    });
  }
});

export default router;