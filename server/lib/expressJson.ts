const FIRST_NON_WHITESPACE = /^[\x20\x09\x0a\x0d]*([^\x20\x09\x0a\x0d]|$)/;

// body-parser strict mode: empty -> {}, and top-level JSON must be an object or array.
export function parseExpressJson(body: string): unknown {
  if (body.length === 0) return {};
  if (body[0] !== "{" && body[0] !== "[") {
    const first = FIRST_NON_WHITESPACE.exec(body)?.[1];
    if (first !== "{" && first !== "[") throw strictSyntaxError(body, first);
  }
  return JSON.parse(body);
}

function strictSyntaxError(body: string, char: string | undefined): SyntaxError {
  const index = char === undefined ? -1 : body.indexOf(char);
  const partial = index === -1 ? "" : body.substring(0, index) + "#".repeat(body.length - index);
  try {
    JSON.parse(partial);
    return new SyntaxError("strict violation");
  } catch (error) {
    const err = error as SyntaxError;
    const message = err.message.replace(/#+/g, (match) => body.substring(index, index + match.length));
    if (err.stack) err.stack = err.stack.replace(err.message, message);
    err.message = message;
    return err;
  }
}
