-- CreateTable
CREATE TABLE "PuzzleAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "solved" BOOLEAN NOT NULL,
    "ratingBefore" DOUBLE PRECISION NOT NULL,
    "ratingAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuzzleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PuzzleAttempt_userId_createdAt_idx" ON "PuzzleAttempt"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleAttempt_userId_puzzleId_key" ON "PuzzleAttempt"("userId", "puzzleId");

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

