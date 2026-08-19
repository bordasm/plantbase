-- Szigorítás: a plantbase_ro szerepkör (az agent runSql tool-ja, lásd
-- docker/init-readonly-role.sql) az accounts/sessions táblákra még az
-- A al-projektből örökölt, soha vissza nem vont SELECT jogot -- ezt a
-- záró code review két egymást követő körében is sikerült élesben
-- kihasználni: a runSql tool app-szintű tábla-engedélylistája
-- (packages/core/src/lib/run-sql.ts) regex-alapú, és mindkét körben
-- találtunk rá működő megkerülést (legutóbb két külön string-literál
-- `/*` és `*/` részletei közé rejtett `UNION SELECT ... FROM accounts`
-- alakban). Mivel a sessions.token a NYERS, hash-eletlen session
-- cookie-érték, ez élő session-hijack útvonal volt: az agenten
-- keresztül más ügyfelek munkamenetét lehetett átvenni.
--
-- Az app-szintű engedélylista továbbra is marad, de csak mint másodlagos
-- (defense-in-depth) réteg -- a rést itt, DB-szinten zárjuk le,
-- ugyanúgy, ahogy a 20260818194644_restrict_readonly_role_to_catalog
-- migráció tette az orders/order_audit_log táblákkal. Így a
-- sebezhetőség strukturálisan lehetetlen, nem pedig egy szöveg-scanner
-- helyességén múlik. A read-only pool egyetlen jogos fogyasztója sem
-- olvas accounts/sessions táblát (runSql, listCategories,
-- searchKnowledge, debugRetrieval -- mind katalógus/tudásbázis).
--
-- A pg_roles guard azért kell, mert friss környezetben a
-- `migrate deploy` lefuthat még azelőtt, hogy a
-- docker/init-readonly-role.sql létrehozta volna a szerepkört.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plantbase_ro') THEN
    REVOKE ALL ON accounts, sessions FROM plantbase_ro;
  END IF;
END $$;
