# Domain entities

Prisma remains the database schema and query adapter for this application.
These entities are framework- and ORM-free representations of the database
models, grouped by domain. Aggregates with behavior own real business rules:

- `OrderEntity`: which order states may be cancelled, paid, or refunded.
- `FulfillmentTicketEntity`: permitted KDS state transitions and the required
  reason for voiding a ticket.
- `ShiftEntity`: whether a shift may be reconciled and its cash variance.

Simple records (for example `Category`, `Supplier`, or `Ingredient`) are named
Entity interfaces. They make the domain model readable without duplicating an
empty TypeScript class or importing Prisma types into application code.
