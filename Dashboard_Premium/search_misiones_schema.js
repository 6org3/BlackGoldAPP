import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function searchSql() {
  const files = fs.readdirSync(__dirname);
  const sqlFiles = files.filter(f => f.endsWith('.sql'));
  
  console.log("SQL Files in project:", sqlFiles);
  
  for (const file of sqlFiles) {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
    if (content.toLowerCase().includes('misiones')) {
      console.log(`\n--- Found 'misiones' in ${file} ---`);
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes('misiones') || line.toLowerCase().includes('tipo')) {
          console.log(`${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
}

searchSql();
