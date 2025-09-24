export const APP_CONFIG = {
  NAME: 'HomeQuest API',
  VERSION: '1.0.0',
  DESCRIPTION: 'Floor Plan Processing API with OCR, Computer Vision, and AI capabilities',
  ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  API_PREFIX: '/api/v1',
} as const;

export const DATABASE = {
  CONNECTION_TIMEOUT: 30000,
  QUERY_TIMEOUT: 10000,
  MAX_CONNECTIONS: 20,
  MIN_CONNECTIONS: 5,
  IDLE_TIMEOUT: 10000,
} as const;

export const REDIS = {
  DEFAULT_TTL: 3600,
  MAX_RETRIES: 3,
  RETRY_DELAY: 100,
  CONNECTION_TIMEOUT: 5000,
  CACHE_PREFIX: 'cache:',
  SESSION_PREFIX: 'session:',
  QUEUE_PREFIX: 'queue:',
} as const;

export const AUTH = {
  JWT_EXPIRES_IN: '7d',
  JWT_REFRESH_EXPIRES_IN: '30d',
  BCRYPT_ROUNDS: 10,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_RESET_EXPIRES: 3600000,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_TIME: 900000,
  SESSION_DURATION: 86400000,
  COOKIE_MAX_AGE: 604800000,
} as const;

export const RATE_LIMIT = {
  WINDOW_MS: 60000,
  MAX_REQUESTS: 100,
  AUTH_MAX_REQUESTS: 5,
  AUTH_WINDOW_MS: 900000,
  UPLOAD_MAX_REQUESTS: 10,
  UPLOAD_WINDOW_MS: 3600000,
} as const;

export const FILE_UPLOAD = {
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  MAX_IMAGE_SIZE: 50 * 1024 * 1024,
  MAX_DOCUMENT_SIZE: 25 * 1024 * 1024,
  ALLOWED_IMAGE_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
  ],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  TEMP_DIR: process.env.TEMP_DIR || 'temp',
} as const;

export const QUEUE = {
  DEFAULT_ATTEMPTS: 3,
  DEFAULT_BACKOFF_DELAY: 5000,
  DEFAULT_TIMEOUT: 300000,
  STALLED_INTERVAL: 30000,
  MAX_STALLED_COUNT: 2,
  REMOVE_ON_COMPLETE: 100,
  REMOVE_ON_FAIL: 50,
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  NOT_MODIFIED: 304,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export const ERROR_MESSAGES = {
  INTERNAL_ERROR: 'An internal server error occurred',
  INVALID_REQUEST: 'Invalid request',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation error',
  DUPLICATE_ENTRY: 'Duplicate entry',
  RATE_LIMIT_EXCEEDED: 'Too many requests',
  FILE_TOO_LARGE: 'File size exceeds maximum allowed',
  INVALID_FILE_TYPE: 'Invalid file type',
  MISSING_REQUIRED_FIELD: 'Missing required field',
  INVALID_CREDENTIALS: 'Invalid credentials',
  TOKEN_EXPIRED: 'Token has expired',
  TOKEN_INVALID: 'Invalid token',
  SESSION_EXPIRED: 'Session has expired',
  ACCOUNT_LOCKED: 'Account is locked',
  EMAIL_ALREADY_EXISTS: 'Email already exists',
  USERNAME_ALREADY_EXISTS: 'Username already exists',
  PASSWORD_TOO_WEAK: 'Password does not meet requirements',
  OPERATION_FAILED: 'Operation failed',
  DATABASE_ERROR: 'Database operation failed',
  NETWORK_ERROR: 'Network error occurred',
} as const;

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  CONTRACTOR = 'contractor',
  ARCHITECT = 'architect',
  ENGINEER = 'engineer',
}

export enum ProjectStatus {
  PLANNING = 'planning',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ON_HOLD = 'on_hold',
  CANCELLED = 'cancelled',
}

export enum ProjectType {
  RESIDENTIAL = 'residential',
  COMMERCIAL = 'commercial',
  INDUSTRIAL = 'industrial',
  INFRASTRUCTURE = 'infrastructure',
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum QueueName {
  IMAGE_PROCESSING = 'image-processing',
  OCR_PROCESSING = 'ocr-processing',
  AI_PROCESSING = 'ai-processing',
  MODEL_GENERATION = 'model-generation',
  EMAIL_NOTIFICATION = 'email-notification',
  REPORT_GENERATION = 'report-generation',
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly',
}

export enum CacheKey {
  USER = 'user',
  PROJECT = 'project',
  FLOOR_PLAN = 'floor-plan',
  PROCESSING_RESULT = 'processing-result',
  SESSION = 'session',
  RATE_LIMIT = 'rate-limit',
}

export enum EventType {
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_DELETED = 'project.deleted',
  FLOOR_PLAN_UPLOADED = 'floor-plan.uploaded',
  FLOOR_PLAN_PROCESSED = 'floor-plan.processed',
  FLOOR_PLAN_FAILED = 'floor-plan.failed',
  MODEL_GENERATED = 'model.generated',
  REPORT_GENERATED = 'report.generated',
}

export enum MeasurementUnit {
  MILLIMETER = 'mm',
  CENTIMETER = 'cm',
  METER = 'm',
  INCH = 'in',
  FOOT = 'ft',
  YARD = 'yd',
}

export enum ExportFormat {
  OBJ = 'obj',
  STL = 'stl',
  PLY = 'ply',
  GLTF = 'gltf',
  GLB = 'glb',
  FBX = 'fbx',
  DAE = 'dae',
  PDF = 'pdf',
  PNG = 'png',
  JPEG = 'jpeg',
  SVG = 'svg',
}

export enum RoomType {
  BEDROOM = 'bedroom',
  BATHROOM = 'bathroom',
  KITCHEN = 'kitchen',
  LIVING_ROOM = 'living_room',
  DINING_ROOM = 'dining_room',
  OFFICE = 'office',
  GARAGE = 'garage',
  BASEMENT = 'basement',
  ATTIC = 'attic',
  HALLWAY = 'hallway',
  CLOSET = 'closet',
  UTILITY = 'utility',
  STORAGE = 'storage',
  OTHER = 'other',
}

export enum WallType {
  EXTERIOR = 'exterior',
  INTERIOR = 'interior',
  LOAD_BEARING = 'load_bearing',
  PARTITION = 'partition',
}

export enum DoorType {
  SINGLE = 'single',
  DOUBLE = 'double',
  SLIDING = 'sliding',
  FOLDING = 'folding',
  REVOLVING = 'revolving',
  GARAGE = 'garage',
}

export enum WindowType {
  SINGLE_HUNG = 'single_hung',
  DOUBLE_HUNG = 'double_hung',
  CASEMENT = 'casement',
  SLIDING = 'sliding',
  AWNING = 'awning',
  FIXED = 'fixed',
  BAY = 'bay',
  BOW = 'bow',
}

export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  ALPHA: /^[a-zA-Z]+$/,
  NUMERIC: /^[0-9]+$/,
  POSTAL_CODE: /^[A-Z0-9\s-]{3,10}$/i,
  USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,
  PASSWORD_STRONG: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
} as const;

export const DATE_FORMATS = {
  DEFAULT: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  TIME: 'HH:mm:ss',
  DISPLAY_DATE: 'MMM DD, YYYY',
  DISPLAY_DATETIME: 'MMM DD, YYYY HH:mm',
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
} as const;

export const MIME_TYPES = {
  JSON: 'application/json',
  TEXT: 'text/plain',
  HTML: 'text/html',
  XML: 'application/xml',
  PDF: 'application/pdf',
  ZIP: 'application/zip',
  OCTET_STREAM: 'application/octet-stream',
} as const;

export const HEADERS = {
  CONTENT_TYPE: 'Content-Type',
  AUTHORIZATION: 'Authorization',
  ACCEPT: 'Accept',
  USER_AGENT: 'User-Agent',
  CACHE_CONTROL: 'Cache-Control',
  ETAG: 'ETag',
  LAST_MODIFIED: 'Last-Modified',
  LOCATION: 'Location',
  RETRY_AFTER: 'Retry-After',
  X_REQUEST_ID: 'X-Request-ID',
  X_RATE_LIMIT_LIMIT: 'X-RateLimit-Limit',
  X_RATE_LIMIT_REMAINING: 'X-RateLimit-Remaining',
  X_RATE_LIMIT_RESET: 'X-RateLimit-Reset',
} as const;

export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

export default {
  APP_CONFIG,
  DATABASE,
  REDIS,
  AUTH,
  RATE_LIMIT,
  FILE_UPLOAD,
  QUEUE,
  PAGINATION,
  HTTP_STATUS,
  ERROR_MESSAGES,
  UserRole,
  ProjectStatus,
  ProjectType,
  ProcessingStatus,
  QueueName,
  LogLevel,
  CacheKey,
  EventType,
  MeasurementUnit,
  ExportFormat,
  RoomType,
  WallType,
  DoorType,
  WindowType,
  REGEX_PATTERNS,
  DATE_FORMATS,
  MIME_TYPES,
  HEADERS,
  ENVIRONMENTS,
};