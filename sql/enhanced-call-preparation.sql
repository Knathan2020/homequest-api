-- Enhanced Call Preparation Schema
-- Tables to support intelligent call context preparation

-- Enhanced vendor profiles with detailed intelligence
CREATE TABLE IF NOT EXISTS public.vendor_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    website TEXT,

    -- Specializations and experience
    specializations TEXT[] DEFAULT '{}',
    experience_years INTEGER,
    typical_project_size TEXT,
    preferred_communication_style TEXT DEFAULT 'direct',

    -- Availability patterns
    preferred_contact_times TEXT[] DEFAULT '{"9:00 AM - 5:00 PM"}',
    timezone TEXT DEFAULT 'EST',
    busy_seasons TEXT[] DEFAULT '{}',

    -- Competitive positioning
    price_range TEXT DEFAULT 'mid-tier',
    specialties TEXT[] DEFAULT '{}',
    years_in_business INTEGER,

    -- Metadata
    team_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(phone, team_id)
);

-- Call contexts for storing prepared intelligent context
CREATE TABLE IF NOT EXISTS public.call_contexts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendor_phone TEXT NOT NULL,
    session_id TEXT,

    -- Enhanced context data (JSONB for flexible structure)
    context JSONB NOT NULL,

    -- Performance tracking
    call_success BOOLEAN,
    call_duration INTEGER,
    objectives_achieved TEXT[],

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

-- Call campaigns table (enhanced version)
CREATE TABLE IF NOT EXISTS public.call_campaigns (
    id TEXT PRIMARY KEY,
    team_id UUID NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',

    -- Project details
    project_details JSONB NOT NULL,
    target_vendors JSONB NOT NULL DEFAULT '[]',

    -- Campaign settings
    call_settings JSONB NOT NULL DEFAULT '{
        "max_calls_per_day": 50,
        "call_hours": {"start": "09:00", "end": "17:00"},
        "retry_failed": true,
        "max_retries": 3,
        "time_between_calls": 2,
        "ai_personality": "friendly",
        "success_criteria": {
            "meeting_scheduled": true,
            "quote_requested": true,
            "interest_shown": true,
            "callback_requested": false
        }
    }',

    -- Automation rules
    automation_rules JSONB NOT NULL DEFAULT '{
        "auto_schedule_followup": true,
        "followup_delay_hours": 24,
        "auto_send_details": true,
        "auto_book_meetings": true,
        "escalate_to_human_after_failures": 3
    }',

    -- Performance tracking
    performance JSONB NOT NULL DEFAULT '{
        "total_calls": 0,
        "successful_calls": 0,
        "meetings_scheduled": 0,
        "quotes_received": 0,
        "conversion_rate": 0
    }',

    -- Scheduling
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    scheduled_start TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Insert sample vendor data only if table exists and has the right structure
DO $$
BEGIN
    -- Check if the table exists and has the expected columns
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'vendor_profiles'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'vendor_profiles'
        AND column_name = 'name'
    ) THEN
        -- Insert sample data
        INSERT INTO public.vendor_profiles (name, company, phone, team_id, specializations, preferred_communication_style, price_range)
        VALUES
            ('John Smith', 'ABC Plumbing', '+14045551234', '11111111-1111-1111-1111-111111111111',
             ARRAY['plumbing', 'bathroom renovation'], 'relationship', 'mid-tier'),
            ('Mike Johnson', 'Elite Electric', '+14045555678', '11111111-1111-1111-1111-111111111111',
             ARRAY['electrical', 'smart home'], 'technical', 'premium'),
            ('Sarah Wilson', 'Perfect Paint Co', '+14045559999', '11111111-1111-1111-1111-111111111111',
             ARRAY['painting', 'interior design'], 'casual', 'budget')
        ON CONFLICT (phone, team_id) DO NOTHING;

        RAISE NOTICE 'Sample vendor data inserted successfully';
    ELSE
        RAISE NOTICE 'Vendor profiles table does not exist or has different structure - skipping sample data';
    END IF;
END $$;