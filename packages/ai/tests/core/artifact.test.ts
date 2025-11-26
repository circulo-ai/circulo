/**
 * Artifact class tests
 */

import { Artifact, ArtifactType } from '../../src/core/artifact';
import { EntityState } from '../../src/types/common';

describe('Artifact', () => {
    describe('constructor', () => {
        it('should create an artifact with valid configuration', () => {
            const artifact = new Artifact({
                name: 'Test Artifact',
                type: ArtifactType.DOCUMENT, // TEXT is not in enum, DOCUMENT is
                location: { type: 'embedded', uri: 'memory://test' },
                creatorId: 'agent-1',
                creatorType: 'agent',
            });

            expect(artifact.name).toBe('Test Artifact');
            expect(artifact.type).toBe(ArtifactType.DOCUMENT);
            expect(artifact.state).toBe(EntityState.ACTIVE);
            expect(artifact.version).toBe(1);
            expect(artifact.id).toBeDefined();
        });
    });

    describe('createVersion', () => {
        it('should create a new version', () => {
            const artifact = new Artifact({
                name: 'Test',
                type: ArtifactType.DOCUMENT,
                location: { type: 'embedded', uri: 'v1' },
                creatorId: 'agent-1',
                creatorType: 'agent',
            });

            const newVersion = artifact.createVersion({
                location: { type: 'embedded', uri: 'v2' }
            });

            expect(newVersion.location.uri).toBe('v2');
            expect(newVersion.version).toBe(2);
            expect(newVersion.parentId).toBe(artifact.id);
            expect(artifact.childIds).toContain(newVersion.id);
        });
    });

    describe('archive', () => {
        it('should archive the artifact', () => {
            const artifact = new Artifact({
                name: 'Test',
                type: ArtifactType.DOCUMENT,
                location: { type: 'embedded', uri: 'v1' },
                creatorId: 'agent-1',
                creatorType: 'agent',
            });

            artifact.archive();

            expect(artifact.state).toBe(EntityState.ARCHIVED);
        });
    });

    describe('toJSON', () => {
        it('should serialize artifact to JSON', () => {
            const artifact = new Artifact({
                name: 'Test',
                type: ArtifactType.DOCUMENT,
                location: { type: 'embedded', uri: 'v1' },
                creatorId: 'agent-1',
                creatorType: 'agent',
            });
            const json = artifact.toJSON();

            expect(json).toHaveProperty('id');
            expect(json).toHaveProperty('name');
            expect(json).toHaveProperty('type');
            expect(json).toHaveProperty('location');
            expect(json).toHaveProperty('version');
        });
    });
});
