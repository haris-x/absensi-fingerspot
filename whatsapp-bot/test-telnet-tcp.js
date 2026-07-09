const net = require('net');

const host = '192.168.0.34';
const port = 23;

console.log(`Connecting to Telnet on ${host}:${port}...`);
const socket = new net.Socket();

socket.setTimeout(5000);

socket.on('connect', () => {
  console.log(`[+] Successfully connected to TCP port ${port}!`);
});

socket.on('data', (data) => {
  console.log(`[+] Received data:`);
  console.log(data.toString('utf-8'));
  console.log(data);
  socket.destroy();
  process.exit(0);
});

socket.on('timeout', () => {
  console.log(`[-] Connection timed out`);
  socket.destroy();
  process.exit(1);
});

socket.on('error', (err) => {
  console.log(`[-] Error:`, err.message);
  socket.destroy();
  process.exit(1);
});

socket.connect(port, host);
