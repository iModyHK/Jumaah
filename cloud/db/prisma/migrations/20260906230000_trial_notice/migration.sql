-- Trials: remember that the "ends soon" notice was sent.
ALTER TABLE "Tenant" ADD COLUMN "trialNoticeSentAt" TIMESTAMP(3);
