/**
 * Express Application Configuration
 * Main application setup with all middleware and routes
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { json, urlencoded } from 'body-parser';
import path from 'path';

// Import logging
import logger, { stream, loggers } from './utils/logger';
import { requestLogger, errorLogger, blueprintLogger, performanceMonitor } from './middleware/logging.middleware';

// Import types
import { ApiErrorResponse, HttpStatus } from './types/api.types';

// Import routes
import floorPlanRoutes from './routes/floor-plans.routes';
import enhancedBlueprintRoutes from './routes/enhanced-blueprint.routes';
import productionBlueprintRoutes from './routes/production-blueprint.routes';
import ragRoutes from './routes/rag.routes';
import floorPlanPersistenceRoutes from './routes/floor-plan-persistence.routes';
import secureRAGRoutes from './routes/secure-rag.routes';
import intelligentAnalysisRoutes from './routes/intelligent-analysis.routes';
import enhancedDetectionRoutes from './routes/enhanced-detection.routes';
import ragLearningRoutes from './routes/rag-learning.routes';
import gisProxyRoutes from './routes/gis-proxy';
import vendorBiddingRoutes from './routes/vendor-bidding.routes';
import setupDatabaseRoutes from './routes/setup-database.routes';
import projectsRoutes from './routes/projects.routes';
import builderBriefingRoutes from './routes/builder-briefing.routes';
import roomSelectionsRoutes from './api/room-selections';
// import floorPlan3DRoutes from './routes/floor-plan-3d.routes'; // Temporarily disabled for build
// import roomRoutes from './routes/room.routes';
// import processingRoutes from './routes/processing.routes';

// Environment configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Create and configure Express application
 */
export const createApp = (): Application => {
  const app: Application = express();

  // Trust proxy - important for deployment behind reverse proxies
  app.set('trust proxy', 1);

  // ============================
  // Security Middleware
  // ============================

  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: !isDevelopment
  }));

  // Add logging middleware to see ALL requests
  app.use((req, res, next) => {
    console.log(`📨 ${new Date().toISOString()} ${req.method} ${req.path} from ${req.get('origin') || 'no-origin'}`);
    next();
  });

  // Simplified CORS configuration for debugging
  const corsOptions: cors.CorsOptions = {
    origin: true, // Allow ALL origins temporarily for debugging
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key', 'apikey'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  };
  
  console.log('🔧 CORS configured to allow ALL origins (debugging mode)');
  
  // Apply CORS before other middleware
  app.use(cors(corsOptions));
  
  // Add explicit OPTIONS handler for preflight requests
  app.options('*', (req, res) => {
    console.log('✅ OPTIONS preflight request handled for:', req.path);
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-API-Key, apikey');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(204);
  });

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProduction ? 100 : 1000, // Limit requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    }
  });
  app.use('/api', limiter);

  // MongoDB query injection prevention
  app.use(mongoSanitize());

  // ============================
  // Request Processing Middleware
  // ============================

  // Compression
  app.use(compression({
    level: 6,
    threshold: 100 * 1024, // Only compress responses > 100KB
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));

  // Body parsing
  app.use(json({
    limit: '50mb',
    verify: (req: any, res, buf, encoding) => {
      // Store raw body for webhook signature verification
      if (req.headers['x-webhook-signature']) {
        req.rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
      }
    }
  }));
  app.use(urlencoded({ 
    extended: true, 
    limit: '50mb',
    parameterLimit: 50000
  }));

  // Request logging
  if (!isTest) {
    // Use Morgan for HTTP logging with Winston stream
    const morganFormat = isDevelopment ? 'dev' : 'combined';
    app.use(morgan(morganFormat, {
      skip: (req, res) => {
        // Skip logging for health checks
        return req.path === '/health';
      },
      stream // Use Winston stream for logging
    }));
    
    // Add custom request/response logging
    app.use(requestLogger);
    app.use(performanceMonitor);
    app.use(blueprintLogger);
  }

  // Request ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || generateRequestId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // Request timeout
  app.use((req: Request, res: Response, next: NextFunction) => {
    const timeout = parseInt(process.env.REQUEST_TIMEOUT || '30000');
    req.setTimeout(timeout);
    res.setTimeout(timeout);
    next();
  });

  // ============================
  // Health & Status Endpoints
  // ============================

  // Basic health check
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.API_VERSION || '1.0.0'
    });
  });

  // Detailed health check
  app.get('/api/health', async (req: Request, res: Response) => {
    try {
      const healthStatus = await checkHealth();
      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // API info endpoint
  app.get('/api', (req: Request, res: Response) => {
    res.json({
      name: 'HomeQuest Floor Plan Processing API',
      version: process.env.API_VERSION || '1.0.0',
      description: 'API for processing and analyzing architectural floor plans',
      documentation: '/api/docs',
      endpoints: {
        health: '/api/health',
        floorPlans: '/api/floor-plans',
        enhancedBlueprint: '/api/enhanced-blueprint',
        rag: '/api/rag',
        rooms: '/api/rooms',
        processing: '/api/processing'
      },
      timestamp: new Date().toISOString()
    });
  });

  // ============================
  // Static Files
  // ============================

  // Serve static files for both development and production
  const uploadsPath = path.join(process.cwd(), 'uploads');
  console.log('📁 Serving static files from:', uploadsPath);
  app.use('/uploads', express.static(uploadsPath, {
    maxAge: isProduction ? '7d' : '0',
    etag: true,
    lastModified: true
  }));

  // Serve temporary CAD files (converted images) with CORS headers
  const tempCadPath = path.join(process.cwd(), 'temp-cad-files');
  console.log('📁 Serving temporary CAD files from:', tempCadPath);
  app.use('/temp-cad-files', (req, res, next) => {
    // Add CORS headers for images
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  }, express.static(tempCadPath, {
    maxAge: '1h', // Short cache for temp files
    etag: true,
    lastModified: true
  }));

  // ============================
  // API Routes
  // ============================

  // Mount API routes
  app.use('/api/floor-plans', floorPlanRoutes);
  app.use('/api/floor-plans', floorPlanPersistenceRoutes); // Persistence endpoints
  app.use('/api/floor-plan-storage', require('./routes/floor-plan-storage.routes').default); // Public storage for all users
  app.use('/api/wall-editor', require('./routes/wall-editor.routes').default);
  app.use('/api/elevation', require('./routes/elevation.routes').default); // Proxy for Google Elevation API
  app.use('/api/enhanced-blueprint', enhancedBlueprintRoutes);
  app.use('/api/blueprint', productionBlueprintRoutes); // Production OpenAI Vision + OpenCV
  app.use('/api/rag', ragRoutes); // OpenAI RAG System
  app.use('/api/secure-rag', secureRAGRoutes); // Secure Global RAG with privacy protection
  app.use('/api/intelligent', intelligentAnalysisRoutes); // YOLO + Tesseract + RAG integration
  app.use('/api/enhanced', enhancedDetectionRoutes); // Enhanced OpenCV wall detection
  app.use('/api/rag-learning', ragLearningRoutes); // RAG learning system for continuous improvement
  app.use('/api', gisProxyRoutes); // GIS proxy for CORS-blocked services
  app.use('/api/builder-phones', require('./routes/builder-phones.routes').default); // Builder phone number management
  app.use('/api', require('./routes/test-call').default); // Quick test for calling
  app.use('/api', require('./routes/test-call.routes').default); // Enhanced test call endpoint
  app.use('/api', require('./routes/simple-call.routes').default); // Simple call without OpenAI
  app.use('/api', require('./routes/ai-call.routes').default); // AI call with regular OpenAI
  app.use('/api', require('./routes/homequest-calls').default); // HomeQuest-paid calling system
  app.use('/api', require('./routes/twilio-webhooks').default); // Twilio webhooks for conversational AI
  app.use('/api', require('./routes/billionaire-ai.routes').default); // BILLIONAIRE AI system
  app.use('/api', require('./routes/chatgpt-voice.routes').default); // ChatGPT Voice integration
  app.use('/api', require('./routes/chatgpt-realtime-voice.routes').default); // ChatGPT Realtime Voice with Twilio
  app.use('/api', require('./routes/chatgpt-voice-fixed.routes').default); // FIXED ChatGPT Voice integration
  app.use('/api', require('./routes/realtime-api.routes').default); // OpenAI Realtime API (PUBLIC!)
  app.use('/api', require('./routes/twilio-ai-voice.routes').default); // Twilio AI Voice with Neural TTS
  app.use('/api/builder-briefing', builderBriefingRoutes); // Builder pre-call briefing system
  app.use('/api/conversations', require('./routes/conversations').default); // Conversation transcripts API
  app.use('/api/autonomous', require('./routes/autonomous-campaigns').default); // Autonomous calling campaigns
  app.use('/api/messaging', require('./routes/messaging.routes').default); // Autonomous messaging system
  app.use('/api', require('./routes/vapi.routes').default); // Vapi AI voice calls - Professional quality
  app.use('/api/vapi', require('./routes/vapi-personal.routes').default); // Vapi personal calls
  app.use('/api', require('./routes/retell.routes').default); // Retell.ai - Best natural conversation flow
  app.use('/api/elevenlabs', require('./routes/elevenlabs.routes').default); // ElevenLabs - Most natural voice synthesis
  app.use('/api/elevenlabs-simple', require('./routes/elevenlabs-simple.routes').default); // ElevenLabs simplified implementation
  app.use('/api/elevenlabs-twilio', require('./routes/elevenlabs-twilio.routes').default); // ElevenLabs + Twilio real-time integration
  app.use('/api', require('./routes/team-signup.routes').default); // Team signup with phone provisioning
  app.use('/api', require('./routes/setup.routes').default); // Database setup and phone provisioning
  app.use('/api/team-members', require('./routes/team-members.routes').default); // Team members management for AI routing
  app.use('/api/team', require('./routes/team.routes').default); // Real team management with online status
  app.use('/api/usage', require('./routes/usage.routes').default); // Real-time usage statistics
  app.use('/api', require('./routes/projects-supabase.routes').default); // Projects management with Supabase
  app.use('/api', require('./routes/appointments.routes').default); // Appointments and scheduling system
  app.use('/api', require('./routes/meeting-invites.routes').default); // Meeting invitations and notifications
  app.use('/api', require('./routes/vapi-webhooks.routes').default); // Vapi webhooks for transfers
  app.use('/api', require('./routes/test-receptionist.routes').default); // Test AI receptionist with transfers
  app.use('/api', require('./routes/user.routes').default); // User profile and company information
  app.use('/api/contacts', require('./routes/contacts.routes').default); // Smart contacts management with AI
  app.use('/api', require('./routes/twilio-voice.routes').default); // Twilio voice webhook handler
  app.use('/api', require('./routes/phone-system.routes').default); // Phone system setup and management
  app.use('/api', require('./routes/twilio-webhook.routes').default); // Team-specific Twilio webhook routing
  app.use('/api', require('./routes/test-phone-provisioning.routes').default); // Test phone provisioning system
  app.use('/api/vendor-bidding', vendorBiddingRoutes); // Vendor bidding portal and project-specific bid management
  app.use('/api/database', setupDatabaseRoutes); // Database setup and maintenance
  app.use('/api', projectsRoutes); // Projects management routes
  app.use('/api/selections', roomSelectionsRoutes); // Room selections upload and management
  app.use('/api/documents', require('./routes/documents.routes').default); // Document management and team sharing

  // Add explicit CORS middleware for Nylas and autonomous routes (GitHub Codespaces fix)
  app.use('/api/nylas', (req, res, next) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-API-Key, apikey, Origin, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use('/api/autonomous', (req, res, next) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-API-Key, apikey, Origin, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use('/api/nylas', require('./routes/nylas-email.routes').default); // Nylas unified email system
  app.use('/api/microsoft', require('./routes/microsoft-direct.routes').default); // Microsoft Graph Direct API (bypasses Nylas for Outlook)
  app.use('/api/autonomous', require('./routes/autonomous-email.routes').default); // Autonomous email processing system
  app.use('/api', require('./routes/email-compatibility.routes').default); // Email compatibility layer for old frontend
  app.use('/api/ai', require('./routes/ai.routes').default); // AI email assistance endpoints
  app.use('/api/ai-assistant', require('./routes/ai-assistant').default); // AI assistant with ChatGPT integration
  // app.use('/api', floorPlan3DRoutes); // 2D to 3D conversion routes - temporarily disabled
  // app.use('/api/rooms', roomRoutes);
  // app.use('/api/processing', processingRoutes);

  // ============================
  // Error Handling
  // ============================

  // 404 handler
  app.use((req: Request, res: Response, next: NextFunction) => {
    const error: any = new Error(`Not Found - ${req.originalUrl}`);
    error.status = HttpStatus.NOT_FOUND;
    error.code = 'ROUTE_NOT_FOUND';
    next(error);
  });

  // Error logging middleware
  app.use(errorLogger);
  
  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Default to 500 server error
    const status = err.status || err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
    const message = err.message || 'Internal Server Error';
    const code = err.code || 'INTERNAL_ERROR';

    // Error details are already logged by errorLogger middleware
    // Additional logging only for critical errors
    if (status >= 500) {
      loggers.system.error('Critical server error', {
        status,
        code,
        message,
        requestId: req.headers['x-request-id']
      });
    }

    // Prepare error response
    const errorResponse: ApiErrorResponse = {
      success: false,
      data: null,
      message,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string,
      error: {
        code,
        message,
        status,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method as any,
        requestId: req.headers['x-request-id'] as string,
        ...(isDevelopment && { 
          stack: err.stack,
          details: {
            type: err.type || 'internal',
            context: err.context
          }
        })
      }
    };

    res.status(status).json(errorResponse);
  });

  return app;
};

/**
 * Generate unique request ID
 */
const generateRequestId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${randomStr}`;
};

/**
 * Perform health checks
 */
const checkHealth = async (): Promise<any> => {
  const checks = {
    database: 'healthy',
    redis: 'healthy',
    storage: 'healthy',
    memory: 'healthy',
    cpu: 'healthy'
  };

  // Check memory usage
  const memUsage = process.memoryUsage();
  const memLimit = parseInt(process.env.MEMORY_LIMIT || '1073741824'); // 1GB default
  if (memUsage.heapUsed > memLimit * 0.9) {
    checks.memory = 'degraded';
  }

  // Check CPU usage (simplified)
  const cpuUsage = process.cpuUsage();
  const cpuLimit = 1000000000; // 1 second in microseconds
  if (cpuUsage.user > cpuLimit) {
    checks.cpu = 'degraded';
  }

  // TODO: Add actual database, Redis, and storage health checks

  const allHealthy = Object.values(checks).every(status => status === 'healthy');
  const anyUnhealthy = Object.values(checks).some(status => status === 'unhealthy');

  return {
    status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    version: process.env.API_VERSION || '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: checks,
    metrics: {
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000000),
        system: Math.round(cpuUsage.system / 1000000),
        unit: 'ms'
      }
    }
  };
};

// Export app instance for testing
export default createApp();
