// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import the compiled server
const app = require('../dist/server.js');

// Ensure CORS is enabled
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Export for Vercel
module.exports = app;