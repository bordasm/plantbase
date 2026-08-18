-- Szigorítás: a plantbase_ro szerepkör (agent runSql tool-ja, lásd
-- docker/init-readonly-role.sql) a B al-projekt előtt írt blanket
-- `ALTER DEFAULT PRIVILEGES` miatt automatikusan SELECT jogot kapott az
-- ÚJ orders/order_audit_log táblákra is -- ez biztonsági rés volt (a
-- záró code review derítette ki): bármely ügyfél az agent runSql
-- tool-ján keresztül elérhette MÁS ügyfelek rendeléseit és a teljes
-- audit logot. Ez a migráció visszavonja a jogot ezekről a táblákról,
-- és az ALTER DEFAULT PRIVILEGES-t is szűkíti, hogy jövőbeli táblák se
-- kapjanak automatikus SELECT-et -- csak a products/knowledge_chunks
-- katalógus-táblákat kapja explicit módon vissza.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plantbase_ro') THEN
    REVOKE ALL ON orders, order_audit_log FROM plantbase_ro;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM plantbase_ro;
    GRANT SELECT ON products, knowledge_chunks TO plantbase_ro;
  END IF;
END $$;
