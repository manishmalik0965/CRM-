const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const publicDir = path.join(process.cwd(), 'public');
const distDir = path.join(process.cwd(), 'dist');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// Generate a production-tuned package.json for cPanel inside the dist directory
const prodPackageJson = {
  name: "crm-saas-production",
  version: "1.0.0",
  description: "Production CRM SaaS build for Hostinger/cPanel Node.js",
  main: "server.cjs",
  type: "commonjs",
  scripts: {
    "start": "node server.cjs"
  },
  dependencies: {
    "express": "^4.21.2",
    "mysql2": "^3.22.4",
    "nodemailer": "^8.0.7",
    "bcryptjs": "^3.0.3",
    "dotenv": "^17.2.3",
    "jsonwebtoken": "^9.0.3",
    "otplib": "^12.0.1",
    "qrcode": "^1.5.4",
    "uuid": "^14.0.0",
    "@google/genai": "^1.52.0"
  }
};

const outputPath = path.join(publicDir, 'hostinger-deploy.zip');

function main() {
  console.log('Starting ZIP preparation...');

  if (!fs.existsSync(distDir)) {
    console.error('Error: dist directory does not exist! Run npm run build first.');
    process.exit(1);
  }

  // 1. Write production package.json in dist
  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify(prodPackageJson, null, 2),
    'utf8'
  );
  console.log('Production package.json created successfully in dist/');

  // Copy database schema as a static asset so it is directly downloadable
  const schemaSource = path.join(process.cwd(), 'database', 'schema.sql');
  if (fs.existsSync(schemaSource)) {
    fs.copyFileSync(schemaSource, path.join(distDir, 'schema.sql'));
    fs.copyFileSync(schemaSource, path.join(publicDir, 'schema.sql'));
    console.log('Database schema.sql copied to dist/ and public/ as static assets.');
  }

  // 2. Create .env.example template inside dist/
  const envExample = `# Database Connection (Setup your cPanel MySQL Database)
MYSQL_HOST=localhost
MYSQL_USER=your_cpanel_db_user
MYSQL_PASSWORD=your_cpanel_db_password
MYSQL_DATABASE=your_cpanel_db_name

# App Setup
NODE_ENV=production
PORT=3000
JWT_SECRET=your_jwt_secret_here

# SaaS Landlord Mode
# set to true on your main central SaaS backend server (e.g. crm.itconflict.xyz) to check client active/suspended states.
# set to false (or leave blank) on self-hosted instances so they are never locked/suspended.
SaaS_LANDLORD_MODE=false

# Optional APIs
# GEMINI_API_KEY=
`;
  fs.writeFileSync(path.join(distDir, '.env.example'), envExample, 'utf8');
  console.log('.env.example created successfully in dist/');

  // 3. Clean up any existing zip file in dist TO PREVENT circular recursive zipping
  const existingZipInDist = path.join(distDir, 'hostinger-deploy.zip');
  if (fs.existsSync(existingZipInDist)) {
    try {
      fs.unlinkSync(existingZipInDist);
      console.log('Cleaned up of pre-existing zip inside dist/');
    } catch (err) {
      console.warn('Could not remove pre-existing zip in dist:', err);
    }
  }

  // 4. Clean up existing zip in public
  if (fs.existsSync(outputPath)) {
    try {
      fs.unlinkSync(outputPath);
      console.log('Cleaned up previous zip inside public/');
    } catch (err) {
      console.warn('Could not remove previous zip in public:', err);
    }
  }

  // 5. Package the contents of dist/ using bestzip
  console.log('Packaging dist contents with bestzip...');
  try {
    // We include * (all standard files), .htaccess, and .env.example
    execSync('npx bestzip ../public/hostinger-deploy.zip * .htaccess .env.example', {
      cwd: distDir,
      stdio: 'inherit'
    });
    console.log('Bestzip packaging completed successfully.');
  } catch (err) {
    console.error('Bestzip zipping failed:', err);
    process.exit(1);
  }

  // 6. Copy the finalized zip back to dist so it is available for static downloads
  if (fs.existsSync(outputPath)) {
    try {
      fs.copyFileSync(outputPath, path.join(distDir, 'hostinger-deploy.zip'));
      console.log(`Finalized hostinger-deploy.zip copied to dist/ (size: ${fs.statSync(outputPath).size} bytes)`);
    } catch (err) {
      console.error('Failed to copy finalized zip to dist:', err);
      process.exit(1);
    }
  } else {
    console.error('Finalized zip was not found in public!');
    process.exit(1);
  }

  console.log('ZIP build process completed successfully. Ready for public download/production setup!');
}

main();
