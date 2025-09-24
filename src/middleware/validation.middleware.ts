import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { z, ZodError, ZodSchema } from 'zod';

export type ValidationSchema = Joi.Schema | ZodSchema;

export interface ValidationOptions {
  abortEarly?: boolean;
  stripUnknown?: boolean;
  context?: Record<string, any>;
}

export const validateJoi = (
  schema: Joi.Schema,
  property: 'body' | 'query' | 'params' = 'body',
  options: ValidationOptions = {}
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: options.abortEarly ?? false,
      stripUnknown: options.stripUnknown ?? true,
      context: options.context,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      res.status(400).json({
        error: 'Validation error',
        errors,
      });
      return;
    }

    req[property] = value;
    next();
  };
};

export const validateZod = (
  schema: ZodSchema,
  property: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req[property]);
      req[property] = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          type: err.code,
        }));

        res.status(400).json({
          error: 'Validation error',
          errors,
        });
        return;
      }

      res.status(500).json({
        error: 'Internal validation error',
      });
    }
  };
};

export const validate = (
  schema: ValidationSchema,
  property: 'body' | 'query' | 'params' = 'body',
  options?: ValidationOptions
) => {
  if (Joi.isSchema(schema)) {
    return validateJoi(schema as Joi.Schema, property, options);
  } else {
    return validateZod(schema as ZodSchema, property);
  }
};

export const commonSchemas = {
  joi: {
    id: Joi.string().uuid().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
    url: Joi.string().uri(),
    date: Joi.date().iso(),
    pagination: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      sort: Joi.string(),
      order: Joi.string().valid('asc', 'desc').default('asc'),
    }),
  },
  zod: {
    id: z.string().uuid(),
    email: z.string().email(),
    password: z.string().min(8),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    url: z.string().url(),
    date: z.string().datetime(),
    pagination: z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      sort: z.string().optional(),
      order: z.enum(['asc', 'desc']).default('asc'),
    }),
  },
};

export const createValidator = () => {
  return {
    body: (schema: ValidationSchema) => validate(schema, 'body'),
    query: (schema: ValidationSchema) => validate(schema, 'query'),
    params: (schema: ValidationSchema) => validate(schema, 'params'),
  };
};

export const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    return input.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        sanitized[key] = sanitizeInput(input[key]);
      }
    }
    return sanitized;
  }
  return input;
};

export const sanitizeMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  req.body = sanitizeInput(req.body);
  req.query = sanitizeInput(req.query);
  req.params = sanitizeInput(req.params);
  next();
};