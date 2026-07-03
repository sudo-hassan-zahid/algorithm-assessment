export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Relay Support Operations API",
    version: "1.0.0",
    description:
      "API for customer support intake, agent decisions, and human escalation review.",
  },
  servers: [{ url: "/", description: "Current deployment" }],
  tags: [
    { name: "System" },
    { name: "Customers" },
    { name: "Requests" },
    { name: "Escalations" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Check database health",
        responses: {
          "200": {
            description: "The service and database are available",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Health" },
              },
            },
          },
          "503": {
            description: "The database is unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Health" },
              },
            },
          },
        },
      },
    },
    "/api/customers": {
      get: {
        tags: ["Customers"],
        summary: "List customers",
        responses: {
          "200": {
            description: "Customers ordered by name",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Customer" },
                },
              },
            },
          },
        },
      },
    },
    "/api/requests": {
      get: {
        tags: ["Requests"],
        summary: "List support requests",
        responses: {
          "200": {
            description: "Newest support requests first",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SupportRequest" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Requests"],
        summary: "Create and process a support request",
        description:
          "Creates the request, invokes the agent synchronously, and returns its identifier.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSupportRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Request created and processed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreatedResource" },
              },
            },
          },
          "400": {
            description: "Invalid request body",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/requests/{id}": {
      get: {
        tags: ["Requests"],
        summary: "Get a request and its complete audit trace",
        parameters: [{ $ref: "#/components/parameters/ResourceId" }],
        responses: {
          "200": {
            description:
              "Request detail, escalation, model runs, tool calls, and events",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SupportRequestDetail" },
              },
            },
          },
          "404": {
            description: "Support request not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/escalations/{id}/review": {
      post: {
        tags: ["Escalations"],
        summary: "Approve or reject an escalation",
        description:
          "Locks the escalation and executes an approved supported action exactly once.",
        parameters: [{ $ref: "#/components/parameters/ResourceId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReviewEscalation" },
            },
          },
        },
        responses: {
          "200": {
            description: "Review completed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewResult" },
              },
            },
          },
          "400": {
            description: "Invalid request body",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "404": {
            description: "Escalation not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "409": {
            description: "Escalation was already reviewed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "422": {
            description: "The proposed action cannot be executed safely",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    parameters: {
      ResourceId: {
        name: "id",
        in: "path",
        required: true,
        description: "Resource UUID",
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      Health: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["ok", "unavailable"] },
        },
      },
      Customer: {
        type: "object",
        required: ["id", "name", "email", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateSupportRequest: {
        type: "object",
        additionalProperties: false,
        required: ["customerId", "message"],
        properties: {
          customerId: { type: "string", format: "uuid" },
          message: { type: "string", minLength: 3, maxLength: 2000 },
        },
      },
      CreatedResource: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", format: "uuid" } },
      },
      SupportRequest: {
        type: "object",
        required: [
          "id",
          "message",
          "status",
          "customer",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          message: { type: "string" },
          status: { $ref: "#/components/schemas/RequestStatus" },
          decision: { type: ["string", "null"] },
          decisionReason: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          customer: { $ref: "#/components/schemas/Customer" },
          escalation: { type: ["object", "null"], additionalProperties: true },
        },
      },
      SupportRequestDetail: {
        allOf: [
          { $ref: "#/components/schemas/SupportRequest" },
          {
            type: "object",
            required: ["agentRuns", "toolCalls", "events"],
            properties: {
              agentRuns: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              toolCalls: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              events: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              refund: { type: ["object", "null"], additionalProperties: true },
            },
          },
        ],
      },
      RequestStatus: {
        type: "string",
        enum: [
          "PENDING",
          "PROCESSING",
          "AUTO_EXECUTED",
          "ESCALATED",
          "APPROVED",
          "REJECTED",
          "FAILED",
        ],
      },
      ReviewEscalation: {
        type: "object",
        additionalProperties: false,
        required: ["decision", "reviewer"],
        properties: {
          decision: { type: "string", enum: ["APPROVE", "REJECT"] },
          reviewer: { type: "string", minLength: 2, maxLength: 100 },
        },
      },
      ReviewResult: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["APPROVED", "REJECTED"] },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          code: { type: "string" },
          details: { type: "object", additionalProperties: true },
        },
      },
    },
  },
} as const;
