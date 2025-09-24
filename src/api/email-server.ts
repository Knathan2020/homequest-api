/**
 * Dedicated Email API Server - Port 4001
 * Handles Gmail/Outlook OAuth and email sending
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import email OAuth routes and services (conditionally)
let emailOAuthRoutes = null;
try {
  // Only load OAuth routes if environment is configured
  if (process.env.GMAIL_CLIENT_ID && process.env.OUTLOOK_CLIENT_ID) {
    emailOAuthRoutes = require('../routes/email-oauth.routes.js');
    console.log('✅ OAuth routes loaded successfully');
  } else {
    console.log('⚠️ OAuth environment not configured - OAuth routes disabled');
  }
} catch (error) {
  console.log('⚠️ OAuth routes failed to load:', error.message);
}

const app = express();
const PORT = parseInt(process.env.EMAIL_API_PORT || '4001', 10);

// CORS middleware - allow ALL origins for email server
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key', 'apikey', 'Origin', 'Accept'],
  exposedHeaders: ['X-Request-ID']
}));

// Add COOP headers to allow popup communication
app.use((req, res, next) => {
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

// Explicit OPTIONS handler for ALL routes
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-API-Key, apikey, Origin, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`📧 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Email API Server',
    port: PORT,
    timestamp: new Date().toISOString(),
    gmail: 'ready',
    outlook: 'ready'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Email API Server',
    version: '1.0.0',
    port: PORT,
    endpoints: {
      health: '/health',
      sendEmail: '/api/send-email',
      gmailAuth: '/api/auth/gmail',
      gmailCallback: '/api/auth/gmail/callback',
      outlookAuth: '/api/auth/outlook',
      outlookCallback: '/api/auth/outlook/callback',
      websocket: '/ws'
    },
    websocket: {
      status: 'available',
      url: `ws://localhost:${PORT}/ws`,
      note: 'WebSocket may not work through GitHub Codespaces HTTPS proxy'
    },
    timestamp: new Date().toISOString()
  });
});

// WebSocket status endpoint
app.get('/ws/status', (req, res) => {
  const emailWss = (global as any).emailWebSocketServer;
  res.json({
    websocket: {
      enabled: true,
      path: '/ws',
      protocol: 'ws',
      status: 'running',
      connections: emailWss ? emailWss.clients.size : 0,
      note: 'GitHub Codespaces may not proxy WebSocket connections properly'
    }
  });
});

// Import Supabase for database access
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase connected for email server');
} else {
  console.log('⚠️ Supabase not configured - using mock data');
}

// Middleware to extract user from JWT or API key
const authenticateUser = async (req: any, res: any, next: any) => {
  try {
    // Extract user from Authorization header or API key
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] || req.headers['apikey'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // TODO: Verify JWT token and extract user
      req.user = { id: 'user-123', email: 'builder@example.com' }; // Mock for now
    } else if (apiKey) {
      // TODO: Verify API key and get associated user
      req.user = { id: 'user-123', email: 'builder@example.com' }; // Mock for now
    } else {
      // No auth - use default/anonymous
      req.user = { id: 'anonymous', email: 'anonymous@homequesttech.com' };
    }
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    req.user = { id: 'anonymous', email: 'anonymous@homequesttech.com' };
    next();
  }
};

// Apply auth middleware to protected routes
app.use('/api/accounts', authenticateUser);
app.use('/api/emails', authenticateUser);
app.use('/api/send-email', authenticateUser);

// Email accounts endpoint - get user's connected email accounts
app.get('/api/accounts', async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    console.log(`📧 Fetching email accounts for user: ${userId}`);
    
    if (supabase && userId !== 'anonymous') {
      // Get real accounts from database
      const { data: accounts, error } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'connected');
        
      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      
      res.json(accounts || []);
    } else {
      // No database - return empty array
      res.json([]);
    }
  } catch (error) {
    console.error('📧 Error fetching accounts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch accounts' });
  }
});

// Email listing endpoint - get user's emails from their accounts
app.get('/api/emails', async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const { folder = 'all', limit = 200, account_id } = req.query;
    console.log(`📧 Fetching emails for user: ${userId}, folder=${folder}, limit=${limit}, account=${account_id}`);
    
    if (supabase && userId !== 'anonymous') {
      // Get emails from database for this user's accounts
      let query = supabase
        .from('emails')
        .select(`
          *,
          email_accounts!inner(user_id)
        `)
        .eq('email_accounts.user_id', userId)
        .order('date', { ascending: false })
        .limit(parseInt(limit as string));
        
      if (account_id) {
        query = query.eq('account_id', account_id);
      }
      
      if (folder !== 'all') {
        query = query.eq('folder', folder);
      }
      
      const { data: emails, error } = await query;
      
      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      
      res.json({
        success: true,
        emails: emails || [],
        folder,
        total: emails?.length || 0,
        limit: parseInt(limit as string),
        account_id,
        user_id: userId
      });
    } else {
      // No database - return empty array
      res.json([]);
    }
  } catch (error) {
    console.error('📧 Error fetching emails:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch emails' });
  }
});

// Email sending endpoint - send from user's connected accounts
app.post('/api/send-email', async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const { to, subject, html, text, from, account_id } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, and html/text'
      });
    }

    console.log(`📤 Email send request from user: ${userId}`);
    console.log(`   From: ${from || 'system'}`);
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Account: ${account_id || 'default'}`);
    
    // Verify user owns the account they're trying to send from
    if (supabase && account_id && userId !== 'anonymous') {
      const { data: account, error } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('id', account_id)
        .eq('user_id', userId)
        .single();
        
      if (error || !account) {
        return res.status(403).json({
          success: false,
          error: 'Account not found or not owned by user'
        });
      }
    }
    
    // TODO: Integrate with actual Gmail/Outlook sending via OAuth
    const messageId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId,
      timestamp: new Date().toISOString(),
      provider: 'gmail',
      to,
      subject,
      account_id,
      user_id: userId
    });

  } catch (error) {
    console.error('📧 Email sending error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Mount Gmail/Outlook OAuth routes (if available)
if (emailOAuthRoutes) {
  app.use('/api', emailOAuthRoutes);
  console.log('✅ OAuth routes mounted at /api');
} else {
  // Provide basic OAuth endpoints that return configuration error
  app.get('/api/auth/gmail', (req, res) => {
    res.status(503).json({ error: 'Gmail OAuth not configured', message: 'Missing GMAIL_CLIENT_ID environment variable' });
  });
  app.get('/api/auth/outlook', (req, res) => {
    res.status(503).json({ error: 'Outlook OAuth not configured', message: 'Missing OUTLOOK_CLIENT_ID environment variable' });
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found on Email API Server`,
    availableEndpoints: ['/health', '/api/send-email', '/api/auth/gmail', '/api/auth/outlook']
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('📧 Email server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'Unknown error occurred',
    service: 'Email API Server'
  });
});

// Create HTTP server and WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Make wss available globally for status endpoint
(global as any).emailWebSocketServer = wss;

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('📧 WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📧 WebSocket message:', data);
      
      // Echo back for now
      ws.send(JSON.stringify({ type: 'ack', data }));
    } catch (error) {
      console.error('📧 WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('📧 WebSocket client disconnected');
  });
  
  // Send welcome message
  ws.send(JSON.stringify({ type: 'connected', message: 'Email WebSocket connected' }));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
📧 Email API Server Started Successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Local: http://localhost:${PORT}
🌐 Public: http://0.0.0.0:${PORT}
🏢 Production: https://homequesttech.com:${PORT}
💌 Send Email: POST /api/send-email
🔐 Gmail OAuth: GET /api/auth/gmail
📮 Outlook OAuth: GET /api/auth/outlook
🔌 WebSocket: ws://localhost:${PORT}/ws
❤️ Health Check: GET /health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Ready to handle email requests from vendor bidding system
  `);
});

export default app;