# Firewater backend — Docker image with LibreOffice for PDF export
FROM node:20-bookworm-slim

# ── Install LibreOffice (headless PDF conversion) + fonts ──────────────────
# libreoffice-writer + libreoffice-core cover the docx→pdf conversion path
# used by routes/generate.js. fonts-dejavu/liberation avoid missing-glyph
# issues in the generated PDF.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-core \
    fonts-dejavu \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install deps (incl. devDependencies — prisma CLI needed for generate) ──
COPY package.json package-lock.json ./
RUN npm ci

# ── Copy the rest of the backend source ─────────────────────────────────────
COPY . .

# ── Generate Prisma client, then drop devDependencies to slim the image ────
RUN npx prisma generate
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "index.js"]
