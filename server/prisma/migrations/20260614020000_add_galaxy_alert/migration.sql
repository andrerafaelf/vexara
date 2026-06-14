-- CreateTable
CREATE TABLE "GalaxyAlert" (
    "id" SERIAL NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalaxyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalaxyAlert_galaxyId_idx" ON "GalaxyAlert"("galaxyId");

-- CreateIndex
CREATE UNIQUE INDEX "GalaxyAlert_galaxyId_email_key" ON "GalaxyAlert"("galaxyId", "email");

-- AddForeignKey
ALTER TABLE "GalaxyAlert" ADD CONSTRAINT "GalaxyAlert_galaxyId_fkey" FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
