export function isMissingRpcError(error: unknown, functionName: string) {
  if (!error || typeof error !== "object") return false;
  const source = error as { code?: string; message?: string; details?: string };
  const text = `${source.message || ""} ${source.details || ""}`.toLowerCase();
  return source.code === "PGRST202" || text.includes(functionName.toLowerCase());
}
