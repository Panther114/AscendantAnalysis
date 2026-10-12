// Next 16.4's static export writes segment prefetch payloads as nested folders
// (e.g. trends/__next.trends/__PAGE__.txt) while the client router requests the dotted
// form (trends/__next.trends.__PAGE__.txt). Static hosts can't rewrite, so we add a
// dotted copy next to each nested file. Runs after `next build` (see package.json).
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "out");
let copied = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("__next.")) flatten(p, dir);
    else walk(p);
  }
}

function flatten(segDir, parent) {
  const stack = [segDir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith(".txt")) {
        const rel = path.relative(parent, p).split(path.sep).join(".");
        const target = path.join(parent, rel);
        if (!fs.existsSync(target)) {
          fs.copyFileSync(p, target);
          copied++;
        }
      }
    }
  }
}

walk(out);
console.log(`flatten-rsc: wrote ${copied} dotted segment payloads`);
