import { z } from 'zod';
import Joi from 'joi';

export const zodSchemas = {
  uuid: z.string().uuid(),
  email: z.string().email().toLowerCase().trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .transform(val => val.replace(/\D/g, '')),
  
  url: z.string().url(),
  
  date: z.string().datetime(),
  
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('asc'),
    search: z.string().optional(),
  }),

  coordinates: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),

  address: z.object({
    street: z.string().min(1).max(255),
    city: z.string().min(1).max(100),
    state: z.string().min(2).max(50),
    country: z.string().min(2).max(100),
    postalCode: z.string().regex(/^[A-Z0-9\s-]{3,10}$/i),
  }),

  fileUpload: z.object({
    filename: z.string(),
    mimetype: z.string(),
    size: z.number().max(100 * 1024 * 1024),
    path: z.string().optional(),
  }),

  imageUpload: z.object({
    filename: z.string(),
    mimetype: z.enum([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/tiff',
    ]),
    size: z.number().max(50 * 1024 * 1024),
    width: z.number().optional(),
    height: z.number().optional(),
  }),

  user: z.object({
    id: z.string().uuid().optional(),
    email: z.string().email().toLowerCase().trim(),
    password: z.string().min(8).optional(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    phone: z.string().optional(),
    role: z.enum(['admin', 'user', 'contractor', 'architect', 'engineer']).default('user'),
    isActive: z.boolean().default(true),
    metadata: z.record(z.any()).optional(),
  }),

  project: z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    type: z.enum(['residential', 'commercial', 'industrial', 'infrastructure']),
    status: z.enum(['planning', 'in_progress', 'completed', 'on_hold', 'cancelled']),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    budget: z.number().positive().optional(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
      country: z.string(),
    }).optional(),
    metadata: z.record(z.any()).optional(),
  }),

  floorPlan: z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    name: z.string().min(1).max(255),
    level: z.number().int(),
    area: z.number().positive(),
    units: z.enum(['sqft', 'sqm']).default('sqft'),
    rooms: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      area: z.number().positive(),
      dimensions: z.object({
        width: z.number().positive(),
        height: z.number().positive(),
        length: z.number().positive().optional(),
      }),
      position: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number().optional(),
      }),
    })).optional(),
    walls: z.array(z.object({
      id: z.string(),
      start: z.object({ x: z.number(), y: z.number() }),
      end: z.object({ x: z.number(), y: z.number() }),
      thickness: z.number().positive(),
      height: z.number().positive(),
      hasWindow: z.boolean().optional(),
      hasDoor: z.boolean().optional(),
    })).optional(),
  }),

  measurement: z.object({
    value: z.number(),
    unit: z.enum(['mm', 'cm', 'm', 'in', 'ft', 'yd']),
    precision: z.number().optional(),
  }),

  modelExport: z.object({
    format: z.enum(['obj', 'stl', 'ply', 'gltf', 'glb', 'fbx', 'dae']),
    quality: z.enum(['low', 'medium', 'high', 'ultra']).default('medium'),
    includeTextures: z.boolean().default(true),
    includeMaterials: z.boolean().default(true),
    scale: z.number().positive().default(1),
  }),
};

export const joiSchemas = {
  uuid: Joi.string().uuid(),
  email: Joi.string().email().lowercase().trim(),
  password: Joi.string()
    .min(8)
    .pattern(/[A-Z]/, 'uppercase')
    .pattern(/[a-z]/, 'lowercase')
    .pattern(/[0-9]/, 'number')
    .pattern(/[^A-Za-z0-9]/, 'special'),
  
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
  
  url: Joi.string().uri(),
  
  date: Joi.date().iso(),
  
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string(),
    order: Joi.string().valid('asc', 'desc').default('asc'),
    search: Joi.string(),
  }),

  coordinates: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
  }),

  address: Joi.object({
    street: Joi.string().min(1).max(255).required(),
    city: Joi.string().min(1).max(100).required(),
    state: Joi.string().min(2).max(50).required(),
    country: Joi.string().min(2).max(100).required(),
    postalCode: Joi.string().pattern(/^[A-Z0-9\s-]{3,10}$/i).required(),
  }),

  fileUpload: Joi.object({
    filename: Joi.string().required(),
    mimetype: Joi.string().required(),
    size: Joi.number().max(100 * 1024 * 1024).required(),
    path: Joi.string(),
  }),

  imageUpload: Joi.object({
    filename: Joi.string().required(),
    mimetype: Joi.string().valid(
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/tiff'
    ).required(),
    size: Joi.number().max(50 * 1024 * 1024).required(),
    width: Joi.number(),
    height: Joi.number(),
  }),

  user: Joi.object({
    id: Joi.string().uuid(),
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().min(8),
    firstName: Joi.string().min(1).max(100).required(),
    lastName: Joi.string().min(1).max(100).required(),
    phone: Joi.string(),
    role: Joi.string().valid('admin', 'user', 'contractor', 'architect', 'engineer').default('user'),
    isActive: Joi.boolean().default(true),
    metadata: Joi.object(),
  }),

  project: Joi.object({
    id: Joi.string().uuid(),
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string(),
    type: Joi.string().valid('residential', 'commercial', 'industrial', 'infrastructure').required(),
    status: Joi.string().valid('planning', 'in_progress', 'completed', 'on_hold', 'cancelled').required(),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    budget: Joi.number().positive(),
    address: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      postalCode: Joi.string().required(),
      country: Joi.string().required(),
    }),
    metadata: Joi.object(),
  }),
};

export const customValidators = {
  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  isValidPhone: (phone: string): boolean => {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  },

  isValidUUID: (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  },

  isValidUrl: (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  isValidImageMimeType: (mimeType: string): boolean => {
    const validTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/tiff',
    ];
    return validTypes.includes(mimeType);
  },

  isValidFileSize: (size: number, maxSizeMB: number = 100): boolean => {
    return size <= maxSizeMB * 1024 * 1024;
  },

  sanitizeFilename: (filename: string): string => {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  },

  validatePassword: (password: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return { valid: errors.length === 0, errors };
  },

  validateCoordinates: (lat: number, lng: number): boolean => {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  },

  parseBoolean: (value: any): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    }
    return !!value;
  },

  normalizeEmail: (email: string): string => {
    return email.toLowerCase().trim();
  },

  normalizePhone: (phone: string): string => {
    return phone.replace(/\D/g, '');
  },
};

export const apiSchemas = {
  auth: {
    login: z.object({
      email: zodSchemas.email,
      password: z.string().min(1),
    }),
    
    register: z.object({
      email: zodSchemas.email,
      password: zodSchemas.password,
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      phone: zodSchemas.phone.optional(),
    }),
    
    resetPassword: z.object({
      email: zodSchemas.email,
    }),
    
    changePassword: z.object({
      currentPassword: z.string().min(1),
      newPassword: zodSchemas.password,
    }),
  },

  floorPlan: {
    upload: z.object({
      projectId: zodSchemas.uuid,
      name: z.string().min(1).max(255),
      level: z.number().int().default(0),
      file: zodSchemas.imageUpload,
    }),
    
    process: z.object({
      floorPlanId: zodSchemas.uuid,
      options: z.object({
        detectRooms: z.boolean().default(true),
        detectDimensions: z.boolean().default(true),
        detectWalls: z.boolean().default(true),
        detectDoors: z.boolean().default(true),
        detectWindows: z.boolean().default(true),
        enhanceQuality: z.boolean().default(false),
        generateModel: z.boolean().default(false),
      }).optional(),
    }),
    
    export: z.object({
      floorPlanId: zodSchemas.uuid,
      format: zodSchemas.modelExport.shape.format,
      options: zodSchemas.modelExport.omit({ format: true }).optional(),
    }),
  },

  project: {
    create: zodSchemas.project.omit({ id: true }),
    update: zodSchemas.project.partial().required({ id: true }),
    list: zodSchemas.pagination,
  },

  user: {
    create: zodSchemas.user.omit({ id: true }),
    update: zodSchemas.user.partial().required({ id: true }),
    list: zodSchemas.pagination.extend({
      role: z.enum(['admin', 'user', 'contractor', 'architect', 'engineer']).optional(),
      isActive: z.boolean().optional(),
    }),
  },
};

export default {
  zod: zodSchemas,
  joi: joiSchemas,
  custom: customValidators,
  api: apiSchemas,
};