-- A price interval is [startsAt, endsAt).  PostgreSQL, rather than an
-- application-side preflight query, owns the invariant so concurrent writes
-- cannot create two effective prices for the same variant.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "PriceSchedule"
  ADD CONSTRAINT "price_schedule_no_overlap"
  EXCLUDE USING gist (
    "variantId" WITH =,
    tsrange("startsAt", COALESCE("endsAt", 'infinity'::timestamp)) WITH &&
  );
