-- CreateTable
CREATE TABLE "AffiliateEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "jobId" TEXT,
    "day" INTEGER,
    "category" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliateEvent_createdAt_idx" ON "AffiliateEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AffiliateEvent_event_createdAt_idx" ON "AffiliateEvent"("event", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateEvent_partner_createdAt_idx" ON "AffiliateEvent"("partner", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateEvent_category_createdAt_idx" ON "AffiliateEvent"("category", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateEvent_jobId_idx" ON "AffiliateEvent"("jobId");

-- AddForeignKey
ALTER TABLE "AffiliateEvent" ADD CONSTRAINT "AffiliateEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TripJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
