const https = require('https');
const http = require('http');

const urls = [
  'https://letsbunk-server.azurewebsites.net//api/daily-bssid-schedule?enrollmentNo=0246Cs231021'
];

urls.forEach(url => {
  console.log(`Testing endpoint: ${url}`);
  const client = url.startsWith('https') ? https : http;

  client.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log(`\n--- Server Response for ${url} ---`);
      console.log(`Status Code: ${res.statusCode}`);
      try {
        const json = JSON.parse(data);
        console.log(JSON.stringify(json, null, 2).substring(0, 500) + (data.length > 500 ? '...\n[Truncated]' : ''));
      } catch (e) {
        console.log('Raw Data:', data);
      }
      console.log('-----------------------\n');
    });
  }).on("error", (err) => {
    console.log(`Error for ${url}: ` + err.message);
  });
});
