-- Normaliza club_name de jugadores ATAH al label canónico del catálogo.
-- ATAH company_id: ea3a67be-d5f9-4f5e-b41b-ede061095b8a

WITH atah_athletes AS (
  SELECT DISTINCT u.id
  FROM "user" u
  INNER JOIN athlete_invitations ai ON ai."userId" = u.id
  WHERE ai."companyId" = 'ea3a67be-d5f9-4f5e-b41b-ede061095b8a'
    AND ai.status = 'approved'
    AND u.role = 'ATHLETE'
)
UPDATE "user" u
SET club_name = 'Club Atlético Tucumán'
FROM atah_athletes a
WHERE u.id = a.id
  AND lower(trim(both FROM regexp_replace(coalesce(u.club_name, ''), '\s+', ' ', 'g')))
    SIMILAR TO '(club atletico tucuman|club atlético tucumán)';

WITH atah_athletes AS (
  SELECT DISTINCT u.id
  FROM "user" u
  INNER JOIN athlete_invitations ai ON ai."userId" = u.id
  WHERE ai."companyId" = 'ea3a67be-d5f9-4f5e-b41b-ede061095b8a'
    AND ai.status = 'approved'
    AND u.role = 'ATHLETE'
)
UPDATE "user" u
SET club_name = 'Club San Martín'
FROM atah_athletes a
WHERE u.id = a.id
  AND lower(trim(both FROM regexp_replace(coalesce(u.club_name, ''), '\s+', ' ', 'g')))
    SIMILAR TO '(club san martin|club san martín)';

WITH atah_athletes AS (
  SELECT DISTINCT u.id
  FROM "user" u
  INNER JOIN athlete_invitations ai ON ai."userId" = u.id
  WHERE ai."companyId" = 'ea3a67be-d5f9-4f5e-b41b-ede061095b8a'
    AND ai.status = 'approved'
    AND u.role = 'ATHLETE'
)
UPDATE "user" u
SET club_name = 'Los Tarcos Rugby Club'
FROM atah_athletes a
WHERE u.id = a.id
  AND lower(trim(both FROM regexp_replace(coalesce(u.club_name, ''), '\s+', ' ', 'g')))
    SIMILAR TO '(los tarcos rugby club|los tarcos|tarcos rugby|^tarcos$)';

WITH atah_athletes AS (
  SELECT DISTINCT u.id
  FROM "user" u
  INNER JOIN athlete_invitations ai ON ai."userId" = u.id
  WHERE ai."companyId" = 'ea3a67be-d5f9-4f5e-b41b-ede061095b8a'
    AND ai.status = 'approved'
    AND u.role = 'ATHLETE'
)
UPDATE "user" u
SET club_name = 'Monteros Voley Club'
FROM atah_athletes a
WHERE u.id = a.id
  AND lower(trim(both FROM regexp_replace(coalesce(u.club_name, ''), '\s+', ' ', 'g')))
    SIMILAR TO '(monteros voley club|monteros voley)';
