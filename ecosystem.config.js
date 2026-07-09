module.exports = {
  apps: [
    {
      name: "absensi-app",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      cwd: "c:/xampp/htdocs/Absensi",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "whatsapp-bot",
      script: "bot.js",
      cwd: "c:/xampp/htdocs/Absensi/whatsapp-bot",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
