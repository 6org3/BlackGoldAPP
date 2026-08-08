import process from 'node:process';

import { run } from './cli.mjs';

try {
  const result = await run(process.argv.slice(2));
  process.stdout.write(`${result.summary}\n`);
  process.exitCode = result.code;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
