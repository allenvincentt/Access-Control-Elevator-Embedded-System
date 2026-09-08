-- =============================================================================
-- 0011  Move face embeddings from 128 to 192 dimensions
-- =============================================================================
-- The MobileFaceNet build in src/assets/models/ emits a 192-dimension embedding,
-- not the 128 assumed by 0003 and 0004. Migrations 0001-0010 were already applied
-- to this database, so editing those files only fixes fresh installs; this
-- migration brings an existing database in line.
--
-- Existing templates are deleted rather than converted. pgvector cannot widen a
-- vector(128) to vector(192) in place, and embeddings from a different model are
-- not comparable to the new ones, so keeping them would silently break matching.
-- Every enrolled staff member must be re-enrolled after this runs.
--
-- Note: the p_model_version parameter defaults on enroll_staff_face (0007) and
-- create_staff_with_face (0010) still carry the old string in this database,
-- because a parameter default can only be changed by recreating the function.
-- The app always passes p_model_version explicitly (src/services/staffService.ts),
-- so the default is unused; a fresh install gets the new value from 0007/0010.

delete from public.staff_face_templates;

alter table public.staff_face_templates
  alter column embedding type extensions.vector(192);

alter table public.staff_face_templates
  alter column model_version set default 'mobilefacenet-112x112-192d-v1';

update public.app_config
   set embedding_dimensions = 192
 where id = true;
