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

function searchTables() {
  const results = [];
  walk(srcDir, filePath => {
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('misiones_atletas') || content.includes('progreso_misiones')) {
        results.push({
          file: path.basename(filePath),
          hasMisionesAtletas: content.includes('misiones_atletas'),
          hasProgresoMisiones: content.includes('progreso_misiones')
        });
      }
    }
  });
  console.log("Results:", results);
}

searchTables();
