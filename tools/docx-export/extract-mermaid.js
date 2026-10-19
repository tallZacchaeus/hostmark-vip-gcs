// Writes each ```mermaid block of a Markdown file to <out prefix>-<n>.mmd (n = 1.. in document order).
// md2docx.js --diagrams <out prefix> picks up the matching <out prefix>-<n>.png files.
// Usage: node extract-mermaid.js <in.md> <out prefix>
const fs = require('fs');

const [, , mdPath, outPrefix] = process.argv;
if (!mdPath || !outPrefix) {
  console.error('usage: node extract-mermaid.js <in.md> <out prefix>');
  process.exit(2);
}

let n = 0;
let buf = null;
for (const line of fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
  if (buf === null && /^```mermaid\s*$/.test(line)) { buf = []; continue; }
  if (buf !== null && /^```\s*$/.test(line)) {
    fs.writeFileSync(`${outPrefix}-${++n}.mmd`, buf.join('\n') + '\n');
    buf = null;
    continue;
  }
  if (buf !== null) buf.push(line);
}
console.log(n);
