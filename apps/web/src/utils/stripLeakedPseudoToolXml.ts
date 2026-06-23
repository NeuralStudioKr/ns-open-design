/** Remove CLI-style pseudo-tool XML leaked into chat text (#313). */
export function stripLeakedPseudoToolXml(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/<function_calls\b[^>]*>[\s\S]*?<\/function_calls>/gi, "");
  out = out.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "");
  out = out.replace(/<todo-list\b[^>]*>[\s\S]*?<\/todo-list>/gi, "");
  out = out.replace(/<tool-call\b[^>]*>[\s\S]*?<\/tool-call>/gi, "");
  return out;
}
