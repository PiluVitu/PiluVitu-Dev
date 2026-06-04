import { Document, Scalar, parse as yamlParse } from 'yaml'
import type { CollectionDef } from './content-registry'

export function serializeEntry<T extends Record<string, unknown>>(
  def: CollectionDef<T>,
  data: T,
): string {
  const doc = new Document({})
  doc.contents = doc.createNode({}) as never
  for (const key of def.keyOrder) {
    const value = data[key]
    const node = doc.createNode(value)
    if (
      def.multiline.includes(key) &&
      typeof value === 'string' &&
      value.length > 0
    ) {
      ;(node as Scalar).type = Scalar.BLOCK_LITERAL
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(doc.contents as any).set(key, node)
  }
  return doc.toString({ lineWidth: 80 })
}

export function parseEntry<T extends Record<string, unknown>>(
  def: CollectionDef<T>,
  raw: string,
): T {
  const obj = yamlParse(raw) as unknown
  return def.schema.parse(obj)
}
