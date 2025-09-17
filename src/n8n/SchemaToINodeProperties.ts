import { OpenAPIV3 } from "openapi-types";
import { INodeProperties, NodePropertyTypes } from "n8n-workflow";
import { RefResolver } from "../openapi/RefResolver";
import * as lodash from "lodash";
import { SchemaExample } from "../openapi/SchemaExample";

type Schema = OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject;
type FromSchemaNodeProperty = Pick<INodeProperties, 'type' | 'default' | 'description' | 'options'>;

function combine(...sources: Partial<INodeProperties>[]): INodeProperties {
    const obj = lodash.defaults({}, ...sources)
    if (!obj.required) {
        // n8n does want to have required: false|null|undefined
        delete obj.required
    }
    return obj
}

/**
 * in obj find key starts with regexp
 * Return first match VALUE of the key
 */
function findKey(obj: any, regexp: RegExp): any | undefined {
    const key = Object.keys(obj).find((key) => regexp.test(key))
    return key ? obj[key] : undefined
}

/**
 * One level deep - meaning only top fields of the schema
 * The rest represent as JSON string
 */
export class N8NINodeProperties {
    private refResolver: RefResolver;
    private schemaExample: SchemaExample;

    constructor(doc: any) {
        this.refResolver = new RefResolver(doc)
        this.schemaExample = new SchemaExample(doc)
    }

    fromSchema(schema: Schema, asCollection: boolean = false): FromSchemaNodeProperty {
        schema = this.refResolver.resolve<OpenAPIV3.SchemaObject>(schema)
        let type: NodePropertyTypes;
        let defaultValue = this.schemaExample.extractExample(schema)

        // Special handling for DateFilter schemas - handled in fromSchemaProperty method
        // This method will handle regular schemas, DateFilter is handled specially in fromSchemaProperty
        if (this.refResolver.isDateFilter(schema)) {
            // Return a basic field structure that will be enhanced in fromSchemaProperty
            return {
                type: 'options',
                default: '',
                description: schema.description,
            };
        } else {
            switch (schema.type) {
                case 'boolean':
                    type = 'boolean';
                    defaultValue = defaultValue !== undefined ? defaultValue : true;
                    break;
                case 'string':
                case undefined:
                    type = 'string';
                    defaultValue = defaultValue !== undefined ? defaultValue : '';
                    break;
                case 'object':
                    if (asCollection) {
                        type = 'collection';
                    } else {
                        type = 'json';
                    }
                    defaultValue = defaultValue !== undefined ? JSON.stringify(defaultValue, null, 2) : '{}';
                    break;
                case 'array':
                    type = 'json';
                    defaultValue = defaultValue !== undefined ? JSON.stringify(defaultValue, null, 2) : '[]';
                    break;
                case 'number':
                case 'integer':
                    type = 'number';
                    defaultValue = defaultValue !== undefined ? defaultValue : 0;
                    break;
            }
        }

        const field: FromSchemaNodeProperty = {
            type: type,
            default: defaultValue,
            description: schema.description,
        };
        if (field.type === 'collection') {
            let options: INodeProperties[] = [];
            Object.entries(schema.properties!!).forEach(([key, value]) => {
                // Check if this property is a DateFilter schema
                const resolvedValue = this.refResolver.resolve<OpenAPIV3.SchemaObject>(value)
                if (this.refResolver.isDateFilter(resolvedValue)) {
                    // For DateFilter schemas, add collection field
                    const propertyDescription = (value as OpenAPIV3.SchemaObject).description
                    const dateFilterField = this.fromDateFilterProperty(key, value, propertyDescription)
                    options.push(dateFilterField)
                } else {
                    // For regular schemas, add single field
                    const fieldSchemaKeys = this.fromSchemaProperty(key, value)
                    options.push(fieldSchemaKeys)
                }
            });
            field.options = options;
        }
        if (schema.enum && schema.enum.length > 0) {
            field.type = 'options';
            field.options = schema.enum.map((value: string) => {
                return {
                    name: lodash.startCase(value),
                    value: value,
                };
            });
            field.default = field.default ? field.default : schema.enum[0];
        }
        return field;
    }

    fromParameter(parameter: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject): INodeProperties {
        parameter = this.refResolver.resolve<OpenAPIV3.ParameterObject>(parameter)
        let fieldSchemaKeys
        if (parameter.schema) {
            fieldSchemaKeys = this.fromSchema(parameter.schema!!, parameter.style === 'deepObject' || false);
        }
        if (!fieldSchemaKeys) {
            const regexp = /application\/json.*/
            const content = findKey(parameter.content, regexp)
            fieldSchemaKeys = this.fromSchema(content.schema);
        }
        if (!fieldSchemaKeys) {
            throw new Error(`Parameter schema nor content not found`)
        }
        const fieldParameterKeys: Partial<INodeProperties> = {
            displayName: lodash.startCase(parameter.name),
            name: encodeURIComponent(parameter.name.replace(/\./g, "-")),
            required: parameter.required,
            description: parameter.description,
            default: parameter.example,
        };
        const field = combine(fieldParameterKeys, fieldSchemaKeys)

        switch (parameter.in) {
            case "query":
                field.routing = {
                    send: {
                        type: 'query',
                        property: parameter.name,
                        value: '={{ $value }}',
                        propertyInDotNotation: false,
                    },
                };
                break;
            case "path" :
                field.required = true
                break
            case "header":
                field.routing = {
                    request: {
                        headers: {
                            [parameter.name]: '={{ $value }}',
                        },
                    },
                };
                break
            default:
                throw new Error(`Unknown parameter location '${parameter.in}'`);
        }
        if (!field.required) {
            delete field.required
        }
        return field
    }

    fromParameters(parameters: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[] | undefined): INodeProperties[] {
        if (!parameters) {
            return [];
        }
        const fields = [];
        for (const parameter of parameters) {
            const field = this.fromParameter(parameter)
            fields.push(field);
        }
        return fields;
    }

    fromSchemaProperty(name: string, property: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject): INodeProperties {
        const fieldSchemaKeys: FromSchemaNodeProperty = this.fromSchema(property)
        const fieldParameterKeys: Partial<INodeProperties> = {
            displayName: lodash.startCase(name),
            name: name.replace(/\./g, "-"),
        }
        const field = combine(fieldParameterKeys, fieldSchemaKeys)
        return field
    }

    fromDateFilterProperty(name: string, property: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject, description?: string): INodeProperties {
        const schema = this.refResolver.resolve<OpenAPIV3.SchemaObject>(property)

        // Create individual date-time fields as options within a collection
        const dateTimeOptions: INodeProperties[] = []
        const dateTimeFields = ['gte', 'gt', 'lte', 'lt']

        dateTimeFields.forEach(suffix => {
            const field: INodeProperties = {
                displayName: `${suffix.toUpperCase()}`,
                name: suffix,
                type: 'dateTime',
                default: '',
                description: `Greater than or equal to date for ${name}`,
            }
            dateTimeOptions.push(field)
        })

        // Note: Predefined date range options (today, yesterday, etc.) are removed
        // Only keeping the individual date-time fields (gte, gt, lte, lt)

        // Create the main collection field
        const collectionField: INodeProperties = {
            displayName: lodash.startCase(name),
            name: name.replace(/\./g, "-"),
            type: 'collection',
            default: '{}',
            description: description || schema.description || '',
            options: dateTimeOptions,
        }

        return collectionField
    }

    fromRequestBody(body: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject | undefined): INodeProperties[] {
        if (!body) {
            return [];
        }
        body = this.refResolver.resolve<OpenAPIV3.RequestBodyObject>(body)
        const regexp = /application\/json.*/
        const content = findKey(body.content, regexp)
        if (!content) {
            throw new Error(`No '${regexp}' content found`);
        }
        const requestBodySchema = content.schema!!;
        const schema = this.refResolver.resolve<OpenAPIV3.SchemaObject>(requestBodySchema)
        if (!schema.properties && schema.type != 'object' && schema.type != 'array') {
            throw new Error(`Request body schema type '${schema.type}' not supported`);
        }

        const fields = [];
        if (schema.type === "array" && schema.items) {
            const innerSchema = this.refResolver.resolve<OpenAPIV3.SchemaObject>(schema.items)
            const fieldPropertyKeys: FromSchemaNodeProperty = this.fromSchemaProperty("body", innerSchema)
            const fieldDefaults: Partial<INodeProperties> = {
                required: !!schema.required
            }
            const field = combine(fieldDefaults, fieldPropertyKeys)
            field.routing = {
                request: {
                    body: '={{ JSON.parse($value) }}'
                },
            };
            fields.push(field);
        }


        const properties = schema.properties;
        for (const key in properties) {
            const property = properties[key];
            const fieldPropertyKeys: FromSchemaNodeProperty = this.fromSchemaProperty(key, property)
            const fieldDefaults: Partial<INodeProperties> = {
                required: schema.required && schema.required?.includes(key),
            }
            const field = combine(fieldDefaults, fieldPropertyKeys)
            if (field.type === 'json') {
                field.routing = {
                    send: {
                        "property": key,
                        "propertyInDotNotation": false,
                        "type": "body",
                        "value": '={{ JSON.parse($value) }}'
                    },
                };
            } else {
                field.routing = {
                    send: {
                        "property": key,
                        "propertyInDotNotation": false,
                        "type": "body",
                        "value": '={{ $value }}'
                    },
                };
            }
            fields.push(field);
        }
        return fields;
    }
}
