-- Twilio Builder Accounts Table
-- Each builder gets their own Twilio subaccount and phone number

CREATE TABLE IF NOT EXISTS twilio_builder_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    user_name VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    
    -- Twilio Subaccount Details
    subaccount_sid VARCHAR(50) NOT NULL UNIQUE,
    subaccount_auth_token VARCHAR(100) NOT NULL, -- Encrypted in production
    twilio_phone_number VARCHAR(20) NOT NULL UNIQUE,
    phone_number_sid VARCHAR(50) NOT NULL,
    friendly_name VARCHAR(255),
    
    -- Account Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
    
    -- Billing & Usage
    monthly_cost DECIMAL(10,2) DEFAULT 1.15, -- Base phone number cost
    call_count INTEGER DEFAULT 0,
    sms_count INTEGER DEFAULT 0,
    total_spent DECIMAL(10,2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    suspended_at TIMESTAMP,
    closed_at TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_phone_number (twilio_phone_number)
);

-- Call logs for each builder
CREATE TABLE IF NOT EXISTS builder_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    builder_account_id UUID REFERENCES twilio_builder_accounts(id),
    call_sid VARCHAR(50) UNIQUE,
    
    -- Call Details
    from_number VARCHAR(20),
    to_number VARCHAR(20),
    vendor_name VARCHAR(255),
    purpose VARCHAR(50),
    
    -- Call Status
    status VARCHAR(20),
    duration INTEGER, -- seconds
    recording_url TEXT,
    transcription TEXT,
    ai_summary TEXT,
    
    -- Costs
    call_cost DECIMAL(10,4),
    
    -- Timestamps
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP,
    
    INDEX idx_builder_account (builder_account_id),
    INDEX idx_call_sid (call_sid)
);

-- SMS logs for each builder
CREATE TABLE IF NOT EXISTS builder_sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    builder_account_id UUID REFERENCES twilio_builder_accounts(id),
    message_sid VARCHAR(50) UNIQUE,
    
    -- Message Details
    from_number VARCHAR(20),
    to_number VARCHAR(20),
    vendor_name VARCHAR(255),
    message_body TEXT,
    
    -- Status
    status VARCHAR(20),
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    
    -- Costs
    sms_cost DECIMAL(10,4),
    
    -- Timestamps
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    
    INDEX idx_builder_account_sms (builder_account_id),
    INDEX idx_message_sid (message_sid)
);

-- Monthly billing summary
CREATE TABLE IF NOT EXISTS builder_billing_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    builder_account_id UUID REFERENCES twilio_builder_accounts(id),
    
    -- Billing Period
    billing_month DATE NOT NULL,
    
    -- Usage Summary
    total_calls INTEGER DEFAULT 0,
    total_minutes INTEGER DEFAULT 0,
    total_sms INTEGER DEFAULT 0,
    
    -- Costs
    phone_number_cost DECIMAL(10,2) DEFAULT 1.15,
    call_charges DECIMAL(10,2) DEFAULT 0,
    sms_charges DECIMAL(10,2) DEFAULT 0,
    total_charges DECIMAL(10,2) DEFAULT 0,
    
    -- Payment Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
    paid_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_billing_period (builder_account_id, billing_month),
    INDEX idx_billing_month (billing_month),
    INDEX idx_payment_status (status)
);

-- View for active builder phone numbers
CREATE VIEW active_builder_phones AS
SELECT 
    user_id,
    user_name,
    company_name,
    twilio_phone_number,
    call_count,
    sms_count,
    last_used
FROM twilio_builder_accounts
WHERE status = 'active';

-- View for current month usage
CREATE VIEW current_month_usage AS
SELECT 
    tba.user_id,
    tba.user_name,
    tba.twilio_phone_number,
    COUNT(DISTINCT bcl.id) as calls_this_month,
    COUNT(DISTINCT bsl.id) as sms_this_month,
    COALESCE(SUM(bcl.call_cost), 0) + COALESCE(SUM(bsl.sms_cost), 0) as total_cost_this_month
FROM twilio_builder_accounts tba
LEFT JOIN builder_call_logs bcl ON tba.id = bcl.builder_account_id 
    AND DATE_TRUNC('month', bcl.initiated_at) = DATE_TRUNC('month', CURRENT_DATE)
LEFT JOIN builder_sms_logs bsl ON tba.id = bsl.builder_account_id
    AND DATE_TRUNC('month', bsl.sent_at) = DATE_TRUNC('month', CURRENT_DATE)
WHERE tba.status = 'active'
GROUP BY tba.user_id, tba.user_name, tba.twilio_phone_number;