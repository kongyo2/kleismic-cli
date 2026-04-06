declare module 'ws' {
	type WebSocketOptions = {
		headers?: Record<string, string>;
	};

	class WebSocket {
		constructor(url: string, options?: WebSocketOptions);
		on(event: 'open', listener: () => void): this;
		on(event: 'error', listener: (error: Error) => void): this;
		on(event: 'close', listener: (code: number) => void): this;
		send(data: string): void;
		close(): void;
	}

	export default WebSocket;
}
