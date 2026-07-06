-- Read-only DB-szerepkör az agent runSql-jéhez (architektura.md #2: két kapcsolat, két jog).
-- ALTER DEFAULT PRIVILEGES itt a POSTGRES_USER (plantbase) szerepkörre vonatkozik, ami a
-- migrációkat is futtatja majd -- így a később, migrációval létrejövő táblákra is
-- automatikusan SELECT jogot kap a plantbase_ro szerepkör.
CREATE ROLE plantbase_ro WITH LOGIN PASSWORD 'plantbase_ro';
GRANT CONNECT ON DATABASE plantbase TO plantbase_ro;
GRANT USAGE ON SCHEMA public TO plantbase_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO plantbase_ro;
