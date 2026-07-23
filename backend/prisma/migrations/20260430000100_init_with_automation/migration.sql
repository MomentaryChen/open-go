-- CreateTable
CREATE TABLE "Region" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'TW',
  "lastDiscoveryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poi" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "address" TEXT,
  "rating" DOUBLE PRECISION,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "contentHash" TEXT NOT NULL,
  "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Poi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRequestCache" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "paramsHash" TEXT NOT NULL,
  "responseHash" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IngestionRequestCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoiReviewLink" (
  "id" TEXT NOT NULL,
  "poiId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PoiReviewLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_countryCode_name_key" ON "Region"("countryCode", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Poi_source_sourceId_key" ON "Poi"("source", "sourceId");

-- CreateIndex
CREATE INDEX "Poi_regionId_idx" ON "Poi"("regionId");

-- CreateIndex
CREATE INDEX "Poi_lastFetchedAt_idx" ON "Poi"("lastFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionRequestCache_source_endpoint_paramsHash_key"
  ON "IngestionRequestCache"("source", "endpoint", "paramsHash");

-- CreateIndex
CREATE INDEX "IngestionRequestCache_expiresAt_idx" ON "IngestionRequestCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PoiReviewLink_poiId_platform_key" ON "PoiReviewLink"("poiId", "platform");

-- CreateIndex
CREATE INDEX "PoiReviewLink_platform_idx" ON "PoiReviewLink"("platform");

-- AddForeignKey
ALTER TABLE "Poi"
ADD CONSTRAINT "Poi_regionId_fkey" FOREIGN KEY ("regionId")
REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoiReviewLink"
ADD CONSTRAINT "PoiReviewLink_poiId_fkey" FOREIGN KEY ("poiId")
REFERENCES "Poi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
