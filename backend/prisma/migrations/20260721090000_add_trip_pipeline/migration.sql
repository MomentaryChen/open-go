-- CreateTable
CREATE TABLE "TripJob" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TripJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripQuery" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "intent" TEXT,
    "language" TEXT,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TripQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDocument" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "content" TEXT,
    "contentHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fetchedAt" TIMESTAMP(3),
    CONSTRAINT "TripDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripItinerary" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripItinerary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripJob_status_idx" ON "TripJob"("status");

-- CreateIndex
CREATE INDEX "TripJob_createdAt_idx" ON "TripJob"("createdAt");

-- CreateIndex
CREATE INDEX "TripQuery_jobId_idx" ON "TripQuery"("jobId");

-- CreateIndex
CREATE INDEX "TripDocument_jobId_status_idx" ON "TripDocument"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TripDocument_jobId_url_key" ON "TripDocument"("jobId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "TripItinerary_jobId_key" ON "TripItinerary"("jobId");

-- AddForeignKey
ALTER TABLE "TripQuery" ADD CONSTRAINT "TripQuery_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TripJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDocument" ADD CONSTRAINT "TripDocument_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TripJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItinerary" ADD CONSTRAINT "TripItinerary_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TripJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
