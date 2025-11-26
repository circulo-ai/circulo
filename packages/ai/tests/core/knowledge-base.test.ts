/**
 * KnowledgeBase class tests
 */

import { KnowledgeBase, DocumentType, InMemoryKnowledgeBaseDriver } from '../../src/core/knowledge-base';
import { EntityState } from '../../src/types/common';

describe('KnowledgeBase', () => {
    let kb: KnowledgeBase;

    beforeEach(async () => {
        kb = new KnowledgeBase({
            name: 'Test KB',
            description: 'A test knowledge base',
            driver: new InMemoryKnowledgeBaseDriver(),
        });
        await kb.initialize();
    });

    describe('constructor', () => {
        it('should create a knowledge base with valid configuration', () => {
            expect(kb.name).toBe('Test KB');
            expect(kb.description).toBe('A test knowledge base');
            expect(kb.state).toBe(EntityState.ACTIVE);
            expect(kb.id).toBeDefined();
        });
    });

    describe('addDocument', () => {
        it('should add a document to the knowledge base', async () => {
            const docId = await kb.addDocument({
                title: 'Test Doc',
                content: 'This is a test document',
                type: DocumentType.TEXT,
            });

            expect(docId).toBeDefined();

            const retrieved = await kb.getDocument(docId);
            expect(retrieved).toBeDefined();
            expect(retrieved?.title).toBe('Test Doc');
        });
    });

    describe('searchByText', () => {
        it('should search for documents', async () => {
            await kb.addDocument({
                title: 'React Guide',
                content: 'React is a JavaScript library for building user interfaces.',
                type: DocumentType.TEXT,
            });

            await kb.addDocument({
                title: 'Angular Guide',
                content: 'Angular is a platform for building mobile and desktop web applications.',
                type: DocumentType.TEXT,
            });

            const results = await kb.searchByText('React', 5);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].content).toContain('React');
        });
    });

    describe('deleteDocument', () => {
        it('should delete a document', async () => {
            const docId = await kb.addDocument({
                title: 'To Delete',
                content: 'Delete me',
                type: DocumentType.TEXT,
            });

            await kb.deleteDocument(docId);
            const results = await kb.searchByText('Delete', 5);

            expect(results).toHaveLength(0);
        });
    });

    describe('toJSON', () => {
        it('should serialize knowledge base to JSON', () => {
            const json = kb.toJSON();

            expect(json).toHaveProperty('id');
            expect(json).toHaveProperty('name');
            expect(json).toHaveProperty('description');
            expect(json).toHaveProperty('state');
        });
    });
});
