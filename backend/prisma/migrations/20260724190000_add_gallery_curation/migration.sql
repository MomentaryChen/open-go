-- Gallery curation flags on TripItinerary. Additive and non-breaking: existing
-- rows default to false, so the current explore gallery is unchanged until an
-- admin curates. See prisma/schema.prisma TripItinerary.
-- AlterTable
ALTER TABLE "TripItinerary" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;
