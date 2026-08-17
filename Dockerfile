FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle
RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
RUN mkdir -p /app/data/media && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
