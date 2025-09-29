// render-email.ts
// Dependencies (install):
//   npm i react react-dom @react-email/render esbuild
//   npm i -D @types/react @types/react-dom
import React, { ComponentType } from "react";
import { render as renderEmail } from "@react-email/render";
import * as esbuild from "esbuild";

export type RenderOptions = {
  /** Prettify the output HTML for readability (not required for sending). */
  pretty?: boolean;
  /** Also produce a plain-text version (useful for SES/SparkPost/etc.). */
  includeText?: boolean;
};

export type RenderResult = {
  html: string;
  /** Only present when includeText=true. */
  text?: string;
};

/**
 * A) Render from an imported React component (preferred, safest).
 */
export async function renderComponentToHtml<Props>(
  Component: ComponentType<Props>,
  props: Props,
  options?: RenderOptions
): Promise<RenderResult> {
  const element = React.createElement(Component as unknown as ComponentType<any>, props as any);
  const html = await renderEmail(element as any, { pretty: !!options?.pretty });
  const text = options?.includeText
    ? await renderEmail(element as any, { plainText: true })
    : undefined;

  return { html, text };
}

/**
 * B) Render from a raw JSX/TSX source string.
 * - Transpiles the code to CJS in-memory with esbuild.
 * - Evaluates it in-process and extracts the component export.
 * - Renders to HTML with @react-email/render.
 *
 * SECURITY NOTE: Only use this with trusted template code.
 */
export async function renderJsxStringToHtml(
  jsxOrTsxSource: string,
  opts: {
    /** Name of the export to render. Defaults to 'default'. */
    exportName?: string;
    /** Props to pass into the component. */
    props?: Record<string, unknown>;
    /** Render options (pretty HTML, plain text). */
    renderOptions?: RenderOptions;
    /**
     * Optional pre-bundle banner. By default we inject:
     *   const React = require("react");
     * so JSX can compile in CJS without extra config.
     */
    banner?: string;
  } = {}
): Promise<RenderResult> {
  const {
    exportName = "default",
    props = {},
    renderOptions,
    banner = 'const React = require("react");',
  } = opts;

  // 1) Transpile JSX/TSX to CommonJS so we can eval safely with require().
  const transformed = await esbuild.transform(jsxOrTsxSource, {
    loader: "tsx",
    format: "cjs",
    target: "node18",
    sourcemap: "inline",
    banner,
  });

  // 2) Evaluate the resulting CJS module in the current process.
  //    This uses Node's Function constructor to simulate CommonJS.
  //    Provide a real "require" so user components can import shared libs (react, @react-email/components, etc.).
  //    IMPORTANT: Only do this for trusted code.
  const moduleExports: Record<string, any> = {};
  const moduleObj = { exports: moduleExports } as { exports: Record<string, any> };
  const __filename = "virtual-template.js";
  const __dirname = process.cwd();

  // Create a require function for the compiled code
  const mockRequire = (id: string) => {
    if (id === 'react') return React;
    throw new Error(`Module ${id} not found`);
  };

  // eslint-disable-next-line no-new-func
  const fn = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    transformed.code
  );

  fn(moduleObj.exports, mockRequire, moduleObj as any, __filename, __dirname);

  const Component =
    exportName === "default"
      ? moduleObj.exports?.default
      : moduleObj.exports?.[exportName];

  if (!Component) {
    const available = Object.keys(moduleObj.exports || {}).join(", ") || "(none)";
    throw new Error(
      `React email component export "${exportName}" not found. Available exports: ${available}`
    );
  }

  // 3) Render to HTML (and optional plain-text).
  return await renderComponentToHtml(Component as ComponentType<any>, props, renderOptions);
}


/* -------------------------------------------
   Example usage:

// A) From an imported component:
import WelcomeEmail from "./emails/WelcomeEmail"; // default export
const { html, text } = await renderComponentToHtml(WelcomeEmail, { firstName: "Omar" }, { pretty: true, includeText: true });

// B) From a raw JSX string (e.g., read from S3):
const source = `
  import { Html, Head, Preview, Body, Container, Text } from "@react-email/components";
  export default function WelcomeEmail({ firstName = "friend" }) {
    return (
      <Html>
        <Head />
        <Preview>Welcome to ICSD!</Preview>
        <Body style={{ backgroundColor: "#fff" }}>
          <Container>
            <Text style={{ fontFamily: "Arial", fontSize: 16 }}>
              Assalamu alaikum, {firstName} — welcome aboard!
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }
`;
const { html, text } = await renderJsxStringToHtml(source, {
  props: { firstName: "Omar" },
  renderOptions: { pretty: true, includeText: true },
});
------------------------------------------- */
