-- CreateTable
CREATE TABLE "SettingHistory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "valueType" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettingHistory_key_createdAt_idx" ON "SettingHistory"("key", "createdAt");

-- CreateIndex
CREATE INDEX "SettingHistory_createdAt_idx" ON "SettingHistory"("createdAt");
