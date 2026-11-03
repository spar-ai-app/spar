'use strict';
// Stand-in for OpenRouter: /models with prices, /chat/completions streaming a reply with a cost.
const http = require('http'), fs = require('fs'), path = require('path');
const state = process.argv[2];
let n = 0;
http.createServer((req, res) => {
  let body = ''; req.on('data', d => { body += d; });
  req.on('end', () => {
    if (req.url.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'google/gemini-test', pricing: { prompt: '0.000002', completion: '0.00001' } }] }));
    }
    if (req.headers.authorization !== 'Bearer sk-or-test') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"bad key"}}'); }
    const j = JSON.parse(body); n++;
    fs.appendFileSync(path.join(state, 'or-requests.log'), JSON.stringify({ model: j.model, messages: j.messages.length, plugins: j.plugins || null }) + '\n');
    const text = `- the plan ignores the budget\n<answer>Version from Gemini ${n}</answer>\nVERDICT: REVISE: budget`;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const half = Math.floor(text.length / 2);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(0, half) } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(half) } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { cost: 0.0123 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
}).listen(0, '127.0.0.1', function () { process.stdout.write(String(this.address().port) + '\n'); });
