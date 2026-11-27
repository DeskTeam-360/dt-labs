-- Gives the checklist items of the existing templates their automatic source, matched by the name of the item.
-- Only items that have no source yet are touched; items that can find a problem also get a second status "Problem found".
-- Safe to run as postgres or dtlabs, and safe to run twice.

UPDATE maintenance_template_items SET source = 'spam_comments'    WHERE source IS NULL AND label ILIKE '%spam comment%';
UPDATE maintenance_template_items SET source = 'spam_forms'       WHERE source IS NULL AND label ILIKE '%spam form%';
UPDATE maintenance_template_items SET source = 'dummy_user'       WHERE source IS NULL AND label ILIKE '%dummy user%';
UPDATE maintenance_template_items SET source = 'gravatar_off'     WHERE source IS NULL AND label ILIKE '%gravatar%';
UPDATE maintenance_template_items SET source = 'uploads_code_exec' WHERE source IS NULL AND label ILIKE '%code execution%uploads%';
UPDATE maintenance_template_items SET source = 'file_manager'     WHERE source IS NULL AND label ILIKE '%file manager%';

UPDATE maintenance_template_items
   SET options = array_append(options, 'Problem found')
 WHERE source IN ('spam_comments', 'spam_forms', 'dummy_user', 'gravatar_off', 'uploads_code_exec', 'file_manager')
   AND coalesce(array_length(options, 1), 0) = 1;
