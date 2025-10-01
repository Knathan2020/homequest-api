# HomeQuest API - Coding Rules & Security Standards

## 🚨 CRITICAL SECURITY RULES - NEVER VIOLATE

### 1. API KEY SECURITY - NEVER LEAK KEYS

#### ✅ CORRECT - Use Environment Variables
```typescript
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
```

#### ❌ WRONG - Never Hardcode Keys
```typescript
// NEVER DO THIS!
const VAPI_API_KEY = 'sk-vapi-abc123xyz789';
const apiKey = '1234567890abcdef';
```

#### API Key Usage Rules:
- **ALWAYS** use `process.env.VARIABLE_NAME`
- **NEVER** commit API keys to git
- **NEVER** log API keys to console
- **NEVER** return API keys in API responses
- **NEVER** expose keys in error messages
- **ALWAYS** check `.gitignore` includes `.env` files

#### Safe Error Handling:
```typescript
// ✅ GOOD - Don't expose the key
if (!process.env.VAPI_API_KEY) {
  return res.status(500).json({ error: 'VAPI_API_KEY not configured' });
}

// ❌ BAD - Exposes partial key
console.log('Using API key:', process.env.VAPI_API_KEY);
```

#### Environment Files:
- `.env` - Local development (git ignored)
- `.env.example` - Template with fake values (safe to commit)
- Production keys - Set in Render.com/Vercel dashboard, NEVER in code

---

## 🚫 NO PLACEHOLDER ENDPOINTS

### Rule: Never Create Fake/Mock Endpoints in Production Code

#### ❌ WRONG - Placeholder Returns
```typescript
app.post('/api/vapi/call', async (req, res) => {
  res.json({ success: true, callId: 'placeholder-call-id' });
});
```

#### ✅ CORRECT - Real Implementation or Proper Error
```typescript
app.post('/api/vapi/call', async (req, res) => {
  try {
    const result = await vapiService.initiateCall(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OR if not implemented yet:
app.post('/api/vapi/call', async (req, res) => {
  res.status(501).json({
    error: 'Not implemented yet',
    message: 'VAPI integration in progress'
  });
});
```

### Why This Matters:
- Placeholder endpoints mask real bugs
- They make debugging impossible
- They waste developer time
- Users think features work when they don't

---

## 📝 ROUTE ORDERING & ORGANIZATION

### Rule: Specific Routes BEFORE Generic Routes

#### ❌ WRONG - Placeholders Override Real Routes
```typescript
// This runs first and blocks everything
app.post('/api/vapi/call', (req, res) => {
  res.json({ success: true, callId: 'fake' });
});

// This NEVER runs because placeholder above catches it
app.use('/api/vapi', vapiRoutes);
```

#### ✅ CORRECT - Mount Real Routes First
```typescript
// Real routes first
app.use('/api/vapi', vapiRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/teams', teamsRoutes);

// Generic/fallback routes last
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});
```

---

## 🔐 NEVER EXPOSE SENSITIVE DATA

### What to NEVER Return in API Responses:
- API keys (VAPI, OpenAI, ElevenLabs, etc.)
- Database credentials
- Authentication tokens (except when explicitly requested)
- Internal server paths
- Full error stack traces in production
- User passwords (even hashed)
- Other users' private data

### Safe Response Examples:

#### ❌ WRONG - Leaks Internal Info
```typescript
res.json({
  user: {
    id: '123',
    email: 'user@example.com',
    password_hash: '$2b$10$...',  // Never include!
    api_key: 'sk-xxx',  // Never include!
    internal_notes: 'flagged user'  // Never include!
  }
});
```

#### ✅ CORRECT - Only Public Data
```typescript
res.json({
  user: {
    id: '123',
    email: 'user@example.com',
    name: 'John Doe',
    created_at: '2024-01-01'
  }
});
```

---

## 📋 LOGGING SECURITY

### Rules for Logging:
- **NEVER** log API keys
- **NEVER** log passwords
- **NEVER** log credit card numbers
- **NEVER** log personal identification numbers
- **ALWAYS** sanitize logs before output

#### ❌ WRONG - Logs Sensitive Data
```typescript
console.log('Request body:', req.body);  // Could contain passwords!
console.log('API Key:', process.env.VAPI_API_KEY);  // Leaks key!
console.log('Full error:', error);  // Could contain sensitive data
```

#### ✅ CORRECT - Safe Logging
```typescript
console.log('Request received for endpoint:', req.path);
console.log('VAPI configured:', !!process.env.VAPI_API_KEY);  // Just boolean
console.log('Error type:', error.message);  // Safe error message only

// For detailed debugging, sanitize first:
const sanitizedBody = { ...req.body };
delete sanitizedBody.password;
delete sanitizedBody.apiKey;
console.log('Request data:', sanitizedBody);
```

---

## 🧪 TESTING & MOCK DATA

### Rule: Mock Data Only in Test Files

#### File Naming for Tests:
- `*.test.ts` - Unit tests
- `*.spec.ts` - Integration tests
- `__mocks__/` directory - Mock implementations
- `fixtures/` directory - Test data

#### ❌ WRONG - Mock Data in Production
```typescript
// In src/services/vapi.service.ts
async initiateCall() {
  return { success: true, callId: 'test-123' };  // NEVER!
}
```

#### ✅ CORRECT - Mock in Test File
```typescript
// In src/services/vapi.service.test.ts
jest.mock('./vapi.service');
const mockVapi = {
  initiateCall: jest.fn().mockResolvedValue({
    success: true,
    callId: 'test-123'
  })
};
```

---

## ⚙️ REQUIRED ENVIRONMENT VARIABLES

### Checklist Before Deployment:

#### Production Environment Must Have:
```bash
# API Keys
VAPI_API_KEY=your_actual_vapi_key
OPENAI_API_KEY=your_actual_openai_key
ELEVENLABS_API_KEY=your_actual_elevenlabs_key

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
SUPABASE_ANON_KEY=your_anon_key

# Server
PORT=4000
NODE_ENV=production
WEBHOOK_BASE_URL=https://your-api.onrender.com
```

### Validation on Startup:
```typescript
// In src/server.ts startup
const requiredEnvVars = [
  'VAPI_API_KEY',
  'OPENAI_API_KEY',
  'SUPABASE_URL'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});
```

---

## 📦 .gitignore Security

### ALWAYS Include in .gitignore:
```
# Environment variables
.env
.env.local
.env.production
.env.*.local

# Credentials
credentials.json
service-account.json
*.pem
*.key

# Secrets
secrets/
.secrets

# API Keys
api-keys.txt
keys/
```

---

## ✅ BEFORE COMMITTING - CHECKLIST

- [ ] No hardcoded API keys in code
- [ ] No placeholder endpoints with fake data
- [ ] All secrets in environment variables
- [ ] `.env` files in `.gitignore`
- [ ] No sensitive data in logs
- [ ] No passwords or tokens in responses
- [ ] Routes ordered correctly (real before placeholders)
- [ ] Error messages don't expose internal details
- [ ] Mock data only in test files
- [ ] All required env vars documented

---

## 🔍 HOW TO FIND VIOLATIONS

### Search for potential API key leaks:
```bash
# Find hardcoded keys patterns
grep -r "api.*key.*=.*['\"]" src/ --include="*.ts" --include="*.js"
grep -r "sk-" src/ --include="*.ts" --include="*.js"
grep -r "Bearer.*[a-zA-Z0-9]" src/ --include="*.ts" --include="*.js"

# Find placeholder returns
grep -r "placeholder" src/ --include="*.ts" --include="*.js"
grep -r "mock.*data" src/ --include="*.ts" --include="*.js"
grep -r "fake.*id" src/ --include="*.ts" --include="*.js"

# Find console.log with sensitive data
grep -r "console.log.*API.*KEY" src/
grep -r "console.log.*password" src/
grep -r "console.log.*token" src/
```

---

## 🎯 SUMMARY

1. **API Keys**: Only in environment variables, never hardcoded
2. **No Placeholders**: Real implementations or proper error codes
3. **Route Order**: Real routes before generic/fallback routes
4. **No Leaks**: Never expose secrets in responses or logs
5. **Test Isolation**: Mocks only in test files
6. **Validation**: Check required env vars on startup
7. **Git Security**: All secrets in `.gitignore`

**When in doubt: If it's secret, it goes in `.env` - NEVER in code!**
