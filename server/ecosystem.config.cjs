/**
 * PM2 process file — an alternative to Docker for bare-metal / VM deploys.
 *   pm2 start ecosystem.config.cjs --env production
 *
 * Cluster mode forks one worker per CPU core so a single edge box uses all its
 * cores for concurrent transfers. Node's cluster module load-balances incoming
 * connections across the workers.
 */
module.exports = {
  apps: [
    {
      name: "wifiplus-speedtest",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      instances: "max",
      exec_mode: "cluster",
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
      env_production: { NODE_ENV: "production" },
    },
  ],
};
