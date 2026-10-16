-- CreateTable
CREATE TABLE "CoachInvite" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachLink" (
    "coachId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachLink_pkey" PRIMARY KEY ("coachId","studentId")
);

-- CreateTable
CREATE TABLE "CoachComment" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ply" INTEGER,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkAttempt" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "item" INTEGER NOT NULL,
    "solved" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachInvite_studentId_idx" ON "CoachInvite"("studentId");

-- CreateIndex
CREATE INDEX "CoachLink_studentId_idx" ON "CoachLink"("studentId");

-- CreateIndex
CREATE INDEX "CoachComment_gameId_createdAt_idx" ON "CoachComment"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachComment_studentId_readAt_idx" ON "CoachComment"("studentId", "readAt");

-- CreateIndex
CREATE INDEX "Homework_studentId_createdAt_idx" ON "Homework"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Homework_coachId_studentId_idx" ON "Homework"("coachId", "studentId");

-- CreateIndex
CREATE INDEX "HomeworkAttempt_homeworkId_item_idx" ON "HomeworkAttempt"("homeworkId", "item");

-- AddForeignKey
ALTER TABLE "CoachInvite" ADD CONSTRAINT "CoachInvite_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachLink" ADD CONSTRAINT "CoachLink_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachLink" ADD CONSTRAINT "CoachLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachComment" ADD CONSTRAINT "CoachComment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachComment" ADD CONSTRAINT "CoachComment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachComment" ADD CONSTRAINT "CoachComment_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkAttempt" ADD CONSTRAINT "HomeworkAttempt_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

