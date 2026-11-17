-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EquipmentCondition" AS ENUM ('NORMAL', 'MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('LAB', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ACTIVE', 'RETURN_PENDING', 'CLOSED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CloseReason" AS ENUM ('RETURNED', 'TRANSFERRED', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'PENDING_APPROVAL', 'READY_TO_RELEASE', 'RELEASED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'DISPUTED');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "labGroup" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "ownership" "OwnershipType" NOT NULL DEFAULT 'LAB',
    "ownerName" TEXT,
    "custodianId" TEXT,
    "storageLocation" TEXT,
    "condition" "EquipmentCondition" NOT NULL DEFAULT 'NORMAL',
    "isBorrowable" BOOLEAN NOT NULL DEFAULT true,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "inactiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_accessories" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "equipment_accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" TIMESTAMP(3) NOT NULL,
    "checkedOutAt" TIMESTAMP(3),
    "returnRequestedAt" TIMESTAMP(3),
    "actualReturnAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "checkedOutById" TEXT,
    "receivedById" TEXT,
    "status" "LoanStatus" NOT NULL,
    "closeReason" "CloseReason",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handovers" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "fromLoanId" TEXT NOT NULL,
    "toLoanId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expectedTransferAt" TIMESTAMP(3),
    "expectedReturnAt" TIMESTAMP(3) NOT NULL,
    "status" "HandoverStatus" NOT NULL,
    "equipmentCondition" "EquipmentCondition" NOT NULL DEFAULT 'NORMAL',
    "accessoriesCheck" JSONB,
    "reason" TEXT,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "disputeReason" TEXT,
    "resolvedById" TEXT,
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_events" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_username_key" ON "user_profiles"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_assetCode_key" ON "equipment"("assetCode");

-- CreateIndex
CREATE INDEX "equipment_category_idx" ON "equipment"("category");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_accessories_equipmentId_name_key" ON "equipment_accessories"("equipmentId", "name");

-- CreateIndex
CREATE INDEX "loans_borrowerId_status_idx" ON "loans"("borrowerId", "status");

-- CreateIndex
CREATE INDEX "loans_equipmentId_createdAt_idx" ON "loans"("equipmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "handovers_toLoanId_key" ON "handovers"("toLoanId");

-- CreateIndex
CREATE INDEX "handovers_toUserId_status_idx" ON "handovers"("toUserId", "status");

-- CreateIndex
CREATE INDEX "handovers_equipmentId_requestedAt_idx" ON "handovers"("equipmentId", "requestedAt");

-- CreateIndex
CREATE INDEX "equipment_events_equipmentId_createdAt_idx" ON "equipment_events"("equipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_equipmentId_kind_idx" ON "attachments"("equipmentId", "kind");

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_accessories" ADD CONSTRAINT "equipment_accessories_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_fromLoanId_fkey" FOREIGN KEY ("fromLoanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_toLoanId_fkey" FOREIGN KEY ("toLoanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_events" ADD CONSTRAINT "equipment_events_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_events" ADD CONSTRAINT "equipment_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database guards for the responsibility chain. Every business write also locks
-- the equipment row, but these constraints protect against mistakes in any client.
CREATE UNIQUE INDEX "one_open_loan_per_equipment" ON "loans"("equipmentId")
  WHERE "status" IN ('ACTIVE', 'RETURN_PENDING');
CREATE UNIQUE INDEX "one_open_handover_per_equipment" ON "handovers"("equipmentId")
  WHERE "status" IN ('REQUESTED', 'ACCEPTED', 'PENDING_APPROVAL', 'READY_TO_RELEASE', 'RELEASED', 'DISPUTED');
CREATE UNIQUE INDEX "one_open_handover_per_loan" ON "handovers"("fromLoanId")
  WHERE "status" IN ('REQUESTED', 'ACCEPTED', 'PENDING_APPROVAL', 'READY_TO_RELEASE', 'RELEASED', 'DISPUTED');
ALTER TABLE "equipment_accessories" ADD CONSTRAINT "accessory_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "handovers" ADD CONSTRAINT "handover_distinct_people" CHECK ("fromUserId" <> "toUserId");
ALTER TABLE "handovers" ADD CONSTRAINT "completed_handover_has_new_loan" CHECK ("status" <> 'COMPLETED' OR ("toLoanId" IS NOT NULL AND "completedAt" IS NOT NULL));
ALTER TABLE "loans" ADD CONSTRAINT "active_loan_has_checkout" CHECK ("status" NOT IN ('ACTIVE', 'RETURN_PENDING') OR "checkedOutAt" IS NOT NULL);
ALTER TABLE "loans" ADD CONSTRAINT "closed_loan_has_reason_and_time" CHECK ("status" <> 'CLOSED' OR ("closeReason" IS NOT NULL AND "actualReturnAt" IS NOT NULL));

