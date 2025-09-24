/**
 * API Type Definitions
 * Standard types for API requests, responses, and error handling
 */

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/**
 * HTTP status codes
 */
export enum HttpStatus {
  // Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  PARTIAL_CONTENT = 206,
  
  // Redirection
  MOVED_PERMANENTLY = 301,
  FOUND = 302,
  NOT_MODIFIED = 304,
  TEMPORARY_REDIRECT = 307,
  PERMANENT_REDIRECT = 308,
  
  // Client errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  PAYMENT_REQUIRED = 402,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  NOT_ACCEPTABLE = 406,
  REQUEST_TIMEOUT = 408,
  CONFLICT = 409,
  GONE = 410,
  LENGTH_REQUIRED = 411,
  PRECONDITION_FAILED = 412,
  PAYLOAD_TOO_LARGE = 413,
  URI_TOO_LONG = 414,
  UNSUPPORTED_MEDIA_TYPE = 415,
  RANGE_NOT_SATISFIABLE = 416,
  EXPECTATION_FAILED = 417,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  
  // Server errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
  HTTP_VERSION_NOT_SUPPORTED = 505
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
  requestId?: string;
  version?: string;
  metadata?: ResponseMetadata;
}

/**
 * Successful API response
 */
export interface ApiSuccessResponse<T = any> extends ApiResponse<T> {
  success: true;
  data: T;
  warnings?: ApiWarning[];
}

/**
 * Error API response
 */
export interface ApiErrorResponse extends ApiResponse<null> {
  success: false;
  error: ApiError;
  data: null;
}

/**
 * API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  status: HttpStatus;
  details?: ErrorDetails;
  timestamp: string;
  path?: string;
  method?: HttpMethod;
  requestId?: string;
  stack?: string; // Only in development
}

/**
 * Detailed error information
 */
export interface ErrorDetails {
  type: ErrorType;
  field?: string;
  value?: any;
  constraint?: string;
  suggestion?: string;
  documentation?: string;
  validationErrors?: ValidationError[];
  innerError?: ApiError;
  context?: Record<string, any>;
}

/**
 * Error types
 */
export enum ErrorType {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  RATE_LIMIT = 'rate_limit',
  BUSINESS_LOGIC = 'business_logic',
  EXTERNAL_SERVICE = 'external_service',
  DATABASE = 'database',
  FILE_SYSTEM = 'file_system',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  INTERNAL = 'internal',
  CONFIGURATION = 'configuration',
  UNSUPPORTED = 'unsupported'
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
  constraint?: ValidationConstraint;
}

/**
 * Validation constraint
 */
export interface ValidationConstraint {
  type: 'required' | 'min' | 'max' | 'pattern' | 'enum' | 'type' | 'custom';
  value?: any;
  message?: string;
}

/**
 * API warning
 */
export interface ApiWarning {
  code: string;
  message: string;
  field?: string;
  severity: 'high' | 'medium' | 'low';
  suggestion?: string;
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
  processingTime?: number; // Milliseconds
  serverTime?: string;
  serverRegion?: string;
  cacheStatus?: 'hit' | 'miss' | 'bypass';
  rateLimit?: RateLimitInfo;
  deprecation?: DeprecationInfo;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: string; // ISO timestamp
  retryAfter?: number; // Seconds
}

/**
 * Deprecation information
 */
export interface DeprecationInfo {
  deprecated: boolean;
  message?: string;
  since?: string;
  removal?: string;
  alternative?: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T = any> extends ApiSuccessResponse<T[]> {
  data: T[];
  pagination: PaginationInfo;
  sorting?: SortingInfo;
  filtering?: FilteringInfo;
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
  nextPage?: number;
  previousPage?: number;
  firstPage: number;
  lastPage: number;
  links?: PaginationLinks;
}

/**
 * Pagination links (HATEOAS)
 */
export interface PaginationLinks {
  self: string;
  first?: string;
  last?: string;
  next?: string;
  previous?: string;
}

/**
 * Sorting information
 */
export interface SortingInfo {
  field: string;
  direction: 'asc' | 'desc';
  nullsFirst?: boolean;
  options?: SortOption[];
}

/**
 * Sort option
 */
export interface SortOption {
  field: string;
  label: string;
  defaultDirection?: 'asc' | 'desc';
}

/**
 * Filtering information
 */
export interface FilteringInfo {
  applied: FilterCriteria[];
  available: FilterOption[];
  query?: string;
}

/**
 * Filter criteria
 */
export interface FilterCriteria {
  field: string;
  operator: FilterOperator;
  value: any;
  label?: string;
}

/**
 * Filter operators
 */
export type FilterOperator = 
  | 'eq' | 'neq' 
  | 'gt' | 'gte' 
  | 'lt' | 'lte' 
  | 'in' | 'nin' 
  | 'contains' | 'startsWith' | 'endsWith' 
  | 'between' | 'exists' | 'regex';

/**
 * Filter option
 */
export interface FilterOption {
  field: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'enum' | 'range';
  operators: FilterOperator[];
  values?: any[];
  defaultValue?: any;
}

/**
 * API request with common parameters
 */
export interface ApiRequest<T = any> {
  data?: T;
  params?: QueryParams;
  headers?: RequestHeaders;
  auth?: AuthInfo;
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

/**
 * Query parameters
 */
export interface QueryParams {
  [key: string]: string | number | boolean | string[] | number[] | undefined;
}

/**
 * Request headers
 */
export interface RequestHeaders {
  [key: string]: string | string[] | undefined;
}

/**
 * Authentication information
 */
export interface AuthInfo {
  type: 'bearer' | 'basic' | 'apikey' | 'oauth2' | 'custom';
  credentials: string;
  scope?: string[];
}

/**
 * Batch request
 */
export interface BatchRequest {
  id: string;
  requests: SingleBatchRequest[];
  parallel?: boolean;
  stopOnError?: boolean;
  timeout?: number;
}

/**
 * Single request in batch
 */
export interface SingleBatchRequest {
  id: string;
  method: HttpMethod;
  path: string;
  data?: any;
  headers?: RequestHeaders;
  dependsOn?: string[];
}

/**
 * Batch response
 */
export interface BatchResponse {
  id: string;
  responses: SingleBatchResponse[];
  failed: number;
  succeeded: number;
  partial?: boolean;
}

/**
 * Single response in batch
 */
export interface SingleBatchResponse {
  id: string;
  status: HttpStatus;
  data?: any;
  error?: ApiError;
  headers?: ResponseHeaders;
}

/**
 * Response headers
 */
export interface ResponseHeaders {
  [key: string]: string | string[];
}

/**
 * File upload request
 */
export interface FileUploadRequest {
  file: File | Blob;
  filename?: string;
  metadata?: Record<string, any>;
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Upload progress
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed?: number; // Bytes per second
  remainingTime?: number; // Seconds
}

/**
 * File upload response
 */
export interface FileUploadResponse {
  id: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  metadata?: Record<string, any>;
}

/**
 * WebSocket message
 */
export interface WebSocketMessage<T = any> {
  id: string;
  type: 'message' | 'ping' | 'pong' | 'error' | 'close';
  event?: string;
  data?: T;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Server-sent event
 */
export interface ServerSentEvent<T = any> {
  id?: string;
  event?: string;
  data: T;
  retry?: number;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services?: ServiceHealth[];
  metrics?: HealthMetrics;
}

/**
 * Service health status
 */
export interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  lastCheck?: string;
  error?: string;
}

/**
 * Health metrics
 */
export interface HealthMetrics {
  cpu: number;
  memory: number;
  disk: number;
  requestsPerSecond?: number;
  activeConnections?: number;
  errorRate?: number;
}

/**
 * API documentation
 */
export interface ApiDocumentation {
  openapi: string;
  info: ApiInfo;
  servers: ApiServer[];
  paths: Record<string, PathItem>;
  components?: Components;
}

/**
 * API information
 */
export interface ApiInfo {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: Contact;
  license?: License;
}

/**
 * API server
 */
export interface ApiServer {
  url: string;
  description?: string;
  variables?: Record<string, ServerVariable>;
}

/**
 * Server variable
 */
export interface ServerVariable {
  default: string;
  description?: string;
  enum?: string[];
}

/**
 * Path item
 */
export interface PathItem {
  summary?: string;
  description?: string;
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  parameters?: Parameter[];
}

/**
 * API operation
 */
export interface Operation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  deprecated?: boolean;
  security?: SecurityRequirement[];
}

/**
 * API parameter
 */
export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: Schema;
}

/**
 * Request body
 */
export interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, MediaType>;
}

/**
 * API response
 */
export interface Response {
  description: string;
  headers?: Record<string, Header>;
  content?: Record<string, MediaType>;
}

/**
 * Media type
 */
export interface MediaType {
  schema?: Schema;
  example?: any;
  examples?: Record<string, Example>;
}

/**
 * Schema definition
 */
export interface Schema {
  type?: string;
  format?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: any[];
  example?: any;
}

/**
 * Example
 */
export interface Example {
  summary?: string;
  description?: string;
  value: any;
}

/**
 * Header
 */
export interface Header {
  description?: string;
  required?: boolean;
  schema?: Schema;
}

/**
 * Components
 */
export interface Components {
  schemas?: Record<string, Schema>;
  responses?: Record<string, Response>;
  parameters?: Record<string, Parameter>;
  examples?: Record<string, Example>;
  requestBodies?: Record<string, RequestBody>;
  headers?: Record<string, Header>;
  securitySchemes?: Record<string, SecurityScheme>;
}

/**
 * Security scheme
 */
export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: OAuthFlows;
  openIdConnectUrl?: string;
}

/**
 * OAuth flows
 */
export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

/**
 * OAuth flow
 */
export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

/**
 * Security requirement
 */
export interface SecurityRequirement {
  [key: string]: string[];
}

/**
 * Contact information
 */
export interface Contact {
  name?: string;
  url?: string;
  email?: string;
}

/**
 * License information
 */
export interface License {
  name: string;
  url?: string;
}