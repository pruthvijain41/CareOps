# ============================================================================
# CareOps — Combined Dockerfile (FastAPI + WhatsApp Bridge)
# Optimized for Hugging Face Spaces (16GB RAM)
# ============================================================================

FROM python:3.11-slim

# 1. Install system dependencies & Node.js
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 2. Add a non-root user (Hugging Face Requirement)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

# 3. Set working directory
WORKDIR /app

# 4. Copy application files with correct ownership
COPY --chown=user . .

# 5. Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 6. Install Node.js dependencies for the WhatsApp bridge
RUN cd whatsapp-bridge && npm install

# 7. Set environment variables
# Hugging Face Spaces uses port 7860 by default
ENV PORT=7860
ENV PYTHONUNBUFFERED=1

# 8. Start the combined service
CMD ["./start.sh"]
