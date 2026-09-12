# 七大奇迹对决 · 服务器镜像
# 运行期零第三方依赖：只需要 dist/（前端）与 dist-server/server.mjs（服务器）。
# 先在本机执行 npm run build && npm run server:build 生成两份产物，再构建镜像。

FROM node:18-alpine

ENV PORT=8080
ENV NODE_ENV=production
WORKDIR /app

# 服务器通过 fileURLToPath(new URL('../dist', import.meta.url)) 定位前端，
# dist/ 与 dist-server/ 的相对位置必须保持「同目录平级」。
COPY dist-server/ ./dist-server/
COPY dist/ ./dist/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/ || exit 1

CMD ["node", "dist-server/server.mjs"]
