-- CreateTable
CREATE TABLE "orders" (
    "order_id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'új',
    "order_desc" TEXT,
    "price" DECIMAL(10,2),
    "payed" BOOLEAN NOT NULL DEFAULT false,
    "email" BOOLEAN NOT NULL,
    "category" TEXT,
    "location" TEXT,
    "light" TEXT,
    "watering" TEXT,
    "current_height_cm" INTEGER,
    "max_height_cm" INTEGER,
    "current_pot_cm" INTEGER,
    "pet_safe" BOOLEAN,
    "kid_safe" BOOLEAN,
    "air_purifying" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_audit_log" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "previous_data" JSONB,
    "new_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_audit_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_audit_log" ADD CONSTRAINT "order_audit_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_audit_log" ADD CONSTRAINT "order_audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
