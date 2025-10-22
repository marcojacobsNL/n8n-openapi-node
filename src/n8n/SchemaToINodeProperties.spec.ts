import { N8NINodeProperties } from "./SchemaToINodeProperties";
import { OpenAPIV3 } from "openapi-types";

describe('N8NINodeProperties', () => {
    let n8nNodeProperties: N8NINodeProperties;
    
    beforeEach(() => {
        const mockDoc = {
            components: {
                schemas: {
                    Entity: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' }
                        }
                    },
                    Account: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            email: { type: 'string' }
                        }
                    }
                }
            }
        };
        n8nNodeProperties = new N8NINodeProperties(mockDoc);
    });

    describe('readOnly property filtering', () => {
        it('should skip properties with readOnly: true', () => {
            const requestBody: OpenAPIV3.RequestBodyObject = {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                id: {
                                    type: 'string',
                                    description: 'The unique identifier',
                                    readOnly: true,
                                    example: '161435772746940113'
                                },
                                created_at: {
                                    type: 'string',
                                    description: 'The time this was created',
                                    format: 'date-time',
                                    readOnly: true
                                },
                                content: {
                                    maxLength: 5000,
                                    minLength: 1,
                                    type: 'string',
                                    description: 'The text content',
                                    example: 'Mauris metus velit'
                                }
                            }
                        }
                    }
                }
            };

            const fields = n8nNodeProperties.fromRequestBody(requestBody);
            
            // Should only have the 'content' field, not the readOnly fields
            expect(fields).toHaveLength(1);
            expect(fields[0].name).toBe('content');
            expect(fields[0].displayName).toBe('Content');
        });

        it('should skip properties with readOnly: true in allOf schemas', () => {
            const requestBody: OpenAPIV3.RequestBodyObject = {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                company: {
                                    allOf: [
                                        {
                                            $ref: '#/components/schemas/Entity'
                                        },
                                        {
                                            readOnly: true
                                        }
                                    ],
                                    description: 'The entity on whose behalf the user made the reply'
                                },
                                account: {
                                    allOf: [
                                        {
                                            $ref: '#/components/schemas/Account'
                                        },
                                        {
                                            readOnly: true
                                        }
                                    ],
                                    description: 'The user who made the reply'
                                },
                                content: {
                                    type: 'string',
                                    description: 'The text content'
                                }
                            }
                        }
                    }
                }
            };

            const fields = n8nNodeProperties.fromRequestBody(requestBody);
            
            // Should only have the 'content' field, not the readOnly fields
            expect(fields).toHaveLength(1);
            expect(fields[0].name).toBe('content');
            expect(fields[0].displayName).toBe('Content');
        });

        it('should include properties with readOnly: false', () => {
            const requestBody: OpenAPIV3.RequestBodyObject = {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                id: {
                                    type: 'string',
                                    description: 'The unique identifier',
                                    readOnly: false
                                },
                                content: {
                                    type: 'string',
                                    description: 'The text content'
                                }
                            }
                        }
                    }
                }
            };

            const fields = n8nNodeProperties.fromRequestBody(requestBody);
            
            // Should have both fields since readOnly is false
            expect(fields).toHaveLength(2);
            expect(fields.map(f => f.name)).toContain('id');
            expect(fields.map(f => f.name)).toContain('content');
        });

        it('should include properties without readOnly property', () => {
            const requestBody: OpenAPIV3.RequestBodyObject = {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                id: {
                                    type: 'string',
                                    description: 'The unique identifier'
                                },
                                content: {
                                    type: 'string',
                                    description: 'The text content'
                                }
                            }
                        }
                    }
                }
            };

            const fields = n8nNodeProperties.fromRequestBody(requestBody);
            
            // Should have both fields since readOnly is not specified
            expect(fields).toHaveLength(2);
            expect(fields.map(f => f.name)).toContain('id');
            expect(fields.map(f => f.name)).toContain('content');
        });

        it('should skip readOnly properties in collection fields', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        readOnly: true
                    },
                    name: {
                        type: 'string'
                    },
                    email: {
                        type: 'string',
                        readOnly: true
                    }
                }
            };

            const field = n8nNodeProperties.fromSchema(schema, true); // asCollection = true
            
            expect(field.type).toBe('collection');
            expect(field.options).toHaveLength(1);
            expect(field.options![0].name).toBe('name');
        });
    });
});
