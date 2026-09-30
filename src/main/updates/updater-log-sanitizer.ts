/** A token that is a file path: it starts with `/` or `~`, optionally after a bracket or quote. */
const PATH_TOKEN = /^[("'`]?[/~][^\s]*/
const URL_TOKEN = /^[("'`]?https?:\/\//i

/**
 * electron-updater's log lines for Genfolio's log file: the first line only (errors come with
 * their stack and the response headers), with file paths replaced by `<path>`. Genfolio's logs
 * hold no paths, since they can name the user's folders; URLs are kept, they name the feed.
 */
export function sanitizeUpdaterLog(message: string): string {
  const line = message.split('\n', 1)[0]?.trim() ?? ''
  return line
    .split(' ')
    .map((token) => (URL_TOKEN.test(token) || !PATH_TOKEN.test(token) ? token : '<path>'))
    .join(' ')
}
