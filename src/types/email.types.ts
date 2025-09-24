/**
 * Email Types for Autonomous System
 */

export interface Email {
  id: string;
  subject: string;
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  bodyText: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
  receivedDate: string;
  sentDate: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  projectId?: string;
  vendorId?: string;
}

export interface EmailAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  extractedData?: any;
}

export interface ProjectContext {
  id: string;
  name: string;
  phase: 'planning' | 'construction' | 'closeout';
  budget: number;
  timeline: {
    start_date: string;
    end_date: string;
    milestones: Milestone[];
  };
  stakeholders: Stakeholder[];
}

export interface Milestone {
  name: string;
  date: string;
  completed: boolean;
  phase: string;
}

export interface Stakeholder {
  email: string;
  name: string;
  type: 'vendor' | 'client' | 'inspector' | 'team';
  company?: string;
  role?: string;
}

export interface AutonomousAction {
  id: string;
  emailId: string;
  action: 'acknowledge' | 'draft_response' | 'escalate' | 'extract_data' | 'schedule_followup';
  tier: 1 | 2 | 3;
  status: 'pending' | 'completed' | 'failed' | 'overridden';
  confidence: number;
  reasoning: string[];
  timestamp: string;
  human_override?: {
    overridden_by: string;
    reason: string;
    timestamp: string;
  };
}

export interface ReviewQueue {
  id: string;
  emailId: string;
  projectId?: string;
  draft_response?: string;
  classification: any;
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
}