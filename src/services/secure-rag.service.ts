/**
 * Secure Global RAG Service
 * Handles retrieval-augmented generation with privacy protection
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

interface RAGDocument {
  id?: string;
  title: string;
  content: string;
  type: string;
  metadata?: any;
  projectId?: string;
  isPublic?: boolean;
  isSensitive?: boolean;
}

interface RAGQuery {
  query: string;
  projectId?: string;
  userId?: string;
  includePublic?: boolean;
  maxResults?: number;
}

interface SanitizedResponse {
  answer: string;
  sources: Array<{
    title: string;
    type: string;
    relevance: number;
  }>;
  metadata: {
    queryId: string;
    timestamp: string;
    documentsUsed: number;
    sensitive: boolean;
  };
}

export class SecureRAGService {
  private openai: OpenAI;
  private supabase: any;
  private encryptionKey: string;
  private localCache: Map<string, any> = new Map();

  constructor() {
    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });

    // Initialize Supabase if available
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder')) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    // Generate encryption key for sensitive data
    this.encryptionKey = process.env.RAG_ENCRYPTION_KEY || 
      crypto.randomBytes(32).toString('hex');
  }

  /**
   * Query the RAG system with privacy protection
   */
  async query(params: RAGQuery): Promise<SanitizedResponse> {
    const queryId = crypto.randomUUID();
    console.log(`🔍 Processing RAG query: ${queryId}`);

    try {
      // Retrieve relevant documents
      const documents = await this.retrieveDocuments(params);
      
      // Filter out sensitive information
      const sanitizedDocs = this.sanitizeDocuments(documents, params.userId);
      
      // Generate response using OpenAI
      const response = await this.generateResponse(
        params.query, 
        sanitizedDocs
      );

      // Log query for audit (without sensitive data)
      this.logQuery(queryId, params, sanitizedDocs.length);

      return {
        answer: response.answer,
        sources: sanitizedDocs.map(doc => ({
          title: doc.title,
          type: doc.type,
          relevance: doc.similarity || 0
        })),
        metadata: {
          queryId,
          timestamp: new Date().toISOString(),
          documentsUsed: sanitizedDocs.length,
          sensitive: sanitizedDocs.some(d => d.isSensitive)
        }
      };
    } catch (error) {
      console.error('RAG query error:', error);
      
      // Return safe fallback response
      return this.getFallbackResponse(queryId, params.query);
    }
  }

  /**
   * Store document with automatic sensitivity detection
   */
  async storeDocument(doc: RAGDocument): Promise<{ success: boolean; id?: string }> {
    try {
      // Detect if content contains sensitive information
      const isSensitive = await this.detectSensitiveContent(doc.content);
      
      // Encrypt sensitive content
      const processedContent = isSensitive ? 
        this.encryptContent(doc.content) : 
        doc.content;

      // Create embeddings
      const chunks = this.chunkText(processedContent);
      const embeddings = await this.createEmbeddings(chunks);

      if (this.supabase) {
        // Store in Supabase with vector embeddings
        const { data, error } = await this.supabase
          .rpc('add_rag_document', {
            p_title: doc.title,
            p_content: processedContent,
            p_type: doc.type,
            p_metadata: doc.metadata || {},
            p_project_id: doc.projectId,
            p_is_public: doc.isPublic || false,
            p_is_sensitive: isSensitive
          });

        if (!error && data) {
          // Store embeddings
          await this.storeEmbeddings(data, chunks, embeddings);
          return { success: true, id: data };
        }
      }

      // Fallback to local storage
      const id = crypto.randomUUID();
      this.localCache.set(id, {
        ...doc,
        id,
        content: processedContent,
        isSensitive,
        embeddings,
        timestamp: new Date().toISOString()
      });

      return { success: true, id };
    } catch (error) {
      console.error('Document storage error:', error);
      return { success: false };
    }
  }

  /**
   * Retrieve relevant documents with privacy filtering
   */
  private async retrieveDocuments(params: RAGQuery): Promise<any[]> {
    try {
      // Create query embedding
      const queryEmbedding = await this.createEmbedding(params.query);

      if (this.supabase) {
        // Use Supabase vector search
        const { data, error } = await this.supabase
          .rpc('search_similar_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.7,
            match_count: params.maxResults || 10,
            user_project_id: params.projectId,
            include_public: params.includePublic !== false
          });

        if (!error && data) {
          return data;
        }
      }

      // Fallback to local cache search
      return this.searchLocalCache(queryEmbedding, params);
    } catch (error) {
      console.error('Document retrieval error:', error);
      return [];
    }
  }

  /**
   * Sanitize documents to remove sensitive information
   */
  private sanitizeDocuments(documents: any[], userId?: string): any[] {
    return documents.map(doc => {
      // Redact sensitive content unless user has permission
      if (doc.is_sensitive && !this.userHasAccess(doc, userId)) {
        return {
          ...doc,
          chunk_text: '[CONTENT REDACTED FOR PRIVACY]',
          content: '[CONTENT REDACTED FOR PRIVACY]',
          metadata: {
            ...doc.metadata,
            redacted: true,
            reason: 'sensitive_content'
          }
        };
      }

      // Remove PII patterns
      if (doc.chunk_text) {
        doc.chunk_text = this.removePII(doc.chunk_text);
      }

      return doc;
    });
  }

  /**
   * Generate response using OpenAI with context
   */
  private async generateResponse(query: string, documents: any[]): Promise<any> {
    const context = documents
      .map(doc => doc.chunk_text || doc.content)
      .filter(text => text && !text.includes('[REDACTED]'))
      .join('\n\n');

    const systemPrompt = `You are a helpful construction and floor plan assistant. 
    Use the provided context to answer questions accurately. 
    If sensitive information has been redacted, acknowledge this appropriately.
    Never reveal specific personal information, API keys, or security details.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return {
      answer: completion.choices[0]?.message?.content || 
        'I could not generate a response with the available information.',
      model: completion.model,
      usage: completion.usage
    };
  }

  /**
   * Detect sensitive content using patterns and AI
   */
  private async detectSensitiveContent(content: string): Promise<boolean> {
    // Check for common sensitive patterns
    const sensitivePatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Email
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/, // Credit card
      /\bsk-[a-zA-Z0-9]{48}\b/, // API keys
      /\bbearer\s+[a-zA-Z0-9\-._~+\/]+=*/i, // Bearer tokens
      /password|secret|private.?key|api.?key/i // Sensitive keywords
    ];

    return sensitivePatterns.some(pattern => pattern.test(content));
  }

  /**
   * Remove personally identifiable information
   */
  private removePII(text: string): string {
    // Email addresses
    text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
    
    // Phone numbers
    text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
    
    // SSN
    text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
    
    // Credit cards
    text = text.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[CREDIT_CARD]');
    
    // API keys
    text = text.replace(/\b(sk-|pk-|api-)[a-zA-Z0-9]{20,}\b/g, '[API_KEY]');
    
    return text;
  }

  /**
   * Check if user has access to sensitive document
   */
  private userHasAccess(document: any, userId?: string): boolean {
    // Document owner always has access
    if (document.user_id === userId) return true;
    
    // Project members have access
    if (document.project_id && userId) {
      // This would check project membership in real implementation
      return true;
    }
    
    // Public non-sensitive documents
    if (document.is_public && !document.is_sensitive) return true;
    
    return false;
  }

  /**
   * Encrypt sensitive content
   */
  private encryptContent(content: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Create embedding for text
   */
  private async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding creation error:', error);
      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }

  /**
   * Create embeddings for multiple chunks
   */
  private async createEmbeddings(chunks: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      chunks.map(chunk => this.createEmbedding(chunk))
    );
    return embeddings;
  }

  /**
   * Chunk text into smaller pieces
   */
  private chunkText(text: string, chunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Store embeddings in database
   */
  private async storeEmbeddings(
    documentId: string, 
    chunks: string[], 
    embeddings: number[][]
  ): Promise<void> {
    if (!this.supabase) return;

    for (let i = 0; i < chunks.length; i++) {
      await this.supabase
        .from('rag_document_chunks')
        .update({ embedding: embeddings[i] })
        .eq('document_id', documentId)
        .eq('chunk_index', i);
    }
  }

  /**
   * Search local cache (fallback when Supabase unavailable)
   */
  private searchLocalCache(queryEmbedding: number[], params: RAGQuery): any[] {
    const results: any[] = [];
    
    this.localCache.forEach((doc, id) => {
      if (doc.embeddings) {
        // Calculate cosine similarity
        const similarities = doc.embeddings.map((emb: number[]) => 
          this.cosineSimilarity(queryEmbedding, emb)
        );
        
        const maxSimilarity = Math.max(...similarities);
        
        if (maxSimilarity > 0.7) {
          results.push({
            ...doc,
            similarity: maxSimilarity
          });
        }
      }
    });

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, params.maxResults || 10);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Get fallback response when RAG fails
   */
  private getFallbackResponse(queryId: string, query: string): SanitizedResponse {
    const fallbackAnswers: { [key: string]: string } = {
      'floor plan': 'A floor plan is a scaled diagram showing the layout of rooms and spaces in a building from above.',
      'wall': 'Walls are vertical structures that divide or enclose spaces. Common types include load-bearing, partition, and exterior walls.',
      'construction': 'Construction involves the process of building structures using various materials and techniques according to plans and specifications.',
      'default': 'I apologize, but I cannot access the knowledge base at the moment. Please try again or contact support.'
    };

    const answer = Object.keys(fallbackAnswers).find(key => 
      query.toLowerCase().includes(key)
    ) || 'default';

    return {
      answer: fallbackAnswers[answer],
      sources: [],
      metadata: {
        queryId,
        timestamp: new Date().toISOString(),
        documentsUsed: 0,
        sensitive: false
      }
    };
  }

  /**
   * Log query for audit purposes (without sensitive data)
   */
  private logQuery(queryId: string, params: RAGQuery, documentsUsed: number): void {
    console.log('📊 RAG Query Log:', {
      queryId,
      timestamp: new Date().toISOString(),
      queryLength: params.query.length,
      projectId: params.projectId,
      documentsUsed,
      includePublic: params.includePublic
      // Note: actual query text is not logged for privacy
    });
  }
}

export default new SecureRAGService();