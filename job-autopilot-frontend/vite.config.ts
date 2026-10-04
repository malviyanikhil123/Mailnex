import process from "node:process";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL || env.API_URL || "http://localhost:6002";
  const port = Number(env.FRONT_PORT || 5056);

  return {
    plugins: [
      {
        name: "serve-config-js",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === "/config.js") {
              res.setHeader("Content-Type", "application/javascript; charset=utf-8");
              res.end(`window.AUTOPILOT_API = ${JSON.stringify(apiUrl)};\n`);
              return;
            }
            next();
          });
        },
      },
    ],
    server: {
      port,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
        },
        "^/approve/.+": {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
