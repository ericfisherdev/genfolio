/**
 * A scalar subquery giving the model's tags by name as JSON, `[{id, name}]`. Links are keyed
 * by (kind, identity), not by models.id, so `alias` must expose both columns.
 */
export const modelTagsJson = (alias: string): string => `
  (SELECT json_group_array(json_object('id', t.id, 'name', t.name) ORDER BY t.name_key, t.id)
   FROM model_tag_links l JOIN model_tags t ON t.id = l.tag_id
   WHERE l.kind = ${alias}.kind AND l.identity = ${alias}.identity)`
