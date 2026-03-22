import https from 'https';

const candidates = [
  'https://a.espncdn.com/i/espn/misc_logos/500/ncaa.png',
  'https://upload.wikimedia.org/wikipedia/en/d/d7/NCAA_March_Madness_logo.svg',
  'https://upload.wikimedia.org/wikipedia/commons/d/d4/March_Madness_logo.png',
  'https://upload.wikimedia.org/wikipedia/en/thumb/d/d7/NCAA_March_Madness_logo.svg/200px-NCAA_March_Madness_logo.svg.png',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/March_Madness_logo.png/200px-March_Madness_logo.png',
  'https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png',
];

function head(url) {
  return new Promise(res => {
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 }, r => {
      res({ url, status: r.statusCode, size: r.headers['content-length'] });
    });
    req.on('error', e => res({ url, status: 'ERR', err: e.message }));
    req.on('timeout', () => { req.destroy(); res({ url, status: 'TIMEOUT' }); });
    req.end();
  });
}

const results = await Promise.all(candidates.map(head));
results.forEach(r => console.log(r.status, r.size || '', r.url));
