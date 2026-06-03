const { execSync } = require('child_process');
execSync('npx -y bestzip ../public/hostinger-deploy.zip * .htaccess', { cwd: './dist', stdio: 'inherit' });
