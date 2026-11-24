# ── Kultura All-in-One Dockerfile (Frontend + Gateway + Embedded Postgres) ──

FROM omchoksi/kultura-frontend:latest AS frontend_build
FROM omchoksi/kultura-gateway:latest AS final

USER root

# Install Node.js, PostgreSQL 16, and Supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    postgresql \
    postgresql-contrib \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Copy built Next.js standalone frontend into /app/frontend
WORKDIR /app
COPY --from=frontend_build /app /app/frontend

# Copy Ollama runtime engine (no external installation required)
COPY bin/ollama /usr/local/bin/ollama
COPY bin/ollama_lib /usr/local/lib/ollama
RUN chmod +x /usr/local/bin/ollama

# Copy supervisor config and entrypoint
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_PUBLIC_SERVER_URL="http://localhost:8000"
ENV NEXT_PUBLIC_CLIENT_URL="http://localhost:3000"
ENV DATABASE_URL="postgresql+asyncpg://kultura:kultura@127.0.0.1:5432/kultura"
ENV OLLAMA_BASE_URL="http://127.0.0.1:11434"

EXPOSE 3000 8000 11434

ENTRYPOINT ["/app/entrypoint.sh"]
