import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function walk(dir, callback) {
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file === 'node_modules' || file === '.git') return;
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        walk(filePath, callback);
      } else {
        callback(filePath);
      }
    });
  } catch (e) {
    // Ignore error
  }
}

function searchSql() {
  const sqlFiles = [];
  walk(rootDir, filePath => {
    if (filePath.endsWith('.sql')) {
      sqlFiles.push(filePath);
    }
  });
  console.log("All SQL files found:", sqlFiles);
  
  sqlFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.toLowerCase().includes('misiones')) {
      console.log(`\n--- Found 'misiones' in ${path.relative(rootDir, file)} ---`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('misiones') || line.toLowerCase().includes('tipo')) {
          console.log(`${idx + 1}: ${line.trim()}`);
        }
      });
    }
  });
}

searchSql();
