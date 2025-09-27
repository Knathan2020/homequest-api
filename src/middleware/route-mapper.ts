// Route Mapper - Maps frontend expected routes to actual backend routes
import { Request, Response, NextFunction } from 'express';

// Define all route mappings
const ROUTE_MAPPINGS: Record<string, string> = {
  // Floor Plan Detection - What frontend expects → What backend has
  '/api/intelligent/detect-walls': '/api/enhanced-detection/detect-walls',
  '/api/vision/analyze': '/api/enhanced-detection/detect-walls',
  '/api/ai/detect-walls': '/api/enhanced-detection/detect-walls',

  // Floor Plan Processing
  '/api/spatial/process': '/api/floor-plans/upload',
  '/api/analyze-floorplan': '/api/floor-plans/upload',
  '/api/floor-plans/analyze': '/api/floor-plans/upload',

  // CAD Processing
  '/api/spatial/upload-cad': '/api/floor-plans/upload-cad',
  '/api/cad/upload': '/api/floor-plans/upload-cad',

  // Job Status
  '/api/spatial/job': '/api/floor-plans/job',
  '/api/jobs/status': '/api/floor-plans/jobs',

  // Blueprint Processing
  '/api/blueprint/analyze': '/api/production-blueprint/process',
  '/api/production/process': '/api/production-blueprint/process',

  // Document Processing
  '/api/docs/upload': '/api/documents/upload',
  '/api/files/upload': '/api/documents/upload',

  // Communication
  '/api/call/vendor': '/api/twilio/call/vendor',
  '/api/sms/send': '/api/twilio/sms/send',
  '/api/email/send': '/api/nylas/send-email',

  // Team
  '/api/team/list': '/api/team/members',
  '/api/members': '/api/team/members',

  // Projects
  '/api/project': '/api/projects',
  '/api/project/list': '/api/projects',

  // User
  '/api/profile': '/api/user/profile',
  '/api/account': '/api/user/profile',

  // RAG/AI
  '/api/ai/query': '/api/rag/query',
  '/api/ai/chat': '/api/rag/query',

  // Health checks
  '/api/health': '/health',
  '/api/status': '/health',
  '/health-check': '/health'
};

// Middleware function to handle route mapping
export const routeMapper = (req: Request, res: Response, next: NextFunction) => {
  const originalPath = req.path;

  // Check if this path needs mapping
  const mappedPath = ROUTE_MAPPINGS[originalPath];

  if (mappedPath) {
    console.log(`🔄 Route mapping: ${originalPath} → ${mappedPath}`);
    req.url = mappedPath + (req.url.slice(originalPath.length) || '');
    req.path = mappedPath;
  }

  // Also handle dynamic routes (with parameters)
  // Check for patterns like /api/spatial/job/:id → /api/floor-plans/job/:id
  for (const [pattern, replacement] of Object.entries(ROUTE_MAPPINGS)) {
    if (originalPath.startsWith(pattern + '/')) {
      const dynamicPart = originalPath.slice(pattern.length);
      const newPath = replacement + dynamicPart;
      console.log(`🔄 Dynamic route mapping: ${originalPath} → ${newPath}`);
      req.url = newPath;
      req.path = newPath;
      break;
    }
  }

  next();
};

// Additional helper to log unmapped routes (for debugging)
export const logUnmappedRoutes = (req: Request, res: Response, next: NextFunction) => {
  // Log any 404s that might be unmapped routes we missed
  res.on('finish', () => {
    if (res.statusCode === 404 && req.path.startsWith('/api/')) {
      console.warn(`⚠️  Unmapped route hit 404: ${req.method} ${req.path}`);
      console.warn('   Consider adding this to ROUTE_MAPPINGS if it should exist');
    }
  });
  next();
};

// Export the mappings for documentation
export const getRouteMappings = () => ROUTE_MAPPINGS;