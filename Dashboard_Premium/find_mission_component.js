import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.resolve(__dirname, './src/components');

function searchComponents() {
  const files = fs.readdirSync(componentsDir);
  files.forEach(file => {
    const filePath = path.join(componentsDir, file);
    if (fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('Psicología') || content.includes('Nutrición') || content.includes('CREAR NUEVA') || content.includes('misiones_tipo_check')) {
        console.log(`Found match in: ${file}`);
        // print lines matching those
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('Psicología') || line.includes('Nutrición') || line.includes('tipo') || line.includes('Dropdown') || line.includes('Select') || line.includes('option')) {
            console.log(`  Line ${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchComponents();
