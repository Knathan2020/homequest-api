/**
 * Blog Routes
 * Handles blog post management and public blog API
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

/**
 * GET /api/blog
 * Get all published blog posts (public)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, tag, limit = 10, offset = 0 } = req.query;

    let query = supabase
      .from('blog_posts')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    if (tag) {
      query = query.contains('tags', [tag]);
    }

    query = query.range(
      parseInt(offset as string),
      parseInt(offset as string) + parseInt(limit as string) - 1
    );

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      total: count || 0,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch blog posts'
    });
  }
});

/**
 * GET /api/blog/slug/:slug
 * Get single blog post by slug (public)
 */
router.get('/slug/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Blog post not found'
        });
      }
      throw error;
    }

    // Increment view count
    await supabase
      .from('blog_posts')
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq('id', data.id);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch blog post'
    });
  }
});

/**
 * GET /api/blog/categories
 * Get all blog categories
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('blog_categories')
      .select('*')
      .order('name');

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch categories'
    });
  }
});

/**
 * POST /api/blog
 * Create new blog post (admin only)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      slug,
      excerpt,
      content,
      author_name,
      featured_image,
      status = 'draft',
      category,
      tags = [],
      meta_title,
      meta_description,
      meta_keywords = []
    } = req.body;

    // Validate required fields
    if (!title || !slug || !content) {
      return res.status(400).json({
        success: false,
        error: 'Title, slug, and content are required'
      });
    }

    const postData: any = {
      title,
      slug,
      excerpt,
      content,
      author_name,
      featured_image,
      status,
      category,
      tags,
      meta_title: meta_title || title,
      meta_description: meta_description || excerpt,
      meta_keywords
    };

    // Set published_at if publishing
    if (status === 'published') {
      postData.published_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .insert(postData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'A blog post with this slug already exists'
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      data,
      message: 'Blog post created successfully'
    });
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create blog post'
    });
  }
});

/**
 * PUT /api/blog/:id
 * Update blog post (admin only)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If publishing, set published_at
    if (updates.status === 'published' && !updates.published_at) {
      updates.published_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Blog post not found'
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data,
      message: 'Blog post updated successfully'
    });
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update blog post'
    });
  }
});

/**
 * DELETE /api/blog/:id
 * Delete blog post (admin only)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Blog post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete blog post'
    });
  }
});

/**
 * GET /api/blog/sitemap
 * Generate XML sitemap for blog posts
 */
router.get('/sitemap', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (error) throw error;

    const baseUrl = process.env.FRONTEND_URL || 'https://www.homequesttech.com';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const post of data || []) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/blog/${post.slug}</loc>\n`;
      xml += `    <lastmod>${post.updated_at || post.published_at}</lastmod>\n`;
      xml += '    <changefreq>monthly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate sitemap'
    });
  }
});

export default router;
