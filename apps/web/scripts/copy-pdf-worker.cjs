const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const source = path.join(
  packageRoot,
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
);
const destination = path.join(__dirname, "../public/pdf.worker.min.mjs");

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log("Prepared local PDF.js worker asset.");
