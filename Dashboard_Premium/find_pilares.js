import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, './src');

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walk(filePath, callback);
    } else {
      callback(filePath);
    }
  });
}

function searchPilares() {
  walk(srcDir, filePath => {
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.toLowerCase().includes('pilar') || content.toLowerCase().includes('pilares') || content.includes('fuerza') && content.includes('explosividad')) {
        console.log(`Found reference in: ${path.basename(filePath)}`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('pilar') || line.toLowerCase().includes('fuerza') || line.toLowerCase().includes('explosividad')) {
            if (line.length < 150) {
              console.log(`  Line ${idx + 1}: ${line.trim()}`);
            }
          }
        });
      }
    }
  });
}

searchPilares();
