// In-memory circular buffer for recent HTTP request logs

export interface RequestLogEntry {
  id: number;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
  error?: string;
}

const MAX_ENTRIES = 200;
const buffer: RequestLogEntry[] = [];
let nextId = 1;

export function addRequestLog(entry: Omit<RequestLogEntry, 'id'>): void {
  buffer.push({ ...entry, id: nextId++ });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

export function getRequestLog(limit = 100): RequestLogEntry[] {
  return buffer.slice(-limit).reverse();
}

export function clearRequestLog(): void {
  buffer.length = 0;
}
