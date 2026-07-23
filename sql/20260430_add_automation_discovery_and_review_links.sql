BEGIN;

ALTER TABLE "Region"
ADD COLUMN IF NOT EXISTS "lastDiscoveryAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PoiReviewLink" (
  "id" TEXT NOT NULL,
  "poiId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PoiReviewLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PoiReviewLink_poiId_fkey"
    FOREIGN KEY ("poiId") REFERENCES "Poi"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PoiReviewLink_poiId_platform_key"
  ON "PoiReviewLink"("poiId", "platform");

CREATE INDEX IF NOT EXISTS "PoiReviewLink_platform_idx"
  ON "PoiReviewLink"("platform");

COMMIT;
