import { N8NPropertiesBuilder } from "./N8NPropertiesBuilder";

import { OpenAPIV3 } from "openapi-types";
import { OperationContext } from "./openapi/OpenAPIVisitor";
import * as lodash from "lodash";
import { DefaultOperationParser } from "./OperationParser";
import { DefaultResourceParser } from "./ResourceParser";

export class CustomOperationParser extends DefaultOperationParser {
  name(
    operation: OpenAPIV3.OperationObject,
    context: OperationContext
  ): string {
    let operationId: string = operation
      .operationId!!.split("_")
      .slice(1)
      .join("_");
    if (!operationId) {
      operationId = operation.operationId as string;
    }
    return lodash.startCase(operationId);
  }

  value(
    operation: OpenAPIV3.OperationObject,
    context: OperationContext
  ): string {
    return this.name(operation, context);
  }

  action(
    operation: OpenAPIV3.OperationObject,
    context: OperationContext
  ): string {
    return operation.summary || this.name(operation, context);
  }

  description(
    operation: OpenAPIV3.OperationObject,
    context: OperationContext
  ): string {
    return operation.description || operation.summary || "";
  }
}

export class CustomResourceParser extends DefaultResourceParser {
  value(tag: OpenAPIV3.TagObject): string {
    return lodash.startCase(tag.name.replace(/[^a-zA-Z0-9_-]/g, ""));
  }
}

test("query param - schema deepObject", () => {
  const paths = {
    "/api/issues": {
      get: {
        operationId: "IssueController_list",
        summary: "Get issues",
        parameters: [
          {
            name: "filter",
            style: "deepObject",
            in: "query",
            example: false,
            description: "Filter issues",
            schema: {
              $ref: "#/components/schemas/Issue",
            },
          },
        ],
        tags: ["🖥️ Issue"],
      },
    },
  };

  const components = {
    schemas: {
      DateFilter: {
        "oneOf": [
            {
              "type": "object",
              "description": "A custom date range.",
              "properties": {
                "gte": {
                  "type": "string",
                  "description": "Greater or equal than this date",
                  "format": "date-time"
                },
                "gt": {
                  "type": "string",
                  "description": "Greater than this date",
                  "format": "date-time"
                },
                "lte": {
                  "type": "string",
                  "description": "Less than or equal to this date",
                  "format": "date-time"
                },
                "lt": {
                  "type": "string",
                  "description": "Less than this date",
                  "format": "date-time"
                }
              }
            },
          {
            "type": "string",
            "description": "A predefined date range to filter on",
            "enum": [
              "today",
              "yesterday",
              "this_week",
              "previous_week",
              "this_month",
              "previous_month",
              "last_three_months",
              "last_six_months",
              "last_12_months",
              "this_year",
              "previous_year"
            ]
          }
        ]
      },
      Issue: {
        type: "object",
        properties: {
          my_issues: {
            type: "boolean",
            description:
              "If `true`, filters on issues reported OR assigned by the current authenticated account.",
          },
          category: {
            type: "string",
            description: "The id of the issue category",
            example: "471435772747123997",
          },
          status: {
            type: "string",
            description: "The status of the issue",
            enum: ["open", "inprogress", "resolved", "closed"],
          },
          created_at: {
            description: "Filter on the creation date of the issue",
            $ref: "#/components/schemas/DateFilter"
          },
        },
      },
    },
  };

  const parser = new N8NPropertiesBuilder(
    { paths, components },
    {
      operation: new CustomOperationParser(),
      resource: new CustomResourceParser(),
    }
  );
  const result = parser.build();

  expect(result).toEqual([
    {
      default: "",
      displayName: "Resource",
      name: "resource",
      noDataExpression: true,
      options: [
        {
          description: "",
          name: "🖥️ Issue",
          value: "Issue",
        },
      ],
      type: "options",
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      noDataExpression: true,
      displayOptions: {
        show: {
          resource: ["Issue"],
        },
      },
      options: [
        {
          name: "List",
          value: "List",
          action: "Get issues",
          description: "Get issues",
          routing: {
            request: {
              method: "GET",
              url: "=/api/issues",
            },
          },
        },
      ],
      // eslint-disable-next-line
      default: "",
    },
    {
      displayName: "GET /api/issues",
      default: "",
      displayOptions: {
        show: {
          operation: ["List"],
          resource: ["Issue"],
        },
      },
      name: "operation",
      type: "notice",
      typeOptions: {
        theme: "info",
      },
    },
    {
      displayName: "Filter",
      name: "filter",
      type: "collection",
      displayOptions: {
        show: {
          resource: ["Issue"],
          operation: ["List"],
        },
      },
      default: false,
      description: "Filter issues",
      routing: {
        send: {
          property: "filter",
          propertyInDotNotation: false,
          type: "query",
          value: "={{ $value }}",
        },
      },
      options: [
        {
          default: true,
          description: "If `true`, filters on issues reported OR assigned by the current authenticated account.",
          displayName: "My Issues",
          name: "my_issues",
          type: "boolean",
        },
        {
          default: "471435772747123997",
          description: "The id of the issue category",
          displayName: "Category",
          name: "category",
          type: "string",
        },
        {
          default: "open",
          description: "The status of the issue",
          displayName: "Status",
          name: "status",
          options: [
            {
              name: "Open",
              value: "open",
            },
            {
              name: "Inprogress",
              value: "inprogress",
            },
            {
              name: "Resolved",
              value: "resolved",
            },
            {
              name: "Closed",
              value: "closed",
            },
          ],
          type: "options",
        },
        {
          default: "today",
          description: "Filter on the creation date of the issue",
          displayName: "Created At",
          name: "created_at",
          options: [
            {
              name: "Today",
              value: "today",
            },
            {
              name: "Yesterday",
              value: "yesterday",
            },
            {
              name: "This Week",
              value: "this_week",
            },
            {
              name: "Previous Week",
              value: "previous_week",
            },
            {
              name: "This Month",
              value: "this_month",
            },
            {
              name: "Previous Month",
              value: "previous_month",
            },
            {
              name: "Last Three Months",
              value: "last_three_months",
            },
            {
              name: "Last Six Months",
              value: "last_six_months",
            },
            {
              name: "Last 12 Months",
              value: "last_12_months",
            },
            {
              name: "This Year",
              value: "this_year",
            },
            {
              name: "Previous Year",
              value: "previous_year",
            },
          ],
          type: "options",
        },
        {
          default: "",
          description: "Greater than or equal to date for created_at",
          displayName: "Created At GTE",
          name: "created_at_gte",
          type: "dateTime",
        },
        {
          default: "",
          description: "Greater than or equal to date for created_at",
          displayName: "Created At GT",
          name: "created_at_gt",
          type: "dateTime",
        },
        {
          default: "",
          description: "Greater than or equal to date for created_at",
          displayName: "Created At LTE",
          name: "created_at_lte",
          type: "dateTime",
        },
        {
          default: "",
          description: "Greater than or equal to date for created_at",
          displayName: "Created At LT",
          name: "created_at_lt",
          type: "dateTime",
        },
      ],
    },
  ]);
});