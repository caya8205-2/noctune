declare module 'discord-rpc' {
  export function register(clientId: string): void;

  export class Client {
    constructor(options: { transport: 'ipc' | 'websocket' });
    on(event: 'ready' | 'disconnected' | 'error', listener: (...args: any[]) => void): this;
    login(options: { clientId: string; scopes?: string[] }): Promise<void>;
    request(command: string, args?: Record<string, unknown>): Promise<void>;
    setActivity(activity: Record<string, unknown>): Promise<void>;
    clearActivity(): Promise<void>;
    destroy(): Promise<void>;
  }
}
