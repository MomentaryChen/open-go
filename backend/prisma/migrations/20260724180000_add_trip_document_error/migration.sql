-- Persist per-document crawl failure reasons for admin debugging.
ALTER TABLE "TripDocument" ADD COLUMN "error" TEXT;
