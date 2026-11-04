// Vite builds into dist/app (served at /wx/app/). The entry page belongs at the site root.
import { renameSync, existsSync } from 'node:fs';

const from = 'dist/app/index.html';
if (!existsSync(from)) throw new Error(`${from} missing`);
renameSync(from, 'dist/index.html');
console.log('postbuild: dist/index.html (assets under /wx/app/)');
