import type { Migration } from './migration'

export const promptSearchMigration: Migration = {
  version: 5,
  name: 'prompt full-text index and search indexes',
  // External-content FTS5 over generations, kept in step by the triggers SQLite documents
  // for external content (fts5content.test); 'rebuild' indexes rows already stored.
  // remove_diacritics 2 lets `cafe` find `café`.
  sql: `
    CREATE VIRTUAL TABLE prompt_fts USING fts5(
      prompt,
      negative_prompt,
      content = 'generations',
      content_rowid = 'image_id',
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER generations_fts_insert AFTER INSERT ON generations BEGIN
      INSERT INTO prompt_fts (rowid, prompt, negative_prompt)
      VALUES (new.image_id, new.prompt, new.negative_prompt);
    END;

    CREATE TRIGGER generations_fts_delete AFTER DELETE ON generations BEGIN
      INSERT INTO prompt_fts (prompt_fts, rowid, prompt, negative_prompt)
      VALUES ('delete', old.image_id, old.prompt, old.negative_prompt);
    END;

    CREATE TRIGGER generations_fts_update AFTER UPDATE ON generations BEGIN
      INSERT INTO prompt_fts (prompt_fts, rowid, prompt, negative_prompt)
      VALUES ('delete', old.image_id, old.prompt, old.negative_prompt);
      INSERT INTO prompt_fts (rowid, prompt, negative_prompt)
      VALUES (new.image_id, new.prompt, new.negative_prompt);
    END;

    INSERT INTO prompt_fts (prompt_fts) VALUES ('rebuild');

    CREATE INDEX generations_prompt ON generations(prompt);
    CREATE INDEX generations_generator ON generations(generator);
    CREATE INDEX generation_loras_model_weight ON generation_loras(model_id, weight);
    DROP INDEX generation_loras_model;
  `
}
