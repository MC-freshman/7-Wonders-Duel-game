/* 七大奇迹对决 · PM2 进程守护配置
 * 用法：pm2 start ecosystem.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: '7-wonders-duel',
      script: 'dist-server/server.mjs',
      cwd: __dirname,
      // 单实例即可：本作服务器是纯内存状态机，多实例反而分裂房间表
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
    },
  ],
};
