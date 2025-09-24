import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
    metadata?: Record<string, any>;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({ error: 'No authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        const decoded = jwt.verify(token, jwtSecret) as any;
        req.user = {
          id: decoded.sub || decoded.id,
          email: decoded.email,
          role: decoded.role,
          metadata: decoded.metadata
        };
      } else {
        req.user = {
          id: user.id,
          email: user.email || '',
          role: user.user_metadata?.role,
          metadata: user.user_metadata
        };
      }
      
      next();
    } catch (jwtError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    next();
    return;
  }

  await authMiddleware(req, res, next);
};