/**
 * Jest setup file
 */

// Extend Jest matchers if needed
expect.extend({
    toBeValidId(received: string) {
        const pass = typeof received === 'string' && received.length > 0;
        return {
            message: () => `expected ${received} to be a valid ID`,
            pass,
        };
    },
});

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
