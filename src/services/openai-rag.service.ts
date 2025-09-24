import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as tf from '@tensorflow/tfjs-node';
import Tesseract from 'tesseract.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

interface YOLODetection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
  metadata?: any;
}

interface OCRResult {
  text: string;
  confidence: number;
  boundingBoxes?: any[];
  language: string;
}

interface RAGDocument {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
}

interface KnowledgeChunk {
  text: string;
  embedding?: number[];
  metadata?: any;
}

export class OpenAIRAGService {
  private supabase: any;
  private openai: OpenAI;
  private yoloModelPath: string;
  private tesseractWorker: any;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    this.yoloModelPath = path.join(process.cwd(), 'yolov8x.pt');
    this.initializeTesseract();
  }

  private async initializeTesseract() {
    const { createWorker } = await import('tesseract.js');
    this.tesseractWorker = await createWorker('eng');
    await this.tesseractWorker.reinitialize('eng');
  }

  // RAG System - Vector Embeddings & Retrieval
  async createEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small', // Using latest embedding model
      input: text,
    });
    return response.data[0].embedding;
  }

  async storeDocument(document: {
    title: string;
    content: string;
    type: string;
    metadata?: any;
  }): Promise<void> {
    // Store main document
    const { data: doc, error: docError } = await this.supabase
      .from('knowledge_documents')
      .insert({
        title: document.title,
        content: document.content,
        document_type: document.type,
        metadata: document.metadata || {},
      })
      .select()
      .single();

    if (docError) throw docError;

    // Create chunks and embeddings
    const chunks = this.createChunks(document.content, 1000);
    
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.createEmbedding(chunks[i]);
      
      await this.supabase
        .from('document_embeddings')
        .insert({
          document_id: doc.id,
          chunk_index: i,
          chunk_text: chunks[i],
          embedding: embedding,
          metadata: { chunk_number: i + 1, total_chunks: chunks.length }
        });
    }
  }

  async retrieveRelevantDocuments(query: string, limit: number = 5): Promise<RAGDocument[]> {
    // Create query embedding
    const queryEmbedding = await this.createEmbedding(query);
    
    // Search for similar documents using Supabase vector similarity
    const { data, error } = await this.supabase.rpc('search_similar_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: limit
    });

    if (error) throw error;

    return data.map((doc: any) => ({
      id: doc.document_id,
      content: doc.chunk_text,
      metadata: doc.metadata,
      similarity: doc.similarity
    }));
  }

  // YOLO Object Detection for Floor Plans
  async detectObjectsYOLO(imagePath: string): Promise<YOLODetection[]> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [
        path.join(process.cwd(), 'yolo_detector.py'),
        imagePath,
        this.yoloModelPath
      ]);

      let result = '';
      pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error('YOLO Error:', data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const detections = JSON.parse(result);
            this.storeYOLOResults(imagePath, detections);
            resolve(detections);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`YOLO detection failed with code ${code}`));
        }
      });
    });
  }

  private async storeYOLOResults(imagePath: string, detections: YOLODetection[]) {
    await this.supabase
      .from('yolo_detections')
      .insert({
        image_path: imagePath,
        detection_type: 'floor_plan_elements',
        detections: detections,
        confidence_scores: detections.map(d => d.confidence),
        model_version: 'yolov8x',
        processing_time_ms: Date.now()
      });
  }

  // Tesseract OCR for Text Extraction
  async extractTextOCR(imagePath: string): Promise<OCRResult> {
    const imageBuffer = await fs.readFile(imagePath);
    const result = await this.tesseractWorker.recognize(imageBuffer);
    
    const ocrResult: OCRResult = {
      text: result.data.text,
      confidence: result.data.confidence,
      boundingBoxes: result.data.lines.map((line: any) => line.bbox),
      language: 'eng'
    };

    // Store OCR results
    await this.supabase
      .from('ocr_extractions')
      .insert({
        image_path: imagePath,
        extracted_text: ocrResult.text,
        confidence_score: ocrResult.confidence,
        language: ocrResult.language,
        processing_engine: 'tesseract',
        bounding_boxes: ocrResult.boundingBoxes
      });

    return ocrResult;
  }

  // Combined RAG Query with GPT-4
  async queryWithRAG(
    userQuery: string,
    context?: {
      projectId?: string;
      sessionId?: string;
      includeYOLO?: boolean;
      includeOCR?: boolean;
      imagePath?: string;
    }
  ): Promise<string> {
    try {
      // Retrieve relevant documents
      const relevantDocs = await this.retrieveRelevantDocuments(userQuery);
      
      // Process image if provided
      let imageContext = '';
      if (context?.imagePath) {
        if (context.includeYOLO) {
          const yoloResults = await this.detectObjectsYOLO(context.imagePath);
          imageContext += `\nDetected objects: ${JSON.stringify(yoloResults)}`;
        }
        
        if (context.includeOCR) {
          const ocrResult = await this.extractTextOCR(context.imagePath);
          imageContext += `\nExtracted text: ${ocrResult.text}`;
        }
      }

      // Build context from retrieved documents
      const documentContext = relevantDocs
        .map(doc => doc.content)
        .join('\n\n');

      // Create the prompt for GPT-4
      const systemPrompt = `You are an AI assistant for HomeQuest construction platform with access to a knowledge base.
Use the following retrieved information to answer the user's question accurately.
If the information is not sufficient, indicate what additional information would be helpful.

Retrieved Context:
${documentContext}
${imageContext}`;

      // Generate response using GPT-4
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuery }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const answer = response.choices[0].message.content || '';

      // Log the query and response
      await this.logQuery(userQuery, relevantDocs, answer, context?.sessionId);

      return answer;
    } catch (error) {
      console.error('RAG Query Error:', error);
      throw error;
    }
  }

  // Query specifically for construction knowledge
  async queryConstructionKnowledge(
    query: string,
    category?: string
  ): Promise<any> {
    const embedding = await this.createEmbedding(query);
    
    const { data, error } = await this.supabase.rpc('search_construction_knowledge', {
      query_embedding: embedding,
      category_filter: category,
      match_count: 5
    });

    if (error) throw error;

    // Generate comprehensive response
    const context = data.map((item: any) => `${item.title}: ${item.content}`).join('\n\n');
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a construction expert. Answer based on the provided knowledge base information.'
        },
        {
          role: 'user',
          content: `Question: ${query}\n\nRelevant Knowledge:\n${context}`
        }
      ],
      temperature: 0.5
    });

    return {
      answer: response.choices[0].message.content,
      sources: data
    };
  }

  // Helper method to create text chunks
  private createChunks(text: string, chunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  // Log queries for analytics
  private async logQuery(
    query: string,
    retrievedDocs: RAGDocument[],
    response: string,
    sessionId?: string
  ) {
    const queryEmbedding = await this.createEmbedding(query);
    
    await this.supabase
      .from('claude_queries')
      .insert({
        query_text: query,
        query_embedding: queryEmbedding,
        retrieved_documents: retrievedDocs.map(d => ({ id: d.id, similarity: d.similarity })),
        response_text: response,
        confidence_score: retrievedDocs[0]?.similarity || 0,
        processing_time_ms: Date.now()
      });
  }

  // Update conversation memory
  async updateConversation(
    sessionId: string,
    message: { role: string; content: string },
    projectId?: string
  ) {
    const { data: conversation } = await this.supabase
      .from('claude_conversations')
      .select()
      .eq('session_id', sessionId)
      .single();

    if (conversation) {
      const messages = [...conversation.messages, message];
      const contextEmbedding = await this.createEmbedding(
        messages.slice(-5).map((m: any) => m.content).join(' ')
      );

      await this.supabase
        .from('claude_conversations')
        .update({
          messages,
          context_embeddings: contextEmbedding,
          total_tokens: conversation.total_tokens + (message.content.length / 4)
        })
        .eq('id', conversation.id);
    } else {
      await this.supabase
        .from('claude_conversations')
        .insert({
          session_id: sessionId,
          project_id: projectId,
          messages: [message],
          context_embeddings: await this.createEmbedding(message.content)
        });
    }
  }
}

// Export singleton instance
export const openAIRAGService = new OpenAIRAGService();