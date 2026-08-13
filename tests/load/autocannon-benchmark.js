import autocannon from 'autocannon';

const targetUrl = process.env.TARGET_URL || 'http://localhost:3000';

console.log(`==================================================`);
console.log(`    AUTOCANNON ENTERPRISE PERFORMANCE BENCHMARK   `);
console.log(`==================================================`);
console.log(`Target URL: ${targetUrl}`);
console.log(`Connections: 100 concurrent VUs`);
console.log(`Duration: 10 seconds`);
console.log(`==================================================`);

const instance = autocannon({
  url: `${targetUrl}/api/health`,
  connections: 100,
  duration: 10,
  pipelining: 1,
  headers: {
    'x-tenant-id': 'legacy-tenant-1',
  },
}, (err, result) => {
  if (err) {
    console.error('Autocannon Benchmark Error:', err);
    process.exit(1);
  }
  
  console.log('\n--- BENCHMARK RESULTS ---');
  console.log(`Total Requests: ${result.requests.total}`);
  console.log(`Requests/sec:   ${result.requests.average}`);
  console.log(`Latency (avg):  ${result.latency.average} ms`);
  console.log(`Latency (p99):  ${result.latency.p99} ms`);
  console.log(`Throughput:     ${(result.throughput.average / (1024 * 1024)).toFixed(2)} MB/s`);
  console.log(`2xx Responses:  ${result['2xx']}`);
  console.log(`Non-2xx Errors: ${result.non2xx}`);

  if (result.non2xx > 0) {
    console.warn('⚠️ Warning: Non-2xx responses detected during benchmark.');
  } else {
    console.log('✅ PASS: Enterprise API throughput & latency benchmarks within specifications.');
  }
});

autocannon.track(instance, { renderProgressBar: true });
