import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
// Use service role for all backend operations (bypasses RLS)
const supabase = supabaseServiceKey ? createClient(supabaseUrl!, supabaseServiceKey) : createClient(supabaseUrl!, supabaseAnonKey!);

// Helper function to get team_id from auth token
const getTeamIdFromAuth = async (req: Request): Promise<string | null> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) return null;

    // Get user's team_id from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single();

    return profile?.team_id || null;
  } catch (error) {
    console.error('Error getting team_id from auth:', error);
    return null;
  }
};

// Helper function to detect contact category based on company/tags
const detectCategory = (company: string, tags: string[] = []) => {
  const companyLower = company?.toLowerCase() || '';
  const allTags = (tags || []).join(' ').toLowerCase();

  if (companyLower.includes('plumb') || allTags.includes('plumb')) return 'contractors';
  if (companyLower.includes('electric') || allTags.includes('electric')) return 'contractors';
  if (companyLower.includes('hvac') || allTags.includes('hvac')) return 'contractors';
  if (companyLower.includes('roofing') || allTags.includes('roof')) return 'contractors';
  if (companyLower.includes('construction') || allTags.includes('construction')) return 'contractors';
  if (companyLower.includes('contractor')) return 'contractors';
  if (companyLower.includes('inspect') || allTags.includes('inspect')) return 'inspectors';
  if (companyLower.includes('architect') || allTags.includes('architect')) return 'architects';
  if (companyLower.includes('engineer') || allTags.includes('engineer')) return 'engineers';
  if (companyLower.includes('supply') || allTags.includes('supply')) return 'suppliers';
  if (companyLower.includes('material') || allTags.includes('material')) return 'suppliers';
  if (companyLower.includes('bank') || companyLower.includes('loan') || allTags.includes('financial')) return 'financial';
  return 'vendors';
};

// Helper function to calculate AI metrics and enrich contact data
const enrichContactWithMetrics = (contact: any) => {
  const now = new Date();
  const lastContactDate = contact.last_contact ? new Date(contact.last_contact) : null;
  const daysSinceContact = lastContactDate
    ? Math.floor((now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Generate AI tags based on performance
  const aiTags = [];
  const responseRate = contact.response_rate || 0;
  const totalCalls = contact.total_calls || 0;

  if (responseRate >= 80) aiTags.push({ label: 'Highly Responsive', color: 'green' });
  else if (responseRate >= 60) aiTags.push({ label: 'Responsive', color: 'blue' });
  else if (responseRate < 30 && totalCalls > 5) aiTags.push({ label: 'Low Response', color: 'red' });

  if (totalCalls > 20) aiTags.push({ label: 'Frequent Contact', color: 'gold' });
  if (daysSinceContact && daysSinceContact <= 7) aiTags.push({ label: 'Recent Contact', color: 'blue' });
  if (daysSinceContact && daysSinceContact > 90) aiTags.push({ label: 'Needs Follow-up', color: 'red' });

  return {
    ...contact,
    category: detectCategory(contact.company, contact.tags),
    reliabilityScore: Math.min(100, Math.max(0, responseRate + (totalCalls > 10 ? 10 : 0))),
    lastInteractionDays: daysSinceContact,
    projectCount: 0, // Will be populated from actual projects if available
    aiTags,
    riskLevel: responseRate < 30 ? 'high' : responseRate < 60 ? 'medium' : 'low'
  };
};

// Get all contacts with advanced filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get team_id from auth
    const teamId = await getTeamIdFromAuth(req);
    if (!teamId) {
      return res.status(401).json({ error: 'Unauthorized - no team_id found' });
    }

    const {
      category,
      search,
      limit = 100,
      offset = 0,
      sortBy = 'updated_at',
      sortOrder = 'desc'
    } = req.query;

    let query = supabase
      .from('vendor_contacts')
      .select('*')
      .eq('team_id', teamId); // Filter by team

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Apply sorting
    query = query
      .order(sortBy as string, { ascending: sortOrder === 'asc' })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: contacts, error } = await query;

    if (error) {
      console.error('Error fetching contacts:', error);
      return res.status(500).json({ error: 'Failed to fetch contacts' });
    }

    // Enrich real database contacts with AI metrics
    const enrichedContacts = (contacts || []).map(enrichContactWithMetrics);

    // Apply category filter
    const filteredContacts = category
      ? enrichedContacts.filter(contact => contact.category === category)
      : enrichedContacts;

    res.json({
      data: filteredContacts,
      count: filteredContacts.length,
      total: filteredContacts.length
    });

  } catch (error) {
    console.error('Error in contacts route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get contact by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: contact, error } = await supabase
      .from('vendor_contacts')
      .select(`
        *,
        messages!vendor_id (
          id,
          type,
          message_body,
          created_at,
          direction,
          status
        ),
        call_logs!vendor_id (
          id,
          duration,
          status,
          created_at,
          direction
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching contact:', error);
      return res.status(404).json({ error: 'Contact not found' });
    }

    const enrichedContact = enrichContactWithMetrics(contact);
    res.json(enrichedContact);
  } catch (error) {
    console.error('Error in contact detail route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new contact
router.post('/', async (req: Request, res: Response) => {
  try {
    const contactData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: contact, error } = await supabase
      .from('vendor_contacts')
      .insert(contactData)
      .select()
      .single();

    if (error) {
      console.error('Error creating contact:', error);
      return res.status(400).json({ error: 'Failed to create contact' });
    }

    const enrichedContact = enrichContactWithMetrics(contact);
    res.status(201).json(enrichedContact);
  } catch (error) {
    console.error('Error in create contact route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update contact
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: contact, error } = await supabase
      .from('vendor_contacts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating contact:', error);
      return res.status(400).json({ error: 'Failed to update contact' });
    }

    const enrichedContact = enrichContactWithMetrics(contact);
    res.json(enrichedContact);
  } catch (error) {
    console.error('Error in update contact route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete contact
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('vendor_contacts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting contact:', error);
      return res.status(400).json({ error: 'Failed to delete contact' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error in delete contact route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search contacts with smart suggestions
router.get('/search/:query', async (req: Request, res: Response) => {
  try {
    const { query } = req.params;

    const { data: contacts, error } = await supabase
      .from('vendor_contacts')
      .select('*')
      .or(`name.ilike.%${query}%,company.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);

    if (error) {
      console.error('Error searching contacts:', error);
      return res.status(500).json({ error: 'Failed to search contacts' });
    }

    const enrichedContacts = (contacts || []).map(enrichContactWithMetrics);
    res.json({ data: enrichedContacts });
  } catch (error) {
    console.error('Error in search route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get contacts analytics
router.get('/analytics/summary', async (req: Request, res: Response) => {
  try {
    const { data: contacts, error } = await supabase
      .from('vendor_contacts')
      .select('*');

    if (error) {
      console.error('Error fetching analytics:', error);
      return res.status(500).json({ error: 'Failed to fetch analytics' });
    }

    const enrichedContacts = (contacts || []).map(enrichContactWithMetrics);

    const analytics = {
      totalContacts: enrichedContacts.length,
      activeContacts: enrichedContacts.filter(c => c.status === 'active').length,
      averageResponseRate: enrichedContacts.reduce((sum, c) => sum + (c.response_rate || 0), 0) / enrichedContacts.length || 0,
      contactsByCategory: enrichedContacts.reduce((acc, contact) => {
        acc[contact.category] = (acc[contact.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentContacts: enrichedContacts.filter(c => c.lastInteractionDays !== null && c.lastInteractionDays <= 7).length,
      needsFollowUp: enrichedContacts.filter(c => c.lastInteractionDays !== null && c.lastInteractionDays > 30).length
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error in analytics route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;