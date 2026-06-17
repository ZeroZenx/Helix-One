module.exports = {
  apps: [
    {
      name: 'helix-one-backend',
      cwd: '/Users/darrenheadley/.openclaw/workspace/Helix-One/backend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        HOST: '127.0.0.1'
      }
    },
    {
      name: 'helix-one-frontend',
      cwd: '/Users/darrenheadley/.openclaw/workspace/Helix-One/frontend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '3010'
      }
    }
  ]
}
