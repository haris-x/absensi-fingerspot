const ZKLibTCP = require('node-zklib/zklibtcp');
const ZKLibUDP = require('node-zklib/zklibudp');

async function testPort(port) {
  const ip = '192.168.0.34';
  console.log(`\n======================================`);
  console.log(`Testing Port ${port}`);
  console.log(`======================================`);

  // TCP Test
  const zkTcp = new ZKLibTCP(ip, port, 5000);
  try {
    await zkTcp.createSocket();
    await zkTcp.connect();
    console.log(`[TCP] Success! Connected to port ${port}`);
    const info = await zkTcp.getInfo();
    console.log(`[TCP] Device info:`, info);
    await zkTcp.disconnect();
  } catch (err) {
    console.log(`[TCP] Failed:`, err.message || err);
    if (zkTcp && zkTcp.socket) {
      try { await zkTcp.disconnect(); } catch (e) {}
    }
  }

  // UDP Test
  const zkUdp = new ZKLibUDP(ip, port, 5000, 0);
  try {
    await zkUdp.createSocket();
    await zkUdp.connect();
    console.log(`[UDP] Success! Connected to port ${port}`);
    const info = await zkUdp.getInfo();
    console.log(`[UDP] Device info:`, info);
    await zkUdp.disconnect();
  } catch (err) {
    console.log(`[UDP] Failed:`, err.message || err);
    if (zkUdp && zkUdp.socket) {
      try { zkUdp.disconnect(); } catch (e) {}
    }
  }
}

async function run() {
  await testPort(4370);
  await testPort(5005);
  console.log('\n--- Tests Finished ---');
  process.exit(0);
}

run();
