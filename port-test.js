// port-test.js - Test if port 4000 can be bound
const net = require('net');

console.log('Testing port 4000...');

const server = net.createServer();

server.listen(4000, '0.0.0.0', () => {
  console.log('✅ SUCCESS: Port 4000 is available and bound!');
  console.log('Server info:', server.address());
  
  // Test the port
  setTimeout(() => {
    console.log('Testing connection...');
    const client = net.createConnection({ port: 4000 }, () => {
      console.log('✅ Can connect to port 4000!');
      client.end();
      server.close();
      process.exit(0);
    });
    
    client.on('error', (err) => {
      console.log('❌ Cannot connect:', err.message);
      server.close();
      process.exit(1);
    });
  }, 1000);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('❌ Port 4000 is already in use!');
  } else {
    console.log('❌ Server error:', err);
  }
  process.exit(1);
});