FROM node:22

# Install poppler-utils (pdftotext) and canvas native dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      poppler-utils \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for Docker layer caching
COPY package.json ./
COPY prisma ./prisma/

# Install dependencies (postinstall runs prisma generate)
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 10000

# prisma db push is idempotent — safe to run on every start
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
