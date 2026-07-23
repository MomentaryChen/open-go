-- CreateTable
CREATE TABLE "SearchKeywordLog" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchKeywordLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchKeywordLog_createdAt_idx" ON "SearchKeywordLog"("createdAt");

-- CreateIndex
CREATE INDEX "SearchKeywordLog_keyword_idx" ON "SearchKeywordLog"("keyword");
