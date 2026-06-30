# FABRIOZA CRM — single image used for BOTH the Next.js app and the email worker.
# (The worker needs the source + tsx, so we keep a full image rather than a stripped one.)
FROM node:20-bookworm-slim

WORKDIR /app

# Install deps first (cache-friendly). Includes devDeps (tsx, typescript) needed for
# `next build` and the worker — install BEFORE setting NODE_ENV=production.
COPY package.json package-lock.json ./
RUN npm ci

# App source + production build
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# CRM service uses this; the worker service overrides CMD to `npm run worker:email`.
CMD ["npm", "run", "start"]
