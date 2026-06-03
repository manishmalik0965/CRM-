import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver');
const createArchive = archiver.default || archiver;
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.join(__dirname, 'public', 'hostinger-deploy.zip');
// Ensure public exists
if (!fs.existsSync(path.join(__dirname, 'public'))) {
  fs.mkdirSync(path.join(__dirname, 'public'));
}

const output = fs.createWriteStream(outputPath);
const archive = createArchive('zip', {
  zlib: { level: 9 } // Sets the compression level.
});

output.on('close', function() {
  console.log(archive.pointer() + ' total bytes');
  console.log('archiver has been finalized and the output file descriptor has closed.');
  
  // Now copy it to dist/ so it's available in the final build immediately too if already built
  if (fs.existsSync(path.join(__dirname, 'dist'))) {
    fs.copyFileSync(outputPath, path.join(__dirname, 'dist', 'hostinger-deploy.zip'));
  }
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// append files from a sub-directory, putting its contents at the root of archive
archive.directory('dist/', false);

archive.finalize();
