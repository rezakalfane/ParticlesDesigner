/** Small scalar expression language for generated geometry. Never evaluates JS or raw GLSL. */
export type CustomGeometry = { x: string; y: string; z: string };
export const CUSTOM_FORMATION = 30;
export const DEFAULT_GEOMETRY: CustomGeometry = {
  x: "2 * sqrt(1 - (2*b-1)*(2*b-1)) * cos(a*tau)",
  y: "2 * (2*b-1)",
  z: "2 * sqrt(1 - (2*b-1)*(2*b-1)) * sin(a*tau)",
};
const arities: Record<string, number> = {
  sin: 1,
  cos: 1,
  abs: 1,
  sqrt: 1,
  floor: 1,
  fract: 1,
  exp: 1,
  tanh: 1,
  min: 2,
  max: 2,
  pow: 2,
  atan: 2,
  mix: 3,
  clamp: 3,
  smoothstep: 3,
};
export function compileExpression(source: string): string {
  if (typeof source !== "string" || source.length > 600)
    throw new Error("Shape expression is too long.");
  const tokens =
    source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[()+*/,-]|\S/g) ??
    [];
  if (tokens.length > 160) throw new Error("Shape expression is too complex.");
  let at = 0,
    depth = 0;
  function atom(): string {
    if (++depth > 24) throw new Error("Shape expression is too deeply nested.");
    const token = tokens[at++];
    let result: string;
    if (token === "-" || token === "+") result = `(${token}${atom()})`;
    else if (token === "(") {
      result = expression();
      if (tokens[at++] !== ")") throw new Error("Missing parenthesis.");
    } else if (/^(?:\d|\.\d)/.test(token ?? "")) {
      const n = Number(token);
      if (!Number.isFinite(n) || Math.abs(n) > 1000)
        throw new Error("Shape constant is out of range.");
      result = Number.isInteger(n) ? `${n}.0` : String(n);
    } else if (["a", "b", "c", "t", "pi", "tau"].includes(token))
      result = token === "pi" ? "3.14159265" : token === "tau" ? "6.2831853" : token;
    else if (Object.hasOwn(arities, token)) {
      if (tokens[at++] !== "(") throw new Error("Expected function arguments.");
      const args: string[] = [];
      for (let i = 0; i < arities[token]; i++) {
        if (i && tokens[at++] !== ",") throw new Error("Invalid argument count.");
        args.push(expression());
      }
      if (tokens[at++] !== ")") throw new Error("Invalid argument count.");
      result =
        token === "sqrt"
          ? `sqrt(abs(${args[0]}))`
          : token === "pow"
            ? `pow(max(abs(${args[0]}),0.0001),clamp(${args[1]},-8.0,8.0))`
            : token === "exp"
              ? `exp(clamp(${args[0]},-8.0,8.0))`
              : `${token}(${args.join(",")})`;
    } else throw new Error("Unsupported shape expression token.");
    depth--;
    return result;
  }
  function product(): string {
    let left = atom();
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++],
        right = atom();
      left = op === "/" ? `shapeDivide(${left},${right})` : `(${left}*${right})`;
    }
    return left;
  }
  function expression(): string {
    let left = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++];
      left = `(${left}${op}${product()})`;
    }
    return left;
  }
  const result = expression();
  if (at !== tokens.length) throw new Error("Unexpected shape expression suffix.");
  return result;
}
export function parseGeometry(raw: unknown): CustomGeometry {
  if (!raw || typeof raw !== "object") throw new Error("Invalid custom geometry.");
  const g = raw as CustomGeometry;
  for (const key of ["x", "y", "z"] as const) compileExpression(g[key]);
  return { x: g.x, y: g.y, z: g.z };
}
export function geometryGLSL(g: CustomGeometry): string {
  return `clamp(vec3(${compileExpression(g.x)},${compileExpression(g.y)},${compileExpression(g.z)}),vec3(-8.0),vec3(8.0))`;
}
