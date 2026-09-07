-- Attendance insight (paid editions): peak screens / phones and distinct phones per live session.

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN "peakDisplays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "peakPhones" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "uniquePhones" INTEGER NOT NULL DEFAULT 0;
