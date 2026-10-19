import { mkdir, readdir, copyFile, cp } from 'node:fs/promises';
await mkdir('public', { recursive: true });
for (const file of await readdir('.')) {
  if (file.endsWith('.html')) await copyFile(file, `public/${file}`);
}
await cp('assets', 'public/assets', { recursive: true });
console.log('Static website prepared in public/; server function stays in api/.');
