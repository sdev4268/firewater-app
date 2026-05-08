-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ENGINEER');

-- CreateEnum
CREATE TYPE "VisibilityRule" AS ENUM ('ALWAYS', 'PROJECT_TYPE', 'USER_TOGGLE');

-- CreateEnum
CREATE TYPE "ValueType" AS ENUM ('FIXED', 'DROPDOWN', 'MANUAL', 'CALCULATED', 'MULTI_SELECT');

-- CreateEnum
CREATE TYPE "SnoFormat" AS ENUM ('numeric', 'alpha_lower', 'alpha_upper');

-- CreateEnum
CREATE TYPE "ContentItemType" AS ENUM ('FIXED', 'CHECKBOX', 'DROPDOWN', 'ADDABLE');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('ADDED', 'MODIFIED', 'DELETED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ENGINEER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "numberHint" TEXT,
    "titleTemplate" TEXT NOT NULL,
    "contentTemplate" TEXT,
    "visibilityRule" "VisibilityRule" NOT NULL DEFAULT 'ALWAYS',
    "projectTypesWhitelist" JSONB,
    "isHeadingOnly" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueType" "ValueType" NOT NULL,
    "fixedValue" TEXT,
    "dropdownOptions" JSONB,
    "defaultValue" TEXT,
    "units" TEXT,
    "placeholderTag" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldOverride" (
    "id" SERIAL NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "projectTypeCode" TEXT NOT NULL,
    "overrideValue" TEXT NOT NULL,

    CONSTRAINT "FieldOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "projectTypeId" INTEGER NOT NULL,
    "documentNumber" TEXT,
    "revision" TEXT NOT NULL DEFAULT '0',
    "owner" TEXT,
    "consultant" TEXT,
    "jobNumber" TEXT,
    "facilityName" TEXT,
    "location" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFieldValue" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ProjectFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSectionToggle" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProjectSectionToggle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionTable" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "tableKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "snoFormat" "SnoFormat" NOT NULL DEFAULT 'numeric',
    "canAddRows" BOOLEAN NOT NULL DEFAULT true,
    "canDeleteRows" BOOLEAN NOT NULL DEFAULT true,
    "canReorderRows" BOOLEAN NOT NULL DEFAULT false,
    "canSelectDeselect" BOOLEAN NOT NULL DEFAULT true,
    "hasTextBody" BOOLEAN NOT NULL DEFAULT false,
    "cellSupportsDropdown" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SectionTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionTableRow" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "rowData" JSONB NOT NULL DEFAULT '{}',
    "isSeed" BOOLEAN NOT NULL DEFAULT true,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isCheckedDefault" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SectionTableRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTableRow" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "tableId" INTEGER NOT NULL,
    "rowData" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectTableRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSeedRowSelection" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "rowId" INTEGER NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProjectSeedRowSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionContentItem" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "itemType" "ContentItemType" NOT NULL DEFAULT 'FIXED',
    "label" TEXT NOT NULL,
    "bodyText" TEXT,
    "options" JSONB,
    "defaultOn" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "SectionContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContentSelection" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "chosenOption" TEXT,

    CONSTRAINT "ProjectContentSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionHistory" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "revisionCode" TEXT NOT NULL,
    "revisionDate" TEXT NOT NULL,
    "purpose" TEXT,
    "preparedBy" TEXT,
    "checkedBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClauseRevisionMark" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sectionId" INTEGER,
    "fieldId" INTEGER,
    "revisionCode" TEXT NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClauseRevisionMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationLog" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outputPath" TEXT,
    "revision" TEXT,
    "generatedBy" TEXT,

    CONSTRAINT "GenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectType_code_key" ON "ProjectType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFieldValue_projectId_fieldId_key" ON "ProjectFieldValue"("projectId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSectionToggle_projectId_sectionId_key" ON "ProjectSectionToggle"("projectId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionTable_sectionId_tableKey_key" ON "SectionTable"("sectionId", "tableKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSeedRowSelection_projectId_rowId_key" ON "ProjectSeedRowSelection"("projectId", "rowId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContentSelection_projectId_itemId_key" ON "ProjectContentSelection"("projectId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionHistory_projectId_revisionCode_key" ON "RevisionHistory"("projectId", "revisionCode");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldOverride" ADD CONSTRAINT "FieldOverride_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldOverride" ADD CONSTRAINT "FieldOverride_projectTypeCode_fkey" FOREIGN KEY ("projectTypeCode") REFERENCES "ProjectType"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "ProjectType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFieldValue" ADD CONSTRAINT "ProjectFieldValue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFieldValue" ADD CONSTRAINT "ProjectFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSectionToggle" ADD CONSTRAINT "ProjectSectionToggle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSectionToggle" ADD CONSTRAINT "ProjectSectionToggle_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionTable" ADD CONSTRAINT "SectionTable_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionTableRow" ADD CONSTRAINT "SectionTableRow_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "SectionTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTableRow" ADD CONSTRAINT "ProjectTableRow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTableRow" ADD CONSTRAINT "ProjectTableRow_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "SectionTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSeedRowSelection" ADD CONSTRAINT "ProjectSeedRowSelection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSeedRowSelection" ADD CONSTRAINT "ProjectSeedRowSelection_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "SectionTableRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionContentItem" ADD CONSTRAINT "SectionContentItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContentSelection" ADD CONSTRAINT "ProjectContentSelection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContentSelection" ADD CONSTRAINT "ProjectContentSelection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SectionContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionHistory" ADD CONSTRAINT "RevisionHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClauseRevisionMark" ADD CONSTRAINT "ClauseRevisionMark_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationLog" ADD CONSTRAINT "GenerationLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
