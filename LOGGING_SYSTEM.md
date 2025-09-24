# Logging System Documentation

## Overview
Comprehensive logging system for the HomeQuest API backend server using Winston with daily file rotation.

## Features

### 1. **Multi-Level Logging**
- **Error** - Critical errors and exceptions
- **Warn** - Warning messages
- **Info** - General information
- **HTTP** - HTTP request/response logs
- **Verbose** - Detailed operational logs
- **Debug** - Debug information (development only)

### 2. **Log Categories**
- **[SYSTEM]** - Server startup, shutdown, configuration
- **[API]** - Request/response tracking
- **[BLUEPRINT]** - Blueprint processing operations
- **[CLAUDE]** - Claude Vision API calls
- **[OPENCV]** - OpenCV processing operations
- **[DB]** - Database operations
- **[PERFORMANCE]** - Performance metrics and slow operations
- **[CACHE]** - Cache operations

### 3. **Log Files**
Daily rotating log files stored in `/logs`:
- `YYYY-MM-DD-combined.log` - All logs
- `YYYY-MM-DD-error.log` - Error logs only
- `YYYY-MM-DD-http.log` - HTTP request logs

### 4. **Features**
- **Request IDs** - Unique ID for tracking requests
- **Performance Monitoring** - Automatic slow request detection
- **Error Stack Traces** - Full error details in development
- **Sensitive Data Redaction** - Passwords and tokens automatically redacted
- **Real-time Console Output** - Colorized logs in development
- **File Rotation** - Automatic daily rotation with 14-day retention

## Usage

### Viewing Logs

#### Interactive Log Viewer
```bash
./view-logs.sh
```

Options:
1. View combined logs
2. View error logs only
3. View HTTP request logs
4. Real-time combined logs
5. Real-time error logs
6. Blueprint processing logs
7. Performance/slow request logs
8. Last 50 lines of all logs
9. Clear all logs

#### Manual Commands
```bash
# View today's logs
cat logs/$(date +%Y-%m-%d)-combined.log

# Real-time logs
tail -f logs/$(date +%Y-%m-%d)-combined.log

# Filter blueprint logs
grep "[BLUEPRINT]" logs/$(date +%Y-%m-%d)-combined.log

# View errors
cat logs/$(date +%Y-%m-%d)-error.log
```

### Using in Code

```typescript
import { loggers } from './utils/logger';

// System logging
loggers.system.info('Server started', { port: 4000 });
loggers.system.error('Critical error', { error });

// API logging
loggers.api.info('Request received', { method, url });
loggers.api.warn('Rate limit exceeded', { ip });

// Blueprint processing
loggers.blueprint.process(blueprintId, 'Starting analysis');
loggers.blueprint.info('Processing complete', { accuracy: 88 });

// Performance tracking
const startTime = Date.now();
// ... operation ...
loggers.performance.measure('Blueprint processing', startTime);

// Claude API
loggers.claude.apiCall('claude-3-opus', tokens);

// OpenCV
loggers.opencv.info('Edge detection started');
```

## Log Format

### File Format
```
2025-08-26 16:48:44.266 [INFO]: [API] Incoming request {"requestId":"req_xxx","method":"GET","url":"/api/blueprint/demo"}
```

### Console Format (Development)
```
16:48:44 info: [API] Incoming request
{
  "requestId": "req_xxx",
  "method": "GET",
  "url": "/api/blueprint/demo"
}
```

## Configuration

### Environment Variables
```env
LOG_LEVEL=debug          # Log level (error|warn|info|http|verbose|debug)
LOG_DIR=./logs          # Directory for log files
NODE_ENV=development    # Environment (affects console output)
```

### Log Rotation Settings
- **Max Size**: 20MB for combined/error, 50MB for HTTP logs
- **Max Files**: 14 days for combined, 30 days for errors, 7 days for HTTP
- **Pattern**: Daily rotation (YYYY-MM-DD)

## Middleware

### Request Logger
Automatically logs all incoming requests and responses with:
- Request ID
- Method, URL, IP
- User agent
- Response status and time
- Slow request detection (>1s warning, >3s alert)

### Error Logger
Captures and logs all errors with:
- Full stack traces
- Request context
- Error codes and messages

### Blueprint Logger
Special logging for blueprint processing:
- File upload details
- Processing stages
- Accuracy metrics
- Performance measurements

### Performance Monitor
Tracks request performance:
- Response time
- Memory usage
- Slow operation alerts

## Best Practices

1. **Use appropriate log levels**
   - Error: Only for actual errors
   - Warn: For potential issues
   - Info: For important events
   - Debug: For development debugging

2. **Include context**
   ```typescript
   loggers.api.error('Failed to process', { 
     blueprintId, 
     error: error.message,
     userId 
   });
   ```

3. **Track performance**
   ```typescript
   const start = Date.now();
   await processBlueprint();
   loggers.performance.measure('Blueprint processing', start);
   ```

4. **Use request IDs**
   - All requests automatically get a unique ID
   - Include in error responses for debugging

## Monitoring

### Key Metrics to Watch
- **Error Rate** - Monitor error.log size and frequency
- **Response Times** - Check for slow request patterns
- **API Calls** - Track Claude Vision API usage
- **Memory Usage** - Monitor performance logs

### Alert Triggers
- Error rate spike
- Response time > 3 seconds
- Memory usage > 90%
- Uncaught exceptions

## Troubleshooting

### Common Issues

1. **Logs not appearing**
   - Check LOG_DIR permissions
   - Verify Winston is initialized
   - Check LOG_LEVEL setting

2. **Large log files**
   - Adjust rotation settings
   - Reduce LOG_LEVEL in production
   - Clear old logs regularly

3. **Missing request logs**
   - Ensure middleware is added to Express
   - Check Morgan configuration
   - Verify not skipping endpoints

## Example Output

### Successful Blueprint Processing
```
2025-08-26 16:50:23.123 [INFO]: [BLUEPRINT] Processing blueprint: floor-plan.png {"blueprintId":"bp_xxx","fileSize":2048576}
2025-08-26 16:50:23.456 [INFO]: [CLAUDE] API call to claude-3-opus {"model":"claude-3-opus","tokens":1500}
2025-08-26 16:50:24.789 [INFO]: [OPENCV] Starting edge detection {"operation":"detectEdges"}
2025-08-26 16:50:25.123 [INFO]: [PERFORMANCE] Blueprint processing completed in 2000ms {"duration":2000}
2025-08-26 16:50:25.125 [INFO]: [API] Request completed {"requestId":"req_xxx","statusCode":200,"responseTime":2002}
```

### Error Scenario
```
2025-08-26 16:51:00.001 [WARN]: [BLUEPRINT] Processing completed with errors {"errors":["Invalid scale"]}
2025-08-26 16:51:00.002 [ERROR]: [API] Request error {"error":{"message":"Processing failed","code":"INVALID_SCALE"}}
```

## Maintenance

### Daily Tasks
- Monitor error.log for issues
- Check for slow requests
- Review disk space usage

### Weekly Tasks
- Analyze performance trends
- Review API usage patterns
- Archive old logs if needed

### Monthly Tasks
- Update log retention policies
- Review and optimize log levels
- Audit sensitive data handling