import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const appDir = path.join(cwd, "app");
const pagesDir = path.join(cwd, "pages");
const packageJson = path.join(cwd, "package.json");

if (!fs.existsSync(packageJson)) {
  console.error("Dhvani startup check failed: package.json not found in current directory.");
  console.error(`Current directory: ${cwd}`);
  process.exit(1);
}

if (!fs.existsSync(appDir) && !fs.existsSync(pagesDir)) {
  console.error("Dhvani startup check failed: couldn't find 'app/' or 'pages/' in project root.");
  console.error(`Current directory: ${cwd}`);
  process.exit(1);
}
