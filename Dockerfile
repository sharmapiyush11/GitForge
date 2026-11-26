FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend-main
COPY frontend-main/package*.json ./
RUN npm ci
COPY frontend-main/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY backend-main/package*.json ./backend-main/
RUN npm ci --prefix backend-main --omit=dev
COPY backend-main/ ./backend-main/
COPY --from=frontend-builder /app/frontend-main/dist ./frontend-main/dist

EXPOSE 3002
CMD ["npm", "start", "--prefix", "backend-main"]
