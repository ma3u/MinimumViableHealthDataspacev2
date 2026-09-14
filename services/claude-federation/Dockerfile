# syntax=docker/dockerfile:1
FROM node:22.14-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.14-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Never root: this process holds the only credential path in the system.
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
