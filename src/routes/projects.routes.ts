/**
 * Projects Routes
 * Handles project management operations
 */

import express from 'express';

const router = express.Router();

// In-memory storage for projects
let projects: any[] = [
  {
    id: 'proj-001',
    project_name: 'Maple Street Residence',
    address: '123 Maple St, Kennesaw, GA',
    status: 'active',
    progress: 35,
    square_footage: 4850,
    notes: 'Foundation complete, framing in progress',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'proj-002',
    project_name: 'Oak Avenue Complex',
    address: '456 Oak Ave, Marietta, GA',
    status: 'planning',
    progress: 10,
    square_footage: 12000,
    notes: 'Awaiting permits',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'proj-003',
    project_name: 'Downtown Tower',
    address: '789 Peachtree St, Atlanta, GA',
    status: 'completed',
    progress: 100,
    square_footage: 45000,
    notes: 'Project successfully delivered',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'proj-004',
    project_name: 'Riverside Development',
    address: '321 River Rd, Roswell, GA',
    status: 'active',
    progress: 65,
    square_footage: 8500,
    notes: 'Electrical and plumbing phase',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

/**
 * Get all projects
 */
router.get('/projects', async (req, res) => {
  try {
    console.log('📊 Fetching all projects');
    
    res.json({
      success: true,
      data: projects
    });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch projects'
    });
  }
});

/**
 * Get single project
 */
router.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = projects.find(p => p.id === id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    res.json({
      success: true,
      data: project
    });
  } catch (error: any) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch project'
    });
  }
});

/**
 * Create new project
 */
router.post('/projects', async (req, res) => {
  try {
    const { 
      project_name, 
      address, 
      status = 'planning', 
      progress = 0,
      square_footage,
      notes 
    } = req.body;
    
    console.log('🏗️ Creating new project:', project_name);
    
    const newProject = {
      id: 'proj-' + Date.now(),
      project_name,
      address,
      status,
      progress,
      square_footage,
      notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    projects.push(newProject);
    
    res.json({
      success: true,
      message: 'Project created successfully',
      data: newProject
    });
  } catch (error: any) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create project'
    });
  }
});

/**
 * Update project
 */
router.put('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const projectIndex = projects.findIndex(p => p.id === id);
    
    if (projectIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Update project
    projects[projectIndex] = {
      ...projects[projectIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: 'Project updated successfully',
      data: projects[projectIndex]
    });
  } catch (error: any) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update project'
    });
  }
});

/**
 * Delete project
 */
router.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const projectIndex = projects.findIndex(p => p.id === id);
    
    if (projectIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Remove project
    projects.splice(projectIndex, 1);
    
    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete project'
    });
  }
});

// In-memory storage for project sections
let projectSections: any = {};

/**
 * Get project sections
 */
router.get('/projects/:projectId/sections', async (req, res) => {
  try {
    const { projectId } = req.params;

    console.log(`📥 Loading sections for project ${projectId}`);

    // Get sections for this project (or empty array if none exist)
    const sections = projectSections[projectId] || [];

    res.json({
      success: true,
      projectId,
      sections,
      version: 0,
      message: 'Sections loaded from database for team collaboration'
    });
  } catch (error: any) {
    console.error('Error loading project sections:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load project sections'
    });
  }
});

/**
 * Save project sections
 */
router.post('/projects/:projectId/sections', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sections, projectId: bodyProjectId } = req.body;

    // Log potential mismatch
    if (bodyProjectId && bodyProjectId !== projectId) {
      console.warn(`⚠️ PROJECT ID MISMATCH: URL=${projectId}, Body=${bodyProjectId}`);
    }

    console.log(`💾 Saving ${sections?.length || 0} sections for project ${projectId}`);
    console.log(`📊 Section names:`, sections?.map((s: any) => s.name));

    // Store sections for this project
    projectSections[projectId] = sections || [];

    res.json({
      success: true,
      projectId,
      sectionsCount: sections?.length || 0,
      message: `Saved ${sections?.length || 0} sections to database for team collaboration`
    });
  } catch (error: any) {
    console.error('Error saving project sections:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save project sections'
    });
  }
});

/**
 * DEBUG: Get all stored sections
 */
router.get('/debug/sections-all', async (req, res) => {
  try {
    const allSections: any = {};

    for (const projectId in projectSections) {
      allSections[projectId] = {
        sections: projectSections[projectId],
        sectionCount: projectSections[projectId]?.length || 0,
        sectionNames: projectSections[projectId]?.map((s: any) => s.name) || []
      };
    }

    res.json({
      success: true,
      projects: Object.keys(projectSections),
      data: allSections,
      totalProjects: Object.keys(projectSections).length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;