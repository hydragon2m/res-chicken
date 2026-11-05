CREATE TYPE "FulfillmentStatus" AS ENUM ('QUEUED', 'PREPARING', 'READY', 'HANDED_OVER', 'VOIDED');

CREATE TABLE "FulfillmentTicket" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparingAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "handedOverAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "preparingById" UUID,
    "readyById" UUID,
    "handedOverById" UUID,
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FulfillmentTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FulfillmentTicketItem" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "optionsSnapshot" JSONB NOT NULL,
    CONSTRAINT "FulfillmentTicketItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FulfillmentTicketEvent" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "fromStatus" "FulfillmentStatus",
    "toStatus" "FulfillmentStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FulfillmentTicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FulfillmentTicket_orderId_key" ON "FulfillmentTicket"("orderId");
CREATE INDEX "FulfillmentTicket_storeId_status_priority_queuedAt_idx" ON "FulfillmentTicket"("storeId", "status", "priority", "queuedAt");
CREATE INDEX "FulfillmentTicketItem_ticketId_idx" ON "FulfillmentTicketItem"("ticketId");
CREATE INDEX "FulfillmentTicketEvent_ticketId_createdAt_idx" ON "FulfillmentTicketEvent"("ticketId", "createdAt");

ALTER TABLE "FulfillmentTicket" ADD CONSTRAINT "FulfillmentTicket_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FulfillmentTicket" ADD CONSTRAINT "FulfillmentTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FulfillmentTicketItem" ADD CONSTRAINT "FulfillmentTicketItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "FulfillmentTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FulfillmentTicketEvent" ADD CONSTRAINT "FulfillmentTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "FulfillmentTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
