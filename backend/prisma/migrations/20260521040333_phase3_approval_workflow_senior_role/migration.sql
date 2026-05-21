-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SENIOR';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "ProjectApproval" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "submittedById" INTEGER NOT NULL,
    "approverId" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "comments" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectApproval_projectId_key" ON "ProjectApproval"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectApproval" ADD CONSTRAINT "ProjectApproval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectApproval" ADD CONSTRAINT "ProjectApproval_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectApproval" ADD CONSTRAINT "ProjectApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
