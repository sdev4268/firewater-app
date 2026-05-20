-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "classification" JSONB;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "userCanToggle" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProjectSectionReview" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,

    CONSTRAINT "ProjectSectionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionStandard" (
    "id" SERIAL NOT NULL,
    "sectionNumberHint" TEXT NOT NULL,
    "standardCode" TEXT NOT NULL,
    "clause" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionStandard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSectionReview_projectId_sectionId_key" ON "ProjectSectionReview"("projectId", "sectionId");

-- AddForeignKey
ALTER TABLE "ProjectSectionReview" ADD CONSTRAINT "ProjectSectionReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSectionReview" ADD CONSTRAINT "ProjectSectionReview_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
