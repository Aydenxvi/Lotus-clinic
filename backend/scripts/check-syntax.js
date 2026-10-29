// Cross-platform source syntax check: no database, secrets or network needed.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const backend = path.resolve(__dirname, "..");
const project = path.resolve(backend, "..");
let passed = 0;
function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, ext) : (p.endsWith(ext) ? [p] : []);
  });
}
function check(code, filename) {
  new vm.Script(code, { filename });
  passed++;
}
for (const file of [...walk(path.join(backend, "src"), ".js"),
                    ...walk(path.join(backend, "scripts"), ".js"),
                    ...walk(path.join(project, "lotus/js"), ".js")]) {
  check(fs.readFileSync(file, "utf8"), file);
}
for (const file of walk(path.join(project, "lotus"), ".html")) {
  const html = fs.readFileSync(file, "utf8");
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match, index = 0;
  while ((match = scripts.exec(html))) {
    const attributes = match[1];
    if (/\bsrc\s*=/.test(attributes) || /\btype\s*=\s*["']?(?:application\/json|module)/i.test(attributes)) continue;
    if (!match[2].trim()) continue;
    check(match[2], file + "#inline-script-" + (++index));
  }
}
console.log(`PASS: ${passed} JavaScript files / inline scripts parse successfully.`);
