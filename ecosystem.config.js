module.exports = {
  apps: [
    {
      name: "absensi-app-madrasah",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3004",
      cwd: "e:/xampp/htdocs/absensi-fingerspot",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "whatsapp-bot-madrasah",
      script: "bot.js",
      cwd: "e:/xampp/htdocs/absensi-fingerspot/whatsapp-bot",
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
