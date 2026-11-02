-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BORROWER', 'CUSTODIAN');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'FULFILLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "Asset" (
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "retiredAt" TIMESTAMPTZ(6),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "CustodianAsset" (
    "custodianId" UUID NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "CustodianAsset_pkey" PRIMARY KEY ("custodianId","assetId")
);

-- CreateTable
CREATE TABLE "BorrowRequest" (
    "id" UUID NOT NULL,
    "borrowerId" UUID NOT NULL,
    "assetId" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "BorrowRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "assetId" TEXT NOT NULL,
    "borrowerId" UUID NOT NULL,
    "checkoutCustodianId" UUID NOT NULL,
    "checkedOutAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "returnedAt" TIMESTAMPTZ(6),
    "returnCustodianId" UUID,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "BorrowRequest_borrowerId_idx" ON "BorrowRequest"("borrowerId");

-- CreateIndex
CREATE INDEX "BorrowRequest_assetId_status_idx" ON "BorrowRequest"("assetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_requestId_key" ON "Loan"("requestId");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");

-- CreateIndex
CREATE INDEX "Loan_assetId_idx" ON "Loan"("assetId");

-- A physical copy can have only one open loan, even under concurrent checkout.
CREATE UNIQUE INDEX "Loan_one_active_per_asset" ON "Loan"("assetId") WHERE "returnedAt" IS NULL;

ALTER TABLE "Loan" ADD CONSTRAINT "Loan_due_after_checkout" CHECK ("dueAt" > "checkedOutAt");
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_return_after_checkout" CHECK ("returnedAt" IS NULL OR "returnedAt" >= "checkedOutAt");
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_return_actor_together" CHECK (("returnedAt" IS NULL) = ("returnCustodianId" IS NULL));


-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodianAsset" ADD CONSTRAINT "CustodianAsset_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodianAsset" ADD CONSTRAINT "CustodianAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("assetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BorrowRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_checkoutCustodianId_fkey" FOREIGN KEY ("checkoutCustodianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_returnCustodianId_fkey" FOREIGN KEY ("returnCustodianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
