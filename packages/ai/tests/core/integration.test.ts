/**
 * Integration class tests
 */

import { Integration, IntegrationType } from '../../src/core/integration';
import { EntityState } from '../../src/types/common';
import { createTestIntegration } from '../helpers';

describe('Integration', () => {
    describe('constructor', () => {
        it('should create an integration with valid configuration', () => {
            const integration = createTestIntegration();

            expect(integration.name).toBe('Test Integration');
            expect(integration.type).toBe(IntegrationType.API);
            expect(integration.state).toBe(EntityState.ACTIVE);
            expect(integration.toolIds).toEqual([]);
            expect(integration.id).toBeDefined();
        });

        it('should initialize with settings if provided', () => {
            const integration = createTestIntegration({
                settings: { baseUrl: 'https://api.example.com' },
            });

            expect(integration.settings).toEqual({ baseUrl: 'https://api.example.com' });
        });

        it('should initialize with credentials if provided', () => {
            // Note: credentials are private, but we can verify they don't throw
            const integration = new Integration({
                name: 'Test',
                type: IntegrationType.API,
                credentials: { apiKey: 'secret' },
            });

            expect(integration).toBeDefined();
        });
    });

    describe('addTool', () => {
        it('should add a tool ID to the integration', () => {
            const integration = createTestIntegration();
            const toolId = 'tool-123';

            integration.addTool(toolId);

            expect(integration.toolIds).toContain(toolId);
        });

        it('should not add duplicate tool IDs', () => {
            const integration = createTestIntegration();
            const toolId = 'tool-123';

            integration.addTool(toolId);
            integration.addTool(toolId);

            expect(integration.toolIds).toEqual([toolId]);
        });
    });

    describe('removeTool', () => {
        it('should remove a tool ID from the integration', () => {
            const integration = createTestIntegration();
            const toolId = 'tool-123';

            integration.addTool(toolId);
            integration.removeTool(toolId);

            expect(integration.toolIds).not.toContain(toolId);
        });
    });

    describe('pause and activate', () => {
        it('should pause an active integration', () => {
            const integration = createTestIntegration();

            integration.pause();

            expect(integration.state).toBe(EntityState.PAUSED);
        });

        it('should activate a paused integration', () => {
            const integration = createTestIntegration();

            integration.pause();
            integration.activate();

            expect(integration.state).toBe(EntityState.ACTIVE);
        });
    });

    describe('toJSON', () => {
        it('should serialize integration to JSON', () => {
            const integration = createTestIntegration({
                settings: { key: 'value' },
            });
            const json = integration.toJSON();

            expect(json).toHaveProperty('id');
            expect(json).toHaveProperty('name');
            expect(json).toHaveProperty('type');
            expect(json).toHaveProperty('state');
            expect(json).toHaveProperty('settings');
            expect(json).toHaveProperty('toolIds');
        });

        it('should NOT include credentials in JSON', () => {
            const integration = new Integration({
                name: 'Test',
                type: IntegrationType.API,
                credentials: { apiKey: 'secret-key' },
            });

            const json = integration.toJSON() as any;

            expect(json.credentials).toBeUndefined();
        });
    });
});
