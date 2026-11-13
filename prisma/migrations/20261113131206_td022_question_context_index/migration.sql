-- CreateIndex
CREATE INDEX "Experience_question_context_idx" ON "Experience"("departmentIdAtWrite", "companyId", "id", "status", "authorId");
