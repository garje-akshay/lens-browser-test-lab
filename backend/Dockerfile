FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./backend/
COPY shared ./shared

WORKDIR /app/backend
RUN npm install --omit=dev --ignore-scripts

COPY backend/src ./src

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "src/server.js"]
