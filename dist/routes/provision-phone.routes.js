"use strict";
/**
 * Phone Provisioning Routes
 * Provisions Twilio phone numbers after payment
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
const router = (0, express_1.Router)();
// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey
    ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null;
/**
 * POST /api/provision-phone
 * Provisions a Twilio phone number for a user after payment
 */
router.post('/provision-phone', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }
        if (!supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not configured'
            });
        }
        // Get user profile with area code preference
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*, teams(id, name, company_name)')
            .eq('id', userId)
            .single();
        if (profileError || !profile) {
            console.error('Profile fetch error:', profileError);
            return res.status(404).json({
                success: false,
                error: 'User profile not found'
            });
        }
        // Get the team info
        const team = Array.isArray(profile.teams) ? profile.teams[0] : profile.teams;
        const teamId = team?.id || profile.team_id;
        const companyName = profile.company_name || team?.company_name || 'Unknown Company';
        console.log('📞 Provisioning phone for:', {
            userId,
            email: profile.email,
            companyName,
            areaCode: profile.preferred_area_code,
            teamId
        });
        // Call team API to provision phone
        const teamResponse = await fetch(`${config_1.TEAM_API_URL}/api/team/provision-phone`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                teamId,
                email: profile.email,
                fullName: profile.full_name,
                companyName,
                preferredAreaCode: profile.preferred_area_code || undefined,
                phone: profile.phone_number
            })
        });
        const teamResult = await teamResponse.json();
        if (!teamResponse.ok || !teamResult.success) {
            console.error('Phone provisioning failed:', teamResult);
            return res.status(500).json({
                success: false,
                error: teamResult.error || 'Failed to provision phone number',
                details: teamResult
            });
        }
        console.log('✅ Phone provisioned successfully:', {
            twilioNumber: teamResult.data?.phoneConfig?.twilioNumber,
            vapiPhoneId: teamResult.data?.phoneConfig?.vapiPhoneId
        });
        res.json({
            success: true,
            message: 'Phone number provisioned successfully',
            data: {
                phoneConfig: teamResult.data?.phoneConfig,
                teamId,
                userId
            }
        });
    }
    catch (error) {
        console.error('Error provisioning phone:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to provision phone number'
        });
    }
});
exports.default = router;
//# sourceMappingURL=provision-phone.routes.js.map