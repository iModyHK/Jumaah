-- DropForeignKey
ALTER TABLE "Tenant" DROP CONSTRAINT "Tenant_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "NetworkTranslation" DROP CONSTRAINT "NetworkTranslation_sourceTenantId_fkey";

-- DropForeignKey
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Webhook" DROP CONSTRAINT "Webhook_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_sponsorshipId_fkey";

-- DropForeignKey
ALTER TABLE "AiUsage" DROP CONSTRAINT "AiUsage_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_organisationId_fkey";

-- DropIndex
DROP INDEX "Tenant_customDomain_key";

-- DropIndex
DROP INDEX "Tenant_organisationId_idx";

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "billingAddress",
DROP COLUMN "billingCycle",
DROP COLUMN "billingEmail",
DROP COLUMN "billingName",
DROP COLUMN "billingVatNumber",
DROP COLUMN "cancelAtPeriodEnd",
DROP COLUMN "customDomain",
DROP COLUMN "customDomainVerifiedAt",
DROP COLUMN "organisationId",
DROP COLUMN "plan",
DROP COLUMN "subscriptionEndsAt",
DROP COLUMN "subscriptionStatus",
DROP COLUMN "syncKeyHash",
DROP COLUMN "trialNoticeSentAt";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "organisationId";

-- AlterTable
ALTER TABLE "LiveSession" DROP COLUMN "peakDisplays",
DROP COLUMN "peakPhones",
DROP COLUMN "uniquePhones";

-- DropTable
DROP TABLE "NetworkTranslation";

-- DropTable
DROP TABLE "ApiKey";

-- DropTable
DROP TABLE "Webhook";

-- DropTable
DROP TABLE "Organisation";

-- DropTable
DROP TABLE "Invoice";

-- DropTable
DROP TABLE "Sponsorship";

-- DropTable
DROP TABLE "AiUsage";

-- DropTable
DROP TABLE "PlatformSetting";

-- DropEnum
DROP TYPE "SubscriptionPlan";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- DropEnum
DROP TYPE "BillingCycle";

-- DropEnum
DROP TYPE "InvoiceStatus";

-- DropEnum
DROP TYPE "InvoiceKind";

-- DropEnum
DROP TYPE "SponsorshipStatus";

