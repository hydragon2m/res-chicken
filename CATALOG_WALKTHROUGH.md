# Catalog walkthrough

1. Copy `.env.example` to `.env` and set a non-default `POSTGRES_PASSWORD` and `JWT_SECRET`.
2. Start the stack: `docker compose up -d --build`.
3. Verify both probes: `http://localhost:3001/api/v1/health/live` and `http://localhost:3001/api/v1/health/ready`.
4. Seed access control and create the first admin (these run in the migration image, which includes the scripts):

   ```powershell
   docker compose run --rm migrate npm run identity:seed
   docker compose run --rm -e ADMIN_EMAIL=admin@example.test -e ADMIN_PASSWORD='change-this-to-a-long-secret' -e ADMIN_STORE_NAME='Main Store' migrate npm run users:create-admin
   ```

5. Sign in at `http://localhost:3000/login`, then open `/admin/catalog/categories`.
6. Create a category, a product with at least one variant, an option group, link it to the product, then create a price schedule. The POS menu endpoint includes only active, in-stock variants with an effective price.

## Runtime checks used for this change

- `docker compose up -d` completed with the price-overlap migration applied.
- API live/readiness probes and the Catalog page returned `200`.
- `BE`: `npm run test:e2e` passed against the Compose PostgreSQL; it covers `401`, `403` cross-store, overlapping concurrent price requests, and menu filtering.
