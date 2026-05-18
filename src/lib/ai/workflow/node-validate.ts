import { Edge } from "@xyflow/react";
import { JSONSchema7 } from "json-schema";
import {
  ConditionNodeData,
  OutputNodeData,
  LLMNodeData,
  NodeKind,
  InputNodeData,
  UINode,
  WorkflowNodeData,
  ToolNodeData,
  HttpNodeData,
  TemplateNodeData,
} from "lib/ai/workflow/workflow.interface";
import { cleanVariableName } from "lib/utils";
import { safe } from "ts-safe";
import { findJsonSchemaByPath } from "./shared.workflow";
import { ConditionBranch } from "./condition";

export function validateSchema(key: string, schema: JSONSchema7) {
  const variableName = cleanVariableName(key);
  if (variableName.length === 0) {
    throw new Error("Validation.invalidVariableName");
  }
  if (variableName.length > 255) {
    throw new Error("Validation.variableNameTooLong");
  }
  if (!schema.type) {
    throw new Error("Validation.invalidSchema");
  }
  if (schema.type == "array" || schema.type == "object") {
    const keys = Array.from(Object.keys(schema.properties ?? {}));
    if (keys.length != new Set(keys).size) {
      throw new Error("Validation.uniqueKeysRequired");
    }
    return keys.every((key) => {
      return validateSchema(key, schema.properties![key] as JSONSchema7);
    });
  }
  return true;
}

type NodeValidate<T> = (context: {
  node: T;
  nodes: UINode[];
  edges: Edge[];
  t: (key: string, params?: any) => string;
}) => void;

export function allNodeValidate({
  nodes,
  edges,
  t,
}: {
  nodes: UINode[];
  edges: Edge[];
  t: (key: string, params?: any) => string;
}):
  | true
  | {
      node?: UINode;
      errorMessage: string;
    } {
  if (!nodes.some((n) => n.data.kind === NodeKind.Input)) {
    return {
      errorMessage: t("Validation.inputNodeRequired"),
    };
  }
  if (!nodes.some((n) => n.data.kind === NodeKind.Output)) {
    return {
      errorMessage: t("Validation.outputNodeRequired"),
    };
  }

  for (const node of nodes) {
    const result = safe()
      .ifOk(() => nodeValidate({ node: node.data, nodes, edges, t }))
      .ifFail((err) => {
        return {
          node,
          errorMessage: t(err.message as any),
        };
      })
      .unwrap();
    if (result) {
      return result;
    }
  }
  return true;
}

export const nodeValidate: NodeValidate<WorkflowNodeData> = ({
  node,
  nodes,
  edges,
  t,
}) => {
  if (
    node.kind != NodeKind.Note &&
    nodes.filter((n) => n.data.name === node.name).length > 1
  ) {
    throw new Error("Validation.duplicateNodeName");
  }
  switch (node.kind) {
    case NodeKind.Input:
      return inputNodeValidate({ node, nodes, edges, t });
    case NodeKind.Output:
      return outputNodeValidate({ node, nodes, edges, t });
    case NodeKind.LLM:
      return llmNodeValidate({ node, nodes, edges, t });
    case NodeKind.Condition:
      return conditionNodeValidate({ node, nodes, edges, t });
    case NodeKind.Tool:
      return toolNodeValidate({ node, nodes, edges, t });
    case NodeKind.Http:
      return httpNodeValidate({ node, nodes, edges, t });
    case NodeKind.Template:
      return templateNodeValidate({ node, nodes, edges, t });
  }
};

export const inputNodeValidate: NodeValidate<InputNodeData> = ({
  node,
  edges,
}) => {
  if (!edges.some((e) => e.source === node.id)) {
    throw new Error("Validation.edgeRequired");
  }
  const outputKeys = Array.from(
    Object.keys(node.outputSchema.properties ?? {}),
  );

  outputKeys.forEach((key) => {
    validateSchema(key, node.outputSchema.properties![key] as JSONSchema7);
  });
};

export const outputNodeValidate: NodeValidate<OutputNodeData> = ({
  node,
  nodes,
  edges,
}) => {
  const names = node.outputData.map((data) => data.key);
  const uniqueNames = [...new Set(names)];
  if (names.length !== uniqueNames.length) {
    throw new Error("Validation.uniqueKeysRequired");
  }
  node.outputData.forEach((data) => {
    const variableName = cleanVariableName(data.key);
    if (variableName.length === 0) {
      throw new Error("Validation.invalidVariableName");
    }
    if (variableName.length > 255) {
      throw new Error("Validation.variableNameTooLong");
    }
    if (!data.source) throw new Error("Validation.sourceRequired");
    if (data.source.path.length === 0) throw new Error("Validation.pathRequired");
    const sourceNode = nodes.find((n) => n.data.id === data.source?.nodeId);
    if (!sourceNode) throw new Error("Validation.sourceNodeNotFound");
    const sourceSchema = findJsonSchemaByPath(
      sourceNode.data.outputSchema,
      data.source.path,
    );
    if (!sourceSchema) throw new Error("Validation.sourceSchemaNotFound");
  });

  let current: WorkflowNodeData | undefined = node as WorkflowNodeData;
  while (current && current.kind !== NodeKind.Input) {
    const prevNodeId = edges.find((e) => e.target === current!.id)?.source;
    if (!prevNodeId) throw new Error("Validation.prevEdgeRequired");
    const prevNode = nodes.find((n) => n.data.id === prevNodeId);
    if (!prevNode) current = undefined;
    else current = prevNode.data as WorkflowNodeData;
  }

  if (current?.kind !== NodeKind.Input)
    throw new Error("Validation.prevInputNodeRequired");
};

export const llmNodeValidate: NodeValidate<LLMNodeData> = ({ node }) => {
  if (!node.model) throw new Error("Validation.modelRequired");
  node.messages.map((message) => {
    if (!message.role) throw new Error("Validation.roleRequired");
    if (!message.content) throw new Error("Validation.contentRequired");
  });
  if (node.messages.length === 0)
    throw new Error("Validation.messageRequired");
};

export const conditionNodeValidate: NodeValidate<ConditionNodeData> = ({
  node,
}) => {
  const branchValidate = (branch: ConditionBranch) => {
    branch.conditions.forEach((condition) => {
      if (!condition.operator)
        throw new Error("Validation.operatorRequired");
      if (!condition.source) throw new Error("Validation.valueRequired");
    });
  };
  [node.branches.if, ...(node.branches.elseIf ?? [])].forEach(branchValidate);
};

export const toolNodeValidate: NodeValidate<ToolNodeData> = ({ node }) => {
  if (!node.tool) throw new Error("Validation.toolRequired");
  if (!node.model) throw new Error("Validation.modelRequired");
  if (!node.message) throw new Error("Validation.messageRequired");
};

export const httpNodeValidate: NodeValidate<HttpNodeData> = ({ node, t }) => {
  // Validate URL is provided (can be empty string, but must be defined)
  if (node.url === undefined) {
    throw new Error("Validation.urlRequired");
  }

  // Validate HTTP method
  const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"];
  if (!validMethods.includes(node.method)) {
    throw new Error("Validation.invalidMethod");
  }

  // Validate timeout if provided
  if (node.timeout !== undefined) {
    if (typeof node.timeout !== "number" || node.timeout <= 0) {
      throw new Error("Validation.invalidTimeout");
    }
    if (node.timeout > 300000) {
      // 5 minutes max
      throw new Error("Validation.timeoutExceeded");
    }
  }

  // Validate headers format
  if (node.headers) {
    for (const header of node.headers) {
      if (!header.key || header.key.trim().length === 0) {
        throw new Error("Validation.emptyHeaderKey");
      }
      // Check for duplicate header keys (case insensitive)
      const lowerKey = header.key.toLowerCase();
      const duplicates = node.headers.filter(
        (h) => h.key.toLowerCase() === lowerKey,
      );
      if (duplicates.length > 1) {
        throw new Error(t("Validation.duplicateHeaderKey", { key: header.key }));
      }
    }
  }

  // Validate query parameters format
  if (node.query) {
    for (const queryParam of node.query) {
      if (!queryParam.key || queryParam.key.trim().length === 0) {
        throw new Error("Validation.emptyQueryKey");
      }
    }
  }

  // Validate body is only used with appropriate methods
  if (
    node.body !== undefined &&
    !["POST", "PUT", "PATCH"].includes(node.method)
  ) {
    throw new Error(t("Validation.bodyNotAllowed", { method: node.method }));
  }
};

export const templateNodeValidate: NodeValidate<TemplateNodeData> = ({
  node,
}) => {
  // Validate template type
  const validTypes = ["tiptap"]; // Future: add "handlebars"
  if (!validTypes.includes(node.template.type)) {
    throw new Error("Validation.invalidTemplateType");
  }

  // Template content can be undefined/empty - that's valid
  // The actual content validation is handled by the TipTap editor
};
