FROM postgres:16-alpine
# Init scripts run in filename order: auth -> wo schema -> wo seed.
# Missing workorder-*.sql here leaves work_orders/wo_tasks/services absent,
# and every /api/workorders route fails with a 500.
COPY server/db/auth-init.sql /docker-entrypoint-initdb.d/auth-init.sql
COPY server/db/workorder-schema.sql /docker-entrypoint-initdb.d/workorder-schema.sql
COPY server/db/workorder-seed.sql /docker-entrypoint-initdb.d/workorder-seed.sql
