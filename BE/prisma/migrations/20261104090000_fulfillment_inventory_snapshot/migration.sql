DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "FulfillmentTicket" WHERE status IN ('QUEUED', 'PREPARING', 'READY')) THEN
    RAISE EXCEPTION 'Cannot apply fulfillment inventory snapshot migration while actionable tickets exist.';
  END IF;
END $$;

ALTER TABLE "FulfillmentTicketItem"
ADD COLUMN "inventoryMode" "InventoryMode" NOT NULL DEFAULT 'NOT_TRACKED',
ADD COLUMN "recipeSnapshot" JSONB;

ALTER TABLE "Session" ADD COLUMN "refreshSelector" TEXT;
CREATE UNIQUE INDEX "Session_refreshSelector_key" ON "Session"("refreshSelector");
