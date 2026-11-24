#!/usr/bin/env bash
set -e

# Default to internal PostgreSQL if not connecting to external database
if [[ -z "${DATABASE_URL:-}" ]] || [[ "${DATABASE_URL}" == *"localhost"* ]] || [[ "${DATABASE_URL}" == *"127.0.0.1"* ]] || [[ "${DATABASE_URL}" == *"db:5432"* ]]; then
    export DATABASE_URL="postgresql+asyncpg://kultura:kultura@127.0.0.1:5432/kultura"
    export POSTGRES_HOST="127.0.0.1"
    echo "==> Starting embedded PostgreSQL 16..."
    service postgresql start

    # Initialize user and db if needed
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='kultura'\" | grep -q 1 || psql -c \"CREATE USER kultura WITH PASSWORD 'kultura';\"" || true
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='kultura'\" | grep -q 1 || psql -c \"CREATE DATABASE kultura OWNER kultura;\"" || true
    su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE kultura TO kultura;\"" || true
fi

echo "==> Starting Kultura All-in-One: Frontend (:3000) & Gateway (:8000)..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
