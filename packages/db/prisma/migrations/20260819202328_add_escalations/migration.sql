-- CreateTable
CREATE TABLE "escalations" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
