-- Blog Posts Table
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  author_id UUID,
  author_name VARCHAR(255),
  featured_image VARCHAR(500),
  status VARCHAR(20) DEFAULT 'draft', -- draft, published, archived
  category VARCHAR(100),
  tags TEXT[], -- Array of tags

  -- SEO fields
  meta_title VARCHAR(255),
  meta_description TEXT,
  meta_keywords TEXT[],

  -- Analytics
  view_count INTEGER DEFAULT 0,

  -- Timestamps
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Blog Categories Table
CREATE TABLE IF NOT EXISTS blog_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags ON blog_posts USING GIN(tags);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_blog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS blog_posts_updated_at ON blog_posts;
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_blog_updated_at();

-- Insert sample categories
INSERT INTO blog_categories (name, slug, description) VALUES
  ('Construction Technology', 'construction-technology', 'Latest tech innovations in construction'),
  ('Project Management', 'project-management', 'Tips and strategies for managing construction projects'),
  ('AI & Automation', 'ai-automation', 'How AI is transforming the construction industry'),
  ('Case Studies', 'case-studies', 'Real-world success stories from our customers'),
  ('Industry News', 'industry-news', 'Latest news and trends in construction')
ON CONFLICT (slug) DO NOTHING;

-- Insert sample blog post
INSERT INTO blog_posts (
  title,
  slug,
  excerpt,
  content,
  author_name,
  status,
  category,
  tags,
  meta_title,
  meta_description,
  published_at
) VALUES (
  'How AI is Revolutionizing Construction Project Management',
  'ai-revolutionizing-construction-project-management',
  'Discover how artificial intelligence is transforming the way construction companies manage projects, from automated scheduling to predictive analytics.',
  '# How AI is Revolutionizing Construction Project Management

The construction industry is experiencing a technological revolution. Artificial intelligence (AI) is no longer a futuristic concept—it''s here, and it''s transforming how construction companies operate.

## The Challenge

Traditional construction project management involves:
- Manual scheduling and coordination
- Paper-based documentation
- Delayed communication between teams
- Reactive problem-solving
- Budget overruns and delays

## The AI Solution

Modern AI-powered construction software like HomeQuest offers:

### 1. Automated Blueprint Processing
AI can analyze construction blueprints and automatically detect walls, rooms, doors, and windows—saving hours of manual work.

### 2. Intelligent Vendor Management
AI handles vendor communication, sends automated follow-ups, and even makes phone calls to schedule appointments.

### 3. Predictive Analytics
Machine learning algorithms analyze past projects to predict potential delays, cost overruns, and resource bottlenecks before they happen.

### 4. Real-Time Collaboration
Cloud-based platforms keep everyone—from general contractors to subcontractors—on the same page with instant updates.

## Real-World Results

Companies using AI-powered construction software report:
- 30% reduction in project delays
- 25% improvement in budget accuracy
- 50% less time on administrative tasks
- Better team communication and coordination

## Getting Started

The key to successful AI adoption in construction is choosing the right platform. Look for:
- Easy-to-use interface
- Mobile accessibility for field teams
- Integration with existing tools
- Automated workflows
- Strong customer support

## Conclusion

AI isn''t replacing construction workers—it''s empowering them to work smarter, faster, and more efficiently. Companies that embrace this technology today will have a significant competitive advantage tomorrow.

Ready to see how AI can transform your construction business? [Try HomeQuest free for 14 days](/pricing).',
  'HomeQuest Team',
  'published',
  'AI & Automation',
  ARRAY['AI', 'Construction Technology', 'Project Management', 'Automation', 'Efficiency'],
  'How AI is Revolutionizing Construction Project Management | HomeQuest',
  'Discover how artificial intelligence and automation are transforming construction project management. Learn about AI-powered blueprint processing, vendor management, and predictive analytics.',
  NOW()
) ON CONFLICT (slug) DO NOTHING;
