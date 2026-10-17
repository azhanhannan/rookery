-- CreateTable
CREATE TABLE "GameInsight" (
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factsVersion" INTEGER NOT NULL,
    "facts" JSONB,
    "excluded" TEXT,
    "history" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameInsight_pkey" PRIMARY KEY ("gameId")
);

-- CreateTable
CREATE TABLE "CoachFocus" (
    "studentId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachFocus_pkey" PRIMARY KEY ("studentId")
);

-- CreateIndex
CREATE INDEX "GameInsight_userId_idx" ON "GameInsight"("userId");

-- CreateIndex
CREATE INDEX "CoachFocus_coachId_idx" ON "CoachFocus"("coachId");

-- AddForeignKey
ALTER TABLE "GameInsight" ADD CONSTRAINT "GameInsight_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInsight" ADD CONSTRAINT "GameInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFocus" ADD CONSTRAINT "CoachFocus_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFocus" ADD CONSTRAINT "CoachFocus_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

