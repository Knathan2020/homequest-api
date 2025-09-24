// test.js - Simple test server
const http = require('http');

const PORT = 4000;

const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Test server works!' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});